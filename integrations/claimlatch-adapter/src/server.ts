import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import type {
  ClaimLatchReport,
  StructuredVerificationResult,
  TextVerificationInput,
  TextVerificationResult,
} from "./contracts.js";
import { verifyStructuredAction } from "./structured-output-verifier.js";

export type TextVerificationHandler = (
  input: TextVerificationInput,
) => Promise<TextVerificationResult>;

export type ClaimLatchLike = {
  verify(input: { question: string; answer: string }): Promise<ClaimLatchReport>;
};

export type ClaimLatchAdapterServer = {
  listen(port: number, host?: string): Promise<string>;
  close(): Promise<void>;
};

export function createClaimLatchAdapterServer(options: {
  verifyText?: TextVerificationHandler;
  claimLatch?: ClaimLatchLike;
  verifyStructured?: (payload: unknown) => StructuredVerificationResult;
  maxBodyBytes?: number;
}): ClaimLatchAdapterServer {
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  const verifyText = options.verifyText ?? (
    options.claimLatch ? createClaimLatchTextHandler(options.claimLatch) : undefined
  );
  if (!verifyText) throw new Error("A ClaimLatch text verifier is required");
  const server = createServer(async (request, response) => {
    try {
      await route(request, response, verifyText, options.verifyStructured, maxBodyBytes);
    } catch (error) {
      writeJson(response, 502, {
        decision: "BLOCK",
        error: "ClaimLatch adapter verification failed",
        detail: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  return {
    listen(port, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.removeListener("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("ClaimLatch adapter did not expose a TCP address"));
            return;
          }
          resolve("http://" + host + ":" + address.port);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  verifyText: TextVerificationHandler,
  verifyStructured: ((payload: unknown) => StructuredVerificationResult) | undefined,
  maxBodyBytes: number,
): Promise<void> {
  if (request.method === "POST" && request.url === "/v1/verify-structured") {
    if (!verifyStructured) {
      writeJson(response, 404, { error: "structured_verifier_not_configured" });
      return;
    }
    const payload = await readJson(request, maxBodyBytes);
    const result = verifyStructured(payload);
    writeJson(response, result.decision === "PASS" ? 200 : 422, result);
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/verify") {
    writeJson(response, 404, { error: "not_found" });
    return;
  }

  const payload = await readJson(request, maxBodyBytes);
  if (!isTextVerificationInput(payload)) {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  try {
    const result = await verifyText(payload);
    const decision = result.report.passed ? "PASS" : "BLOCK";
    const envelope = toVerificationEnvelope(payload, result, decision);
    if (decision === "BLOCK") {
      writeJson(response, 422, envelope);
      return;
    }
    writeJson(response, 200, envelope);
  } catch (error) {
    writeJson(response, 502, {
      decision: "BLOCK",
      error: "verification_failed",
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
}

async function readJson(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isTextVerificationInput(value: unknown): value is TextVerificationInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return ["subjectId", "projectId", "projectRevision", "subjectType", "question", "draft"].every(
    (field) => typeof input[field] === "string" && input[field] !== "",
  );
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

export function createClaimLatchTextHandler(gate: ClaimLatchLike): TextVerificationHandler {
  return async (input) => {
    const report = await gate.verify({
      question: input.question,
      answer: input.draft,
    });
    const reportId = "claimlatch-" + createHash("sha256")
      .update(JSON.stringify(report))
      .digest("hex")
      .slice(0, 16);
    return {
      answer: input.draft,
      report,
      claimLatchReportId: reportId,
      receiptId: null,
    };
  };
}

function toVerificationEnvelope(
  input: TextVerificationInput,
  result: TextVerificationResult,
  decision: "PASS" | "BLOCK",
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    subjectId: input.subjectId,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    subjectType: input.subjectType,
    claims: result.report.claims,
    evidence: [],
    deterministicChecks: result.report.violations.map((violation) => ({
      name: violation.code,
      status: decision,
      reason: violation.message,
    })),
    decision,
    claimLatchReportId: result.claimLatchReportId,
    receiptId: result.receiptId,
    createdAt: result.report.generatedAt,
  };
}
