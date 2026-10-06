import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const cliPath = new URL("../src/cli.js", import.meta.url);
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

test("claimlatch CLI rejects duplicate value options", async () => {
  const cases = [
    {
      args: ["--question", "first", "--question", "second", "--answer", "answer"],
      option: "--question",
    },
    {
      args: ["--question", "question", "--answer", "first", "-a", "second"],
      option: "--answer",
    },
    {
      args: ["--question", "question", "--answer-file", "first.txt", "--answer-file", "second.txt"],
      option: "--answer-file",
    },
    {
      args: ["--question", "question", "--answer", "answer", "--minimum-coverage", "0.5", "--minimum-coverage", "0.8"],
      option: "--minimum-coverage",
    },
    {
      args: ["--question", "question", "--answer", "answer", "--allow-unsupported", "1", "--allow-unsupported", "2"],
      option: "--allow-unsupported",
    },
    {
      args: ["--question", "question", "--answer", "answer", "--allow-unverifiable", "1", "--allow-unverifiable", "2"],
      option: "--allow-unverifiable",
    },
  ];

  for (const testCase of cases) {
    const result = await runCli(testCase.args);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, new RegExp(`${testCase.option} may only be specified once`));
  }
});
