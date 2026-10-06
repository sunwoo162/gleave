import type {
  PrototypeDeployAdapter,
  PrototypeDeployRequest,
  PrototypeDeploymentReceipt,
} from "./deploy-adapter.js";
import { parseGitHubRepository } from "../services/github.js";
import { assertCheckHttpUrl } from "../desktop-agent/contracts.js";

type FetchLike = typeof fetch;
type EnvLike = Record<string, string | undefined>;

export type VercelPrototypeDeployAdapterOptions = {
  token: string;
  projectId: string;
  teamId?: string;  fetch?: FetchLike;
  now?: () => string;};

type VercelDeployment = {
  id?: string;
  uid?: string;
  url?: string | null;
  state?: string;
  status?: string;
  readyState?: string;
  createdAt?: number;
  meta?: Record<string, unknown>;
};

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function apiUrl(path: string, teamId?: string, params: Record<string, string> = {}): URL {
  const url = new URL(path, "https://api.vercel.com");
  if (teamId?.trim()) url.searchParams.set("teamId", teamId.trim());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function jsonOrThrow<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) throw new Error(`Vercel ${operation} failed with status ${response.status}`);
  return await response.json() as T;
}

function deploymentId(value: VercelDeployment): string {
  const id = value.id ?? value.uid;
  if (!id?.trim()) throw new Error("Vercel deployment response is missing an id");
  return id.trim();
}

function deploymentUrl(value: VercelDeployment): string {
  const rawUrl = value.url;
  const url = rawUrl?.trim();
  if (!url) throw new Error("Vercel deployment response is missing a URL");
  if (rawUrl !== url || /[\u0000-\u001f\u007f]/.test(rawUrl) || url.startsWith("//")) {
    throw new Error("Vercel deployment response contains an invalid URL");
  }
  const completeHttpUrl = /^https?:\/\//i.test(url);
  if (!completeHttpUrl && /^[A-Za-z][A-Za-z\d+.-]*:/.test(url)) {
    throw new Error("Vercel deployment response contains an invalid URL");
  }
  if (/%(?![0-9a-f]{2})/i.test(url)) {
    throw new Error("Vercel deployment response contains an invalid URL");
  }
  const normalized = completeHttpUrl ? url : `https://${url}`;
  try {
    assertCheckHttpUrl(normalized);
  } catch {
    throw new Error("Vercel deployment response contains an invalid URL");
  }
  return normalized;
}
function deployedAt(value: VercelDeployment, now: () => string): string {
  if (typeof value.createdAt === "number" && Number.isFinite(value.createdAt)) {
    return new Date(value.createdAt).toISOString();
  }
  return now();
}

function metadata(input: PrototypeDeployRequest): Record<string, string> {
  return {
    iseolDeploymentKey: input.key,
    iseolCampaignId: input.campaignId,
    iseolProductionId: input.productionId,
    iseolCommitSha: input.commitSha,
    iseolBranch: input.branch,
  };
}

function matchesIdentity(value: VercelDeployment, input: PrototypeDeployRequest): boolean {
  const meta = value.meta ?? {};
  return meta.iseolDeploymentKey === input.key
    && meta.iseolProductionId === input.productionId
    && meta.iseolCommitSha === input.commitSha;
}

function receipt(value: VercelDeployment, input: PrototypeDeployRequest, now: () => string): PrototypeDeploymentReceipt {
  return {
    provider: "vercel",
    deploymentId: deploymentId(value),
    url: deploymentUrl(value),
    commitSha: input.commitSha,
    deployedAt: deployedAt(value, now),
  };
}
function githubOwnerRepo(repositoryUrl: string): { owner: string; repo: string } {
  const raw = repositoryUrl.trim();
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error("Idea Lab Vercel deployment requires a GitHub repository URL");
  }
  try {
    const parsed = parseGitHubRepository(raw);
    return { owner: parsed.owner, repo: parsed.repo };
  } catch {
    throw new Error("Idea Lab Vercel deployment GitHub repository URL is invalid");
  }
}

export function createVercelPrototypeDeployAdapter(
  options: VercelPrototypeDeployAdapterOptions,
): PrototypeDeployAdapter {
  const token = nonEmpty(options.token, "VERCEL_TOKEN");
  const projectId = nonEmpty(options.projectId, "ISEOL_VERCEL_PROJECT_ID");
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function reconcile(input: PrototypeDeployRequest): Promise<PrototypeDeploymentReceipt | null> {
    githubOwnerRepo(input.repositoryUrl);
    let until: number | undefined;
    const seenCursors = new Set<number>();
    for (let page = 0; page < 1_000; page += 1) {
      const url = apiUrl("/v6/deployments", options.teamId, {
        projectId,
        limit: "100",
        sha: input.commitSha,
        ...(until === undefined ? {} : { until: String(until) }),
      });
      const response = await fetchImpl(url, { headers });
      const body = await jsonOrThrow<{
        deployments?: VercelDeployment[];
        pagination?: { next?: number | null };
      }>(response, "deployment reconciliation");
      const deployments = body.deployments ?? [];
      const matching = deployments.filter((item) => matchesIdentity(item, input));
      if (matching.length > 1) throw new Error("Vercel deployment identity is ambiguous");
      if (matching[0]) return receipt(matching[0], input, now);
      if (deployments.length === 0) return null;
      const next = body.pagination?.next;
      if (typeof next !== "number" || !Number.isFinite(next) || next <= 0) return null;
      if (seenCursors.has(next)) throw new Error("Vercel deployment pagination cycle detected");
      seenCursors.add(next);
      until = next;
    }
    throw new Error("Vercel deployment reconciliation exceeded pagination limit");
  }
  async function deploy(input: PrototypeDeployRequest): Promise<PrototypeDeploymentReceipt> {
    const repository = githubOwnerRepo(input.repositoryUrl);
    const response = await fetchImpl(apiUrl("/v13/deployments", options.teamId), {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `iseol-${input.productionId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80),
        project: projectId,
        target: "preview",
        gitSource: {
          type: "github",
          org: repository.owner,
          repo: repository.repo,
          ref: input.branch,
          sha: input.commitSha,
        },
        meta: metadata(input),
      }),
    });
    const value = await jsonOrThrow<VercelDeployment>(response, "deployment creation");
    return receipt(value, input, now);
  }

  async function verify(
    input: PrototypeDeployRequest & { deployment: PrototypeDeploymentReceipt },
  ): Promise<PrototypeDeploymentReceipt> {
    githubOwnerRepo(input.repositoryUrl);
    const response = await fetchImpl(
      apiUrl(`/v13/deployments/${encodeURIComponent(input.deployment.deploymentId)}`, options.teamId),
      { headers },
    );
    const value = await jsonOrThrow<VercelDeployment>(response, "deployment verification");
    if (!matchesIdentity(value, input)) throw new Error("Vercel deployment verification identity mismatch");
    if (deploymentId(value) !== input.deployment.deploymentId) {
      throw new Error("Vercel deployment verification id mismatch");
    }
    const state = String(value.readyState ?? value.state ?? value.status ?? "UNKNOWN").toUpperCase();
    if (state !== "READY") throw new Error(`Vercel deployment not ready: ${state}`);
    const verified = receipt(value, input, now);
    return { ...verified, verifiedAt: now() };
  }

  return { reconcile, deploy, verify };
}

export function resolveVercelPrototypeDeployAdapter(
  env: EnvLike = process.env,
  deps: Pick<VercelPrototypeDeployAdapterOptions, "fetch" | "now"> = {},
): PrototypeDeployAdapter | null {
  const token = (env.ISEOL_VERCEL_TOKEN ?? env.VERCEL_TOKEN ?? "").trim();
  const projectId = (env.ISEOL_VERCEL_PROJECT_ID ?? env.VERCEL_PROJECT_ID ?? "").trim();  if (!token || !projectId) return null;
  const teamId = (env.ISEOL_VERCEL_TEAM_ID ?? env.VERCEL_TEAM_ID ?? "").trim();
  return createVercelPrototypeDeployAdapter({
    token,
    projectId,    ...(teamId ? { teamId } : {}),
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
}
