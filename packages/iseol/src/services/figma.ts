const FIGMA_API_BASE = "https://api.figma.com";
const FIGMA_LINK_ERROR = "Figma 링크 형식이 올바르지 않습니다.";

export const NO_FIGMA_VERSION = "__none__";

export type FigmaFileRef = {
  key: string;
  url: string;
};

export type FigmaVersion = {
  id: string;
  created_at: string;
  label: string;
  description: string;
  user?: {
    id?: string;
    handle?: string;
  };
};

export type FigmaComment = {
  id: string;
  message?: string;
  created_at: string;
  parent_id?: string;
  resolved_at?: string;
  user?: {
    id?: string;
    handle?: string;
  };
};

export function parseFigmaFile(input: string): FigmaFileRef {
  const raw = input.trim();
  if (!raw || raw.includes("\\") || /%5c/i.test(raw)) throw new Error(FIGMA_LINK_ERROR);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(FIGMA_LINK_ERROR);
  }

  const host = url.hostname.toLowerCase();

  if (url.protocol !== "https:"
    || (host !== "figma.com" && host !== "www.figma.com")
    || url.username
    || url.password
    || url.port) {
    throw new Error("Figma 링크는 https://www.figma.com/... 형식만 사용할 수 있습니다.");
  }

  const authorityEnd = raw.indexOf("://");
  const pathStart = raw.indexOf("/", authorityEnd + 3);
  const rawPath = (pathStart === -1 ? "" : raw.slice(pathStart)).split(/[?#]/, 1)[0] ?? "";
  const rawPathParts = rawPath.split("/");
  const pathParts = rawPathParts.at(-1) === "" ? rawPathParts.slice(0, -1) : rawPathParts;
  for (const part of pathParts.slice(1)) {
    let decodedPart: string;
    try {
      decodedPart = decodeURIComponent(part);
    } catch {
      throw new Error(FIGMA_LINK_ERROR);
    }
    if (!decodedPart || decodedPart === "." || decodedPart === ".." || /[\\/]/.test(decodedPart)) {
      throw new Error(FIGMA_LINK_ERROR);
    }
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const supportedKinds = new Set(["design", "file", "board", "proto"]);

  const key = parts[1] ?? "";
  if (parts.length < 2
    || parts.length > 3
    || !supportedKinds.has(parts[0] ?? "")
    || !/^[A-Za-z0-9_-]{1,200}$/.test(key)) {
    throw new Error("Figma 메인 주소가 아니라 실제 디자인 파일 링크를 입력해주세요. 예: https://www.figma.com/design/...");
  }

  return {
    key,
    url: url.toString(),
  };
}

export class FigmaWebhookService {
  constructor(
    private readonly token: string,
    _publicBaseUrl?: string,
    _passcode?: string,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${FIGMA_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Figma-Token": this.token,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Figma API 요청 실패 (${response.status}): ${body || response.statusText}`);
    }

    return response;
  }

  async listNamedVersions(fileKey: string): Promise<FigmaVersion[]> {
    const response = await this.request(`/v1/files/${encodeURIComponent(fileKey)}/versions`);
    const data = await response.json() as { versions?: FigmaVersion[] };

    return (data.versions ?? [])
      .filter((version) => version.label?.trim())
      .sort((a, b) => {
        const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
      });
  }

  async listComments(fileKey: string): Promise<FigmaComment[]> {
    const response = await this.request(`/v1/files/${encodeURIComponent(fileKey)}/comments?as_md=true`);
    const data = await response.json() as { comments?: FigmaComment[] };

    return (data.comments ?? []).sort((a, b) => {
      const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
    });
  }

  async getLatestNamedVersion(fileKey: string): Promise<FigmaVersion | null> {
    const versions = await this.listNamedVersions(fileKey);
    return versions.at(-1) ?? null;
  }

  // 기존 project command와의 호환을 위해 메서드 이름은 유지합니다.
  // Webhook을 생성하는 대신 현재 최신 named version을 polling 기준점으로 저장합니다.
  async createVersionWebhook(fileKey: string, _description: string): Promise<string> {
    const latest = await this.getLatestNamedVersion(fileKey);
    return latest?.id ?? NO_FIGMA_VERSION;
  }

  // Starter 플랜 polling 방식에서는 외부 Webhook 리소스가 없으므로 정리할 작업이 없습니다.
  async deleteWebhook(_webhookId: string): Promise<void> {}
}
