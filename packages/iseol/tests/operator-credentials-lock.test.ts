import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootstrapOperatorCredential,
  operatorCredentialPath,
  readOperatorCredential,
  type CredentialCrypto,
} from "../src/runtime/operator-credentials.js";
import { withDurableOperatorCredentialLock } from "../src/runtime/operator-credential-lock.js";

test("concurrent operator credential bootstrap has one durable winner", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-credential-lock-"));
  const path = operatorCredentialPath(root);
  const crypto: CredentialCrypto = {
    protect: async (value) => {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      return `protected:${Buffer.from(value, "utf8").toString("base64")}`;
    },
    unprotect: async (value) => Buffer.from(value.slice("protected:".length), "base64").toString("utf8"),
    userSid: async () => "S-1-5-21-test",
  };

  const attempts = await Promise.allSettled([
    bootstrapOperatorCredential({ path, operatorId: "operator-1", crypto }),
    bootstrapOperatorCredential({ path, operatorId: "operator-1", crypto }),
  ]);

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  assert.match(String(attempts.find((result) => result.status === "rejected")?.reason), /already exists|concurrency/i);
  assert.equal((await readOperatorCredential(path))?.operatorId, "operator-1");
});

test("operator credential reads wait for the durable credential lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-credential-read-lock-"));
  const path = operatorCredentialPath(root);
  const crypto: CredentialCrypto = {
    protect: async (value) => `protected:${Buffer.from(value, "utf8").toString("base64")}`,
    unprotect: async (value) => Buffer.from(value.slice("protected:".length), "base64").toString("utf8"),
    userSid: async () => "S-1-5-21-test",
  };
  await bootstrapOperatorCredential({ path, operatorId: "operator-1", crypto });
  const expected = await readOperatorCredential(path);

  let settled = false;
  let readPromise: Promise<Awaited<ReturnType<typeof readOperatorCredential>>> | undefined;
  const lockPromise = withDurableOperatorCredentialLock(
    path,
    async () => {
      readPromise = readOperatorCredential(path);
      readPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await lockPromise;

  assert.deepEqual(await readPromise!, expected);
});
