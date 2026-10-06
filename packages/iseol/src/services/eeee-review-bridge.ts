export type EeeeReviewEvidence = {
  projectId: string;
  projectRevision: string;
  repository: string;
  pullNumber: number;
  headSha: string;
  reviewStatus: "passed" | "warned" | "failed";
  findingsCount: number;
  checks: Array<Record<string, unknown>>;
  source: "iseol-github-review";
  generatedAt: string;
};

export type EeeeReviewIngestionResponse = {
  status: "accepted" | "duplicate" | "blocked";
  reason?: string;
};

export class EeeeReviewBridge {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly token = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (!this.baseUrl) throw new Error("EEEE bridge URL이 필요합니다.");
  }

  async ingest(evidence: EeeeReviewEvidence): Promise<EeeeReviewIngestionResponse> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.token) headers["X-Gleave-Bridge-Token"] = this.token;
    const response = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(evidence.projectId)}/evidence/github-review`,
      { method: "POST", headers, body: JSON.stringify({ schemaVersion: 1, ...evidence }) },
    );
    const body = await response.text();
    let payload: unknown;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const reason = typeof payload === "object" && payload !== null && "detail" in payload
        ? String((payload as { detail?: unknown }).detail ?? response.statusText)
        : response.statusText;
      throw new Error(`EEEE review bridge failed (${response.status}): ${reason}`);
    }
    if (typeof payload !== "object" || payload === null || !["accepted", "duplicate", "blocked"].includes(String((payload as { status?: unknown }).status))) {
      throw new Error("EEEE review bridge returned an invalid ingestion response");
    }
    return payload as EeeeReviewIngestionResponse;
  }
}
