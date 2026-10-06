import { randomBytes } from "node:crypto";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableOperatorCredentialLock } from "./operator-credential-lock.js";

const execFile = promisify(execFileCallback);

export type OperatorCredentialRecord = {
  version: 1;
  operatorId: string;
  userSid: string;
  protectedToken: string;
  createdAt: string;
  rotatedAt: string;
};

export type CredentialCrypto = {
  protect: (value: string) => Promise<string>;
  unprotect: (value: string) => Promise<string>;
  userSid: () => Promise<string>;
};

export function operatorCredentialPath(dataRoot: string): string {
  return resolve(dataRoot, "runtime", "operator-credential.json");
}

export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function isValidDpapiCiphertext(value: string): boolean {
  const trimmed = value.trim();
  if (/^dpapi:v1:[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return true;
  return /^[0-9a-f]{100,}$/i.test(trimmed);
}

export type PowerShellDpapiFailure = "module-load" | "cmdlet-resolution" | "powershell-error" | "child-exit" | "empty-output";

export function classifyPowerShellDpapiFailure(code: number | null, stdout: string, stderr: string): PowerShellDpapiFailure | undefined {
  const combined = `${stdout}\n${stderr}`;
  if (/CouldNotAutoloadMatchingModule/i.test(combined)) return "module-load";
  if (/CommandNotFoundException/i.test(combined)) return "cmdlet-resolution";
  if (/<S S="Error">/i.test(combined)) return "powershell-error";
  if (code !== 0) return "child-exit";
  if (!stdout.trim()) return "empty-output";
  return undefined;
}

async function powershell(script: string, input: string, phase: "protect" | "unprotect"): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const encodedCommand = encodePowerShellCommand(script);
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => {
      const output = stdout.trim();
      const diagnostic = stderr.trim();
      const failure = classifyPowerShellDpapiFailure(code, output, diagnostic);
      if (failure) {
        reject(new Error(`PowerShell DPAPI ${phase} failed: ${failure}${failure === "child-exit" ? ` (exit ${code})` : ""}`));
        return;
      }
      resolveOutput(output);
    });
    child.stdin.end(input, "utf8");
  });
}

const dpapiCrypto: CredentialCrypto = {
  async protect(value) {
    if (process.platform !== "win32") throw new Error("operator credential protection requires Windows DPAPI");
    const encrypted = await powershell("$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; Add-Type -AssemblyName System.Security -ErrorAction Stop; $bytes = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); 'dpapi:v1:' + [Convert]::ToBase64String($protected)", value, "protect");
    if (!isValidDpapiCiphertext(encrypted)) throw new Error("PowerShell DPAPI protect returned invalid ciphertext");
    return encrypted;
  },
  async unprotect(value) {
    if (process.platform !== "win32") throw new Error("operator credential protection requires Windows DPAPI");
    const plaintext = await powershell("$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; $encoded = [Console]::In.ReadToEnd().Trim(); if ($encoded.StartsWith('dpapi:v1:')) { Add-Type -AssemblyName System.Security -ErrorAction Stop; $protected = [Convert]::FromBase64String($encoded.Substring(9)); $bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Text.Encoding]::UTF8.GetString($bytes) } else { Import-Module Microsoft.PowerShell.Security -ErrorAction Stop; $s = ConvertTo-SecureString $encoded; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } }", value, "unprotect");
    if (!plaintext || plaintext.startsWith("#< CLIXML")) throw new Error("PowerShell DPAPI unprotect returned invalid plaintext");
    return plaintext;
  },
  async userSid() {
    if (process.platform !== "win32") throw new Error("operator credential identity requires Windows");
    const output = await execFile("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
    const match = /S-\d-\d+-(?:\d+-){1,14}\d+/.exec(output.stdout);
    if (!match) throw new Error("Windows user SID could not be determined");
    return match[0];
  },
};

async function saveRecord(path: string, record: OperatorCredentialRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readOperatorCredentialUnlocked(path: string): Promise<OperatorCredentialRecord | undefined> {
  try {
    const record = JSON.parse(await readFile(path, "utf8")) as Partial<OperatorCredentialRecord>;
    if (record.version !== 1 || typeof record.operatorId !== "string" || typeof record.userSid !== "string" || typeof record.protectedToken !== "string") throw new Error("invalid operator credential record");
    return record as OperatorCredentialRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readOperatorCredential(path: string): Promise<OperatorCredentialRecord | undefined> {
  return withDurableOperatorCredentialLock(path, () => readOperatorCredentialUnlocked(path), { waitForMs: 2_000 });
}

export async function bootstrapOperatorCredential(input: { path: string; operatorId: string; now?: string; crypto?: CredentialCrypto }): Promise<{ path: string; operatorId: string }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.operatorId)) throw new Error("operatorId must be a bounded identifier");
  const crypto = input.crypto ?? dpapiCrypto;
  return withDurableOperatorCredentialLock(input.path, async () => {
    if (await readOperatorCredentialUnlocked(input.path)) throw new Error("operator credential already exists; use rotate");
    const now = input.now ?? new Date().toISOString();
    const token = randomBytes(32).toString("base64url");
    const record: OperatorCredentialRecord = { version: 1, operatorId: input.operatorId, userSid: await crypto.userSid(), protectedToken: await crypto.protect(token), createdAt: now, rotatedAt: now };
    await saveRecord(input.path, record);
    return { path: input.path, operatorId: record.operatorId };
  }, { waitForMs: 2_000 });
}

export async function rotateOperatorCredential(input: { path: string; operatorId: string; now?: string; crypto?: CredentialCrypto }): Promise<{ path: string; operatorId: string }> {
  const crypto = input.crypto ?? dpapiCrypto;
  return withDurableOperatorCredentialLock(input.path, async () => {
    const previous = await readOperatorCredentialUnlocked(input.path);
    if (!previous) throw new Error("operator credential is not bootstrapped");
    if (previous.userSid !== await crypto.userSid()) throw new Error("operator credential rotation requires the registered Windows identity");
    const now = input.now ?? new Date().toISOString();
    const token = randomBytes(32).toString("base64url");
    const record: OperatorCredentialRecord = { version: 1, operatorId: input.operatorId, userSid: await crypto.userSid(), protectedToken: await crypto.protect(token), createdAt: previous.createdAt, rotatedAt: now };
    await saveRecord(input.path, record);
    return { path: input.path, operatorId: record.operatorId };
  }, { waitForMs: 2_000 });
}

export async function verifyOperatorCredential(input: { path: string; operatorId: string; token?: string; crypto?: CredentialCrypto }): Promise<boolean> {
  const crypto = input.crypto ?? dpapiCrypto;
  return withDurableOperatorCredentialLock(input.path, async () => {
    const record = await readOperatorCredentialUnlocked(input.path);
    if (!record || record.operatorId !== input.operatorId) return false;
    if (record.userSid !== await crypto.userSid()) return false;
    if (input.token === undefined) return true;
    return (await crypto.unprotect(record.protectedToken)) === input.token;
  }, { waitForMs: 2_000 });
}
