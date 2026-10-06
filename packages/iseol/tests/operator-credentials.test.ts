import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapOperatorCredential, classifyPowerShellDpapiFailure, encodePowerShellCommand, isValidDpapiCiphertext, operatorCredentialPath, readOperatorCredential, rotateOperatorCredential, verifyOperatorCredential, type CredentialCrypto } from "../src/runtime/operator-credentials.js";

function cryptoFixture(): CredentialCrypto {
  return {
    protect: async (value) => `protected:${Buffer.from(value, "utf8").toString("base64")}`,
    unprotect: async (value) => Buffer.from(value.slice("protected:".length), "base64").toString("utf8"),
    userSid: async () => "S-1-5-21-test",
  };
}

test("PowerShell DPAPI scripts are passed through encoded command input", () => {
  const script = "$s = ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force";
  assert.equal(Buffer.from(encodePowerShellCommand(script), "base64").toString("utf16le"), script);
});

test("DPAPI output validation rejects CLIXML, errors, and empty ciphertext", () => {
  assert.equal(isValidDpapiCiphertext("#< CLIXML"), false);
  assert.equal(isValidDpapiCiphertext(""), false);
  assert.equal(isValidDpapiCiphertext("not-a-ciphertext"), false);
  assert.equal(isValidDpapiCiphertext("0".repeat(128)), true);
  assert.equal(isValidDpapiCiphertext("dpapi:v1:YWJjZA=="), true);
  assert.equal(isValidDpapiCiphertext("dpapi:v1:not base64"), false);
});

test("PowerShell DPAPI failures expose only a safe phase classification", () => {
  assert.equal(classifyPowerShellDpapiFailure(1, "", "#< CLIXML\n<S S=\"Error\">CouldNotAutoloadMatchingModule</S>"), "module-load");
  assert.equal(classifyPowerShellDpapiFailure(1, "", "CommandNotFoundException"), "cmdlet-resolution");
  assert.equal(classifyPowerShellDpapiFailure(1, "", "<S S=\"Error\">DPAPI failed</S>"), "powershell-error");
  assert.equal(classifyPowerShellDpapiFailure(1, "", "benign diagnostic"), "child-exit");
  assert.equal(classifyPowerShellDpapiFailure(0, "", ""), "empty-output");
  assert.equal(classifyPowerShellDpapiFailure(0, "ciphertext", "#< CLIXML progress"), undefined);
});

test("operator bootstrap stores only protected credential material and verifies the Windows identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-"));
  const path = operatorCredentialPath(root);
  const crypto = cryptoFixture();
  const created = await bootstrapOperatorCredential({ path, operatorId: "operator-1", now: "2026-09-20T00:00:00.000Z", crypto });
  assert.equal(created.operatorId, "operator-1");
  const raw = await readFile(path, "utf8");
  assert.equal(raw.includes("protected:"), true);
  assert.equal(raw.includes("operator-1"), true);
  assert.equal(await verifyOperatorCredential({ path, operatorId: "operator-1", crypto }), true);
  assert.equal(await verifyOperatorCredential({ path, operatorId: "other", crypto }), false);
  assert.equal(await verifyOperatorCredential({ path, operatorId: "operator-1", token: "wrong", crypto }), false);
});

test("Windows child PowerShell DPAPI round trip works through the production spawn path", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-dpapi-"));
  const path = operatorCredentialPath(root);
  const crypto = undefined;
  await bootstrapOperatorCredential({ path, operatorId: "isolated-windows-operator", crypto });
  const record = await readOperatorCredential(path);
  assert.equal(record?.operatorId, "isolated-windows-operator");
  assert.equal(Boolean(record?.protectedToken), true);
  assert.equal(await verifyOperatorCredential({ path, operatorId: "isolated-windows-operator" }), true);
});

test("operator bootstrap is one-time and rotation replaces the protected credential without exposing a token", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-"));
  const path = operatorCredentialPath(root);
  const crypto = cryptoFixture();
  await bootstrapOperatorCredential({ path, operatorId: "operator-1", now: "2026-09-20T00:00:00.000Z", crypto });
  await assert.rejects(() => bootstrapOperatorCredential({ path, operatorId: "operator-1", crypto }), /already exists/);
  await rotateOperatorCredential({ path, operatorId: "operator-1", now: "2026-09-20T01:00:00.000Z", crypto });
  const record = await readOperatorCredential(path);
  assert.equal(record?.rotatedAt, "2026-09-20T01:00:00.000Z");
  assert.equal(record?.protectedToken.includes("protected:"), true);
});

test("operator bootstrap does not create a credential when protection fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-failed-"));
  const path = operatorCredentialPath(root);
  const crypto: CredentialCrypto = { ...cryptoFixture(), protect: async () => { throw new Error("PowerShell DPAPI protect failed: module-load"); } };
  await assert.rejects(() => bootstrapOperatorCredential({ path, operatorId: "operator-1", crypto }), /module-load/);
  assert.equal(await readOperatorCredential(path), undefined);
});

test("rotation is bound to the Windows identity that performed bootstrap", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-"));
  const path = operatorCredentialPath(root);
  const crypto = cryptoFixture();
  await bootstrapOperatorCredential({ path, operatorId: "operator-1", crypto });
  const otherIdentity = { ...crypto, userSid: async () => "S-1-5-21-other" };
  await assert.rejects(() => rotateOperatorCredential({ path, operatorId: "operator-2", crypto: otherIdentity }), /registered Windows identity/);
});
