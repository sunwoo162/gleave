import { createHash } from "node:crypto";

export type EvidenceInput = {
  checkId: string;
  command: string;
  exitStatus: number;
  stdout?: string;
  stderr?: string;
  workspace: string;
  revision: string;
  artifactPaths?: string[];
  verificationIds?: string[];
  createdAt?: string;
};

export type EvidenceRecord = {
  id: string;
  checkId: string;
  command: string;
  exitStatus: number;
  stdoutHash: string;
  stderrHash: string;
  workspace: string;
  revision: string;
  artifactPaths: string[];
  verificationIds: string[];
  createdAt: string;
};

export class EvidenceLedger {
  private readonly records = new Map<string, EvidenceRecord>();
  private readonly now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  record(input: EvidenceInput): string {
    if (!input.checkId.trim() || !input.command.trim()) throw new Error("evidence checkId and command are required");
    if (!input.workspace.trim() || !input.revision.trim()) throw new Error("evidence workspace and revision are required");
    const recordWithoutId = {
      ...input,
      checkId: input.checkId.trim(),
      command: input.command.trim(),
      workspace: input.workspace.trim(),
      revision: input.revision.trim(),
      stdoutHash: hash(input.stdout ?? ""),
      stderrHash: hash(input.stderr ?? ""),
      artifactPaths: [...(input.artifactPaths ?? [])].map((path) => path.trim()).filter(Boolean),
      verificationIds: [...(input.verificationIds ?? [])].map((id) => id.trim()).filter(Boolean),
      createdAt: input.createdAt ?? this.now(),
    };
    const id = "evidence-" + hash(JSON.stringify(recordWithoutId)).slice(0, 24);
    this.records.set(id, { id, ...recordWithoutId });
    return id;
  }

  get(id: string): EvidenceRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Evidence not found: ${id}`);
    return record;
  }

  list(): EvidenceRecord[] {
    return [...this.records.values()];
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
