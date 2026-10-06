import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const cliPath = new URL("../src/benchmark-cli.js", import.meta.url);
const cliFilePath = decodeURIComponent(cliPath.pathname).replace(/^\/([A-Za-z]:)/u, "$1");

function runCli(args: string[]): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.argv[0] ?? "node", [cliFilePath, ...args], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? -1, stderr }));
  });
}

test("benchmark CLI rejects duplicate dataset, split, and manifest options", async () => {
  const cases = [
    {
      args: ["--validate", "--format", "json", "--dataset", "benchmarks/test.jsonl", "--dataset", "benchmarks/test.jsonl"],
      option: "--dataset",
    },
    {
      args: ["--validate", "--format", "json", "--split", "test", "--split", "test"],
      option: "--split",
    },
    {
      args: ["--validate", "--format", "json", "--manifest", "benchmarks/MANIFEST.json", "--manifest", "benchmarks/MANIFEST.json"],
      option: "--manifest",
    },
  ];

  for (const testCase of cases) {
    const result = await runCli(testCase.args);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, new RegExp(`${testCase.option} may only be specified once`));
  }
});
