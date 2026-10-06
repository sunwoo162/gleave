const NOTION_API_BASE = "https://api.notion.com";
const NOTION_API_VERSION = "2026-03-11";

export type NotionPageRef = {
  id: string;
  url: string;
};

export type NotionPageSnapshot = {
  id: string;
  last_edited_time: string;
  url?: string;
  public_url?: string | null;
  last_edited_by?: {
    id?: string;
  };
};

function formatPageId(value: string): string {
  const compact = value.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    throw new Error("Notion 페이지 ID를 확인할 수 없습니다.");
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

export function parseNotionPage(input: string): NotionPageRef {
  const raw = input.trim();
  if (!raw || raw.includes("\\") || /%5c/i.test(raw)) {
    throw new Error("Notion 링크 형식이 올바르지 않습니다.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Notion 링크 형식이 올바르지 않습니다.");
  }

  const host = url.hostname.toLowerCase();
  const validHost = host === "notion.so"
    || host === "www.notion.so"
    || host === "app.notion.com"
    || host === "notion.site"
    || host.endsWith(".notion.site");

  if (url.protocol !== "https:" || !validHost || url.username || url.password || url.port) {
    throw new Error("Notion 링크는 실제 notion.so, app.notion.com 또는 notion.site 페이지 링크여야 합니다.");
  }

  const matches = url.pathname.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  const rawId = matches?.at(-1);
  if (!rawId) {
    throw new Error("Notion 메인 주소가 아니라 실제 기능명세서 페이지 링크를 입력해주세요.");
  }

  return {
    id: formatPageId(rawId),
    url: url.toString(),
  };
}

export class NotionService {
  constructor(private readonly token: string) {}

  async getPage(pageId: string): Promise<NotionPageSnapshot> {
    const response = await fetch(`${NOTION_API_BASE}/v1/pages/${encodeURIComponent(pageId)}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      const hint = response.status === 404
        ? " Notion 페이지를 이설 Integration에 공유했는지 확인해주세요."
        : "";
      throw new Error(`Notion API 요청 실패 (${response.status}): ${body || response.statusText}${hint}`);
    }

    const page = await response.json() as NotionPageSnapshot;
    if (!page.id || !page.last_edited_time) {
      throw new Error("Notion 페이지의 수정 정보를 확인할 수 없습니다.");
    }

    return page;
  }
}
