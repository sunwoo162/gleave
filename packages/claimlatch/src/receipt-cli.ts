#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseReceiptCliArguments, renderReceiptHelp } from "./receipt-cli-options.js";
import { renderReceiptVerificationJson } from "./receipt-cli-output.js";
import { hashVerificationReceiptPayload, verifySignedVerificationReceipt } from "./receipt.js";
import type { SignedVerificationReceipt } from "./types.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(renderReceiptHelp());
    return;
  }

  const { filePath, publicKeyPath, json } = parseReceiptCliArguments(argv);
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as SignedVerificationReceipt;
  const publicKeyPem = publicKeyPath ? await readFile(publicKeyPath, "utf8") : undefined;
  const valid = verifySignedVerificationReceipt(parsed, publicKeyPem ? { publicKeyPem } : {});
  if (json) {
    process.stdout.write(`${renderReceiptVerificationJson({
      valid,
      filePath,
      receipt: parsed,
      ...(publicKeyPath ? { publicKeyPath } : {}),
      ...(valid ? { payloadSha256: hashVerificationReceiptPayload(parsed.payload) } : {}),
    })}\n`);
  } else {
    process.stdout.write(`Receipt ${valid ? "valid" : "invalid"}: ${filePath}\n`);
  }
  process.exitCode = valid ? 0 : 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`claimlatch-receipt: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
