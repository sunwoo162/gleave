import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HarnessPolicySnapshot, HarnessPolicySource } from "./contracts.js";

export type ResolveHarnessPolicyInput = {
  iseolRoot: string;
  targetRoot: string;
  loadedAt?: string;
};

function digest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function readOptionalSource(
  kind: HarnessPolicySource["kind"],
  path: string,
): Promise<HarnessPolicySource | null> {
  try {
    const content = await readFile(path, "utf8");
    return { kind, path, sha256: digest(content), content };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function resolveHarnessPolicy(
  input: ResolveHarnessPolicyInput,
): Promise<HarnessPolicySnapshot> {
  const globalPath = resolve(input.iseolRoot, "docs", "HARNESS_ENGINEERING.md");
  const globalSource = await readOptionalSource("iseol-global", globalPath);

  if (!globalSource) {
    throw new Error(`Iseol global HARNESS_ENGINEERING.md is required: ${globalPath}`);
  }

  const sources: HarnessPolicySource[] = [globalSource];
  const projectHarness = await readOptionalSource(
    "project-harness",
    resolve(input.targetRoot, "docs", "HARNESS_ENGINEERING.md"),
  );
  if (projectHarness) sources.push(projectHarness);

  const projectAgents = await readOptionalSource(
    "project-agents",
    resolve(input.targetRoot, "AGENTS.md"),
  );
  if (projectAgents) sources.push(projectAgents);

  const effectiveSha256 = digest(
    sources
      .map((source) => `${source.kind}\n${source.path}\n${source.sha256}`)
      .join("\n---\n"),
  );

  return {
    version: 1,
    loadedAt: input.loadedAt ?? new Date().toISOString(),
    sources,
    effectiveSha256,
  };
}
