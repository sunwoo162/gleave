import { inflateRawSync } from "node:zlib";
import { ciReviewArtifactSchema, type CiReviewArtifact } from "./ci-review-types.js";

export type IseolWorkflowRun = {
  id: number;
  name: string;
  headSha: string;
  status: string;
  conclusion: string | null;
};

export type IseolReviewRunState =
  | { state: "missing" }
  | { state: "pending"; runId: number }
  | { state: "completed"; runId: number; conclusion: string | null };

export function selectIseolReviewRun(runs: IseolWorkflowRun[], headSha: string): IseolReviewRunState {
  const matches = runs
    .filter((run) => run.name === "Iseol Code Review" && run.headSha === headSha)
    .sort((a, b) => b.id - a.id);
  const latest = matches[0];
  if (!latest) return { state: "missing" };
  if (latest.status !== "completed") return { state: "pending", runId: latest.id };
  return { state: "completed", runId: latest.id, conclusion: latest.conclusion };
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const signature = 0x06054b50;
  const lowerBound = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= lowerBound; offset -= 1) {
    if (zip.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error("Iseol review artifact ZIP의 central directory를 찾을 수 없습니다.");
}

function extractZipEntry(zip: Buffer, suffix: string): Buffer {
  const eocd = findEndOfCentralDirectory(zip);
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  for (let index = 0; index < entries; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("Iseol review artifact ZIP central directory가 손상되었습니다.");
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const filenameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const filename = zip.subarray(offset + 46, offset + 46 + filenameLength).toString("utf8");

    if (filename.endsWith(suffix)) {
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Iseol review artifact ZIP local header가 손상되었습니다.");
      const localFilenameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localFilenameLength + localExtraLength;
      const compressed = zip.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`지원하지 않는 Iseol review artifact ZIP 압축 방식입니다: ${method}`);
    }

    offset += 46 + filenameLength + extraLength + commentLength;
  }

  throw new Error(`Iseol review artifact에서 ${suffix} 파일을 찾을 수 없습니다.`);
}

export function extractIseolReviewArtifactFromZip(zip: Buffer): CiReviewArtifact {
  const json = extractZipEntry(zip, "iseol-review.json").toString("utf8");
  return ciReviewArtifactSchema.parse(JSON.parse(json));
}

export function validateCiArtifactForPull(
  artifact: CiReviewArtifact,
  repository: string,
  pullNumber: number,
  headSha: string,
): void {
  if (artifact.repository.toLowerCase() !== repository.toLowerCase()) {
    throw new Error(`Iseol review artifact 저장소가 일치하지 않습니다: ${artifact.repository}`);
  }
  if (artifact.pullNumber !== pullNumber) {
    throw new Error(`Iseol review artifact PR 번호가 일치하지 않습니다: #${artifact.pullNumber}`);
  }
  if (artifact.headSha !== headSha) {
    throw new Error(`Iseol review artifact HEAD SHA가 일치하지 않습니다: ${artifact.headSha}`);
  }
}
