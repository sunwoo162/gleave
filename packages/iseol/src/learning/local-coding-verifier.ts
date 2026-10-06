import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import type { CodingAttemptVerifier, CodingPracticeResult } from "./contracts.js";

const execFileAsync = promisify(execFile);
const MAX_SOURCE_BYTES = 100_000;
const MAX_DIAGNOSTIC_CHARS = 2_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const SUPPORTED_LANGUAGES = new Set(["javascript", "js", "mjs", "cjs"]);

export type LocalCodingSyntaxVerifierOptions = { timeoutMs?: number };

function timeoutMs(value: number | undefined): number {
  const resolved = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > MAX_TIMEOUT_MS) throw new Error("Local coding verifier timeout is invalid");
  return resolved;
}

function diagnostic(value: unknown, root: string, fileName: string): string[] {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const sanitized = raw.replaceAll(root, "<sandbox>").replaceAll(fileName, "<answer>").trim();
  if (!sanitized) return [];
  return [sanitized.slice(0, MAX_DIAGNOSTIC_CHARS)];
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_OPTIONS: "",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
  };
}

export function createLocalCodingSyntaxVerifier(options: LocalCodingSyntaxVerifierOptions = {}): CodingAttemptVerifier {
  const limit = timeoutMs(options.timeoutMs);
  return async (request) => {
    const language = request.exercise.language.trim().toLowerCase();
    if (!SUPPORTED_LANGUAGES.has(language)) return { status: "waiting", blocker: "local syntax verifier supports JavaScript only" };
    if (Buffer.byteLength(request.attempt.response, "utf8") > MAX_SOURCE_BYTES) return { status: "waiting", blocker: "coding answer is too large for the local syntax verifier" };

    const root = await mkdtemp(join(tmpdir(), "iseol-coding-syntax-"));
    const extension = language === "mjs" ? "mjs" : language === "cjs" ? "cjs" : "js";
    const fileName = `answer.${extension}`;
    const filePath = join(root, fileName);
    try {
      await writeFile(filePath, request.attempt.response, { encoding: "utf8", mode: 0o600 });
      try {
        await execFileAsync(process.execPath, ["--check", filePath], {
          cwd: root,
          env: minimalEnvironment(),
          shell: false,
          windowsHide: true,
          timeout: limit,
          maxBuffer: MAX_DIAGNOSTIC_CHARS * 2,
        });
        const practiceResult: CodingPracticeResult = {
          status: "syntax-verified",
          artifactRefs: [`coding-syntax:${request.attempt.id}`],
          executorId: "local-syntax-verifier",
          policyRef: "local-syntax-verifier-v1",
          receipt: { checkKind: "syntax-only", passed: true, diagnostics: [] },
        };
        return { status: "completed", attempt: await request.complete(practiceResult) };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException & { killed?: boolean; stdout?: string; stderr?: string }).code;
        if (code === "ETIMEDOUT" || (error as { killed?: boolean }).killed) return { status: "waiting", blocker: "local syntax verifier timed out" };
        const typed = error as { stdout?: unknown; stderr?: unknown; code?: unknown };
        const diagnostics = [...diagnostic(typed.stderr, root, fileName), ...diagnostic(typed.stdout, root, fileName)].slice(0, 2);
        const practiceResult: CodingPracticeResult = {
          status: "syntax-invalid",
          artifactRefs: [`coding-syntax:${request.attempt.id}`],
          executorId: "local-syntax-verifier",
          policyRef: "local-syntax-verifier-v1",
          receipt: { checkKind: "syntax-only", passed: false, diagnostics, ...(typeof typed.code === "number" ? { exitCode: typed.code } : {}) },
        };
        return { status: "completed", attempt: await request.complete(practiceResult) };
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };
}
