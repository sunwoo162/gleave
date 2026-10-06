const REQUEST_TIMEOUT_MS = 15_000;
const DETAIL_CONCURRENCY = 6;

export type ContestSource = "위비티" | "씽굿" | "콘테스트코리아" | "올콘" | "링커리어" | "대티즌" | "스펙토리";

export type ContestAttachment = {
  name: string;
  url?: string;
};

export type Contest = {
  title: string;
  url: string;
  sources: ContestSource[];
  field: string;
  target?: string;
  host?: string;
  sponsor?: string;
  period?: string;
  totalPrize?: string;
  firstPrize?: string;
  homepage?: string;
  attachments: ContestAttachment[];
  status?: string;
};

type Candidate = {
  title: string;
  url: string;
  source: ContestSource;
  trustItCategory?: boolean;
};

type SourceDefinition = {
  source: ContestSource;
  baseUrl: string;
  maxPages: number;
  buildListUrl: (page: number) => string;
  detailUrlPattern: RegExp;
  trustItCategory?: boolean;
};

const SOURCES: SourceDefinition[] = [
  {
    source: "위비티",
    baseUrl: "https://www.wevity.com",
    maxPages: 50,
    buildListUrl: (page) => `https://www.wevity.com/?c=find&cidx=20&gub=1&mode=ing&gp=${page}`,
    detailUrlPattern: /[?&]ix=\d+/i,
    trustItCategory: true,
  },
  {
    source: "씽굿",
    baseUrl: "https://www.thinkcontest.com",
    maxPages: 30,
    buildListUrl: (page) => `https://www.thinkcontest.com/thinkgood/user/contest/index.do?pageIndex=${page}`,
    detailUrlPattern: /\/thinkgood\/user\/contest\/view\.do\?/i,
  },
  {
    source: "콘테스트코리아",
    baseUrl: "https://www.contestkorea.com",
    maxPages: 30,
    buildListUrl: (page) => `https://www.contestkorea.com/sub/list.php?Txt_bcode=030310001&int_gbn=1&page=${page}`,
    detailUrlPattern: /\/sub\/view\.php\?.*str_no=/i,
  },
  {
    source: "올콘",
    baseUrl: "https://www.all-con.co.kr",
    maxPages: 50,
    buildListUrl: (page) => `https://www.all-con.co.kr/list/contest/1/${page}?device=pc&sc=2`,
    detailUrlPattern: /\/view\/contest\/\d+/i,
  },
  {
    source: "링커리어",
    baseUrl: "https://linkareer.com",
    maxPages: 50,
    buildListUrl: (page) => `https://linkareer.com/list/contest?page=${page}`,
    detailUrlPattern: /\/activity\/\d+(?:[/?#]|$)/i,
  },
  {
    source: "대티즌",
    baseUrl: "https://www.detizen.com",
    maxPages: 1,
    buildListUrl: () => "https://www.detizen.com/",
    detailUrlPattern: /\/contests\/[^/?#]+(?:[/?#]|$)/i,
  },
  {
    source: "스펙토리",
    baseUrl: "https://www.spectory.net",
    maxPages: 50,
    buildListUrl: (page) => `https://www.spectory.net/contest/lists?filter=all&cat=${encodeURIComponent("IT/웹/모바일/게임")}&prefix=info-category&page=${page}&searchDate=all`,
    detailUrlPattern: /\/contest\/(?:share|detail)\?.*(?:uid|pid)=\d+/i,
    trustItCategory: true,
  },
];

const KOREAN_IT_KEYWORDS = [
  "인공지능",
  "데이터",
  "빅데이터",
  "소프트웨어",
  "웹",
  "앱",
  "모바일",
  "개발",
  "코딩",
  "프로그래밍",
  "해커톤",
  "디지털",
  "클라우드",
  "오픈소스",
  "보안",
  "정보통신",
  "알고리즘",
  "반도체",
  "로봇",
  "핀테크",
  "블록체인",
  "컴퓨터",
  "전산",
  "공학",
  "기술",
];

const ASCII_IT_PATTERN = /(?:^|[^a-z0-9])(?:it|ict|ai|sw|iot|api)(?=$|[^a-z0-9])/i;

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/li|\/tr|\/td|\/th|\/dd|\/dt|\/div|\/section|\/h\d)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");

  return decodeHtml(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(decodeHtml(href), baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeContestCandidateUrl(href: string, sourceUrl: string): string | null {
  const normalized = normalizeUrl(href, sourceUrl);
  if (!normalized) return null;

  try {
    const source = new URL(sourceUrl);
    const candidate = new URL(normalized);
    if (candidate.protocol !== source.protocol
      || candidate.origin !== source.origin
      || candidate.username
      || candidate.password
      || candidate.port) {
      return null;
    }
    return candidate.toString();
  } catch {
    return null;
  }
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/제\s*\d+\s*회/g, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/[\[\](){}<>「」『』【】'"“”‘’·•,:.!?~_\-–—/\\|]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function isItCategory(value: string): boolean {
  const normalized = value.normalize("NFKC").toLowerCase();
  return KOREAN_IT_KEYWORDS.some((keyword) => normalized.includes(keyword))
    || ASCII_IT_PATTERN.test(normalized);
}

function extractCandidates(html: string, source: SourceDefinition): Candidate[] {
  const candidates: Candidate[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1];
    const body = match[2];
    if (!href || !body) continue;

    const url = normalizeContestCandidateUrl(href, source.baseUrl);
    if (!url || !source.detailUrlPattern.test(url)) continue;

    const title = stripTags(body);
    if (!title || title.length < 2) continue;

    candidates.push({
      title,
      url,
      source: source.source,
      trustItCategory: source.trustItCategory,
    });
  }

  return candidates;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (compatible; IseolBot/1.0; +Discord contest aggregator)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function collectSourceCandidates(source: SourceDefinition): Promise<Candidate[]> {
  const all = new Map<string, Candidate>();

  for (let page = 1; page <= source.maxPages; page += 1) {
    let html: string;
    try {
      html = await fetchHtml(source.buildListUrl(page));
    } catch (error) {
      if (page === 1) throw error;
      break;
    }

    const candidates = extractCandidates(html, source);
    if (candidates.length === 0) break;

    const before = all.size;
    for (const candidate of candidates) all.set(candidate.url, candidate);
    if (all.size === before) break;
  }

  return [...all.values()];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findValue(lines: string[], labels: string[]): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    for (const label of labels) {
      if (line.toLowerCase() === label.toLowerCase()) {
        return lines[index + 1]?.trim() || undefined;
      }

      const pattern = new RegExp(`^${escapeRegex(label)}\\s*[.:：|·-]*\\s*(.+)$`, "i");
      const value = line.match(pattern)?.[1]?.trim();
      if (value) return value;
    }
  }

  return undefined;
}

function findValueNear(lines: string[], labels: string[], take = 3): string | undefined {
  const normalized = labels.map((label) => label.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.toLowerCase();
    if (!line || !normalized.some((label) => line === label || line.startsWith(label))) continue;
    const values = lines.slice(index + 1, index + 1 + take).filter(Boolean);
    if (values.length > 0) return values.join(" ");
  }
  return undefined;
}

function extractField(lines: string[]): string | undefined {
  const labels = ["공모분야", "응모분야", "모집분야", "분야", "카테고리", "분류"];
  const stopLabels = /^(?:추가혜택|활동혜택|접수기간|공모기간|응모기간|모집기간|참여대상|응모대상|참가대상|참가자격|지원자격|공모자격|시상규모|총\s*상금|홈페이지|주최|주관|후원|협찬|공유하기|첨부파일|상태|진행상태)$/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    for (const label of labels) {
      const inlinePattern = new RegExp(`^${escapeRegex(label)}\\s*[.:：|·-]+\\s*(.+)$`, "i");
      const inline = line.match(inlinePattern)?.[1]?.trim();
      if (inline) return inline;

      if (line.toLowerCase() !== label.toLowerCase()) continue;

      const values: string[] = [];
      for (let offset = 1; offset <= 4; offset += 1) {
        const value = lines[index + offset]?.trim();
        if (!value || stopLabels.test(value)) break;
        values.push(value);
      }

      if (values.length > 0) return values.join(" · ");
    }
  }

  return undefined;
}

function findLabeledLink(html: string, labels: string[], baseUrl: string): string | undefined {
  for (const label of labels) {
    const index = html.indexOf(label);
    if (index < 0) continue;
    const segment = html.slice(index, index + 3000);
    const href = segment.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const url = normalizeUrl(href, baseUrl);
    if (url) return url;
  }
  return undefined;
}

function extractAttachments(html: string, baseUrl: string): ContestAttachment[] {
  const attachments = new Map<string, ContestAttachment>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1];
    const body = match[2];
    if (!href || !body) continue;

    const name = stripTags(body);
    const decodedHref = decodeHtml(href);
    const looksLikeFile = /\.(?:pdf|hwp|hwpx|docx?|xlsx?|pptx?|zip|jpg|jpeg|png)(?:$|[?#])/i.test(decodedHref)
      || /첨부|다운로드|파일/i.test(name);
    if (!looksLikeFile) continue;

    const url = normalizeUrl(decodedHref, baseUrl) ?? undefined;
    attachments.set(`${name}|${url ?? ""}`, {
      name: name || "첨부파일",
      url,
    });
    if (attachments.size >= 5) break;
  }

  return [...attachments.values()];
}

function extractPrize(text: string, type: "total" | "first"): string | undefined {
  if (type === "total") {
    return text.match(/(?:총\s*상금|시상규모)\s*[:：]?\s*([^/|\n]{1,60})/i)?.[1]?.trim();
  }

  return text.match(/(?:1등\s*상금|1등시상금|1등|1위|대상|최우수상)\s*[:：-]?\s*([^|\n]{1,60})/i)?.[1]?.trim();
}

function formatPeriodWithDday(period?: string): string | undefined {
  if (!period) return undefined;
  if (/\bD-\d+\b|D-DAY/i.test(period)) return period;

  const matches = [...period.matchAll(/(?:(20)?(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2}))/g)];
  const last = matches.at(-1);
  if (!last) return period;

  const year = Number(last[1] ? `${last[1]}${last[2]}` : `20${last[2]}`);
  const month = Number(last[3]);
  const day = Number(last[4]);
  if (!year || !month || !day) return period;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayParts = formatter.format(new Date()).split("-").map(Number);
  const today = Date.UTC(todayParts[0] ?? year, (todayParts[1] ?? 1) - 1, todayParts[2] ?? 1);
  const end = Date.UTC(year, month - 1, day);
  const diff = Math.ceil((end - today) / 86_400_000);

  if (diff < 0) return `${period} **마감**`;
  if (diff === 0) return `${period} **D-DAY**`;
  return `${period} **D-${diff}**`;
}

function isOpenContest(period?: string, status?: string): boolean {
  if (status && /마감|종료|D\+\d+/i.test(status) && !/마감임박/i.test(status)) return false;
  if (!period) return true;
  return !formatPeriodWithDday(period)?.includes("**마감**");
}

function extractPeriod(lines: string[]): string | undefined {
  const direct = findValue(lines, ["접수기간", "공모기간", "응모기간", "모집기간"]);
  const near = findValueNear(lines, ["접수기간", "공모기간", "응모기간", "모집기간"], 4);
  const candidate = near && /시작일|마감일/.test(near) ? near : direct;
  return candidate?.replace(/\s+/g, " ").trim();
}

function parseDetail(candidate: Candidate, html: string): Contest | null {
  const lines = htmlToLines(html);
  const text = lines.join("\n");

  const h1 = stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const pageTitle = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const title = (h1 || pageTitle || candidate.title)
    .replace(/\s*[|｜].*$/, "")
    .replace(/\s*-\s*(?:링커리어|대티즌|스펙토리).*$/i, "")
    .trim();

  const field = extractField(lines);
  if (field) {
    if (!isItCategory(field)) return null;
  } else if (!candidate.trustItCategory) {
    return null;
  }

  const hostCombined = findValue(lines, ["주최 . 주관", "주최·주관", "주최/주관", "주최기관"]);
  const organizers = [
    findValue(lines, ["주최", "주최기관"]),
    findValue(lines, ["주관", "주관기관"]),
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const host = hostCombined ?? (organizers.length > 0 ? organizers.join(" / ") : undefined);

  const target = findValue(lines, ["응모대상", "참가대상", "참가자격", "지원자격", "참여대상", "공모자격"]);
  const sponsor = findValue(lines, ["후원/협찬", "후원·협찬", "주관/후원", "후원", "협찬"]);
  const periodRaw = extractPeriod(lines);
  const period = formatPeriodWithDday(periodRaw);
  const status = findValue(lines, ["진행상황", "진행사항", "진행상태", "상태"]);

  if (!isOpenContest(periodRaw, status)) return null;

  const totalPrize = findValue(lines, ["총 상금", "총상금", "시상규모"])
    ?? extractPrize(text, "total");
  const firstPrize = findValue(lines, ["1등 상금", "시상금(1등)", "1위 상금", "1등시상금"])
    ?? extractPrize(text, "first");
  const homepage = findLabeledLink(html, ["홈페이지", "주최사 홈페이지", "공식 홈페이지", "접수처", "홈페이지 지원"], candidate.url);
  const attachments = extractAttachments(html, candidate.url);

  return {
    title,
    url: candidate.url,
    sources: [candidate.source],
    field: field ?? "웹/모바일/IT",
    target,
    host,
    sponsor,
    period,
    totalPrize,
    firstPrize,
    homepage,
    attachments,
    status,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await mapper(item);
    }
  });

  await Promise.all(workers);
  return results;
}

async function loadSource(source: SourceDefinition): Promise<Contest[]> {
  const candidates = await collectSourceCandidates(source);
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];

  const details = await mapWithConcurrency(unique, DETAIL_CONCURRENCY, async (candidate) => {
    try {
      return parseDetail(candidate, await fetchHtml(candidate.url));
    } catch (error) {
      console.warn(`공모전 상세 조회 실패 (${candidate.source} - ${candidate.title})`, error);
      return null;
    }
  });

  return details.filter((contest): contest is Contest => contest !== null);
}

function richerValue(current?: string, incoming?: string): string | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.length > current.length ? incoming : current;
}

function mergeContest(current: Contest, incoming: Contest): Contest {
  const attachmentMap = new Map<string, ContestAttachment>();
  for (const attachment of [...current.attachments, ...incoming.attachments]) {
    attachmentMap.set(`${attachment.name}|${attachment.url ?? ""}`, attachment);
  }

  return {
    ...current,
    title: richerValue(current.title, incoming.title) ?? current.title,
    sources: [...new Set([...current.sources, ...incoming.sources])],
    field: richerValue(current.field, incoming.field) ?? current.field,
    target: richerValue(current.target, incoming.target),
    host: richerValue(current.host, incoming.host),
    sponsor: richerValue(current.sponsor, incoming.sponsor),
    period: richerValue(current.period, incoming.period),
    totalPrize: richerValue(current.totalPrize, incoming.totalPrize),
    firstPrize: richerValue(current.firstPrize, incoming.firstPrize),
    homepage: current.homepage ?? incoming.homepage,
    attachments: [...attachmentMap.values()].slice(0, 5),
    status: richerValue(current.status, incoming.status),
  };
}

export async function listActiveItContests(): Promise<Contest[]> {
  const settled = await Promise.allSettled(SOURCES.map((source) => loadSource(source)));
  const merged = new Map<string, Contest>();

  settled.forEach((result, index) => {
    const source = SOURCES[index];
    if (result.status === "rejected") {
      console.warn(`공모전 출처 조회 실패 (${source?.source ?? "알 수 없음"})`, result.reason);
      return;
    }

    for (const contest of result.value) {
      const key = normalizeTitle(contest.title);
      if (!key) continue;
      const current = merged.get(key);
      merged.set(key, current ? mergeContest(current, contest) : contest);
    }
  });

  return [...merged.values()].sort((a, b) => a.title.localeCompare(b.title, "ko"));
}
