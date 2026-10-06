import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import type { RepositoryRef } from "./github.js";
import { withDurableFileStateLock } from "./file-state-lock.js";

const DATA_FILE = resolve(process.cwd(), "data", "github-users.json");
const GITHUB_API = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

export type GitHubAccountLink = {
  guildId: string;
  discordUserId: string;
  githubLogin: string;
  connectedAt: string;
};

export type GitHubUserProfile = {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  following: number;
};

export type GitHubContributionDay = {
  date: string;
  contributionCount: number;
  contributionLevel: "NONE" | "FIRST_QUARTILE" | "SECOND_QUARTILE" | "THIRD_QUARTILE" | "FOURTH_QUARTILE";
  weekday: number;
};

export type GitHubContributionCalendar = {
  totalContributions: number;
  totalCommitContributions?: number;
  weeks: Array<{ contributionDays: GitHubContributionDay[] }>;
};

export type GitHubRepositoryEvent = {
  id: string;
  type: string | null;
  actor?: {
    login?: string;
  };
  created_at?: string | null;
  payload?: {
    ref?: string;
    commits?: Array<{
      sha: string;
      message: string;
      distinct?: boolean;
      author?: {
        name?: string;
        email?: string;
      };
    }>;
  };
};

type GitHubUserApiResponse = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
};

type ContributionGraphQlResponse = {
  data?: {
    user?: {
      contributionsCollection?: {
        totalCommitContributions?: number;
        contributionCalendar?: Omit<GitHubContributionCalendar, "totalCommitContributions">;
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export class GitHubAccountLinkStore {
  constructor(private readonly file = DATA_FILE) {}

  private async readLinks(): Promise<GitHubAccountLink[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as GitHubAccountLink[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeLinks(links: GitHubAccountLink[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(links, null, 2), "utf8");
  }

  async link(guildId: string, discordUserId: string, githubLogin: string): Promise<GitHubAccountLink> {
    return withDurableFileStateLock(this.file, async () => {
      const links = await this.readLinks();
      const normalized = githubLogin.trim();
      const existingIndex = links.findIndex((link) => link.guildId === guildId && link.discordUserId === discordUserId);
      const next: GitHubAccountLink = {
        guildId,
        discordUserId,
        githubLogin: normalized,
        connectedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) links[existingIndex] = next;
      else links.push(next);

      await this.writeLinks(links);
      return next;
    }, { waitForMs: 2_000 });
  }

  async unlink(guildId: string, discordUserId: string): Promise<GitHubAccountLink | null> {
    return withDurableFileStateLock(this.file, async () => {
      const links = await this.readLinks();
      const existing = links.find((link) => link.guildId === guildId && link.discordUserId === discordUserId) ?? null;
      if (!existing) return null;

      await this.writeLinks(links.filter((link) => !(link.guildId === guildId && link.discordUserId === discordUserId)));
      return existing;
    }, { waitForMs: 2_000 });
  }

  async removeGuild(guildId: string): Promise<number> {
    return withDurableFileStateLock(this.file, async () => {
      const links = await this.readLinks();
      const retained = links.filter((link) => link.guildId !== guildId);
      const removed = links.length - retained.length;
      if (removed > 0) await this.writeLinks(retained);
      return removed;
    }, { waitForMs: 2_000 });
  }

  async find(guildId: string, discordUserId: string): Promise<GitHubAccountLink | null> {
    return withDurableFileStateLock(this.file, async () => {
      const links = await this.readLinks();
      return links.find((link) => link.guildId === guildId && link.discordUserId === discordUserId) ?? null;
    }, { waitForMs: 2_000 });
  }

  async list(guildId?: string): Promise<GitHubAccountLink[]> {
    return withDurableFileStateLock(this.file, async () => {
      const links = await this.readLinks();
      return guildId ? links.filter((link) => link.guildId === guildId) : links;
    }, { waitForMs: 2_000 });
  }
}

const defaultGitHubAccountLinkStore = new GitHubAccountLinkStore();

export function linkGitHubAccount(
  guildId: string,
  discordUserId: string,
  githubLogin: string,
): Promise<GitHubAccountLink> {
  return defaultGitHubAccountLinkStore.link(guildId, discordUserId, githubLogin);
}

export function unlinkGitHubAccount(guildId: string, discordUserId: string): Promise<GitHubAccountLink | null> {
  return defaultGitHubAccountLinkStore.unlink(guildId, discordUserId);
}

export function removeGitHubAccountsForGuild(guildId: string): Promise<number> {
  return defaultGitHubAccountLinkStore.removeGuild(guildId);
}

export function findGitHubAccount(guildId: string, discordUserId: string): Promise<GitHubAccountLink | null> {
  return defaultGitHubAccountLinkStore.find(guildId, discordUserId);
}

export function listGitHubAccounts(guildId?: string): Promise<GitHubAccountLink[]> {
  return defaultGitHubAccountLinkStore.list(guildId);
}

export class GitHubUserService {
  constructor(private readonly token: string) {}

  private headers(contentType = false): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "IseolBot/1.0",
      ...(contentType ? { "Content-Type": "application/json" } : {}),
    };
  }

  async getProfile(username: string): Promise<GitHubUserProfile> {
    const response = await fetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      if (response.status === 404) throw new Error("GitHub 사용자를 찾을 수 없습니다.");
      throw new Error(`GitHub 사용자 조회 실패 (HTTP ${response.status})`);
    }

    const user = await response.json() as GitHubUserApiResponse;
    return {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url,
      bio: user.bio,
      company: user.company,
      location: user.location,
      publicRepos: user.public_repos,
      followers: user.followers,
      following: user.following,
    };
  }

  async getContributionCalendar(username: string): Promise<GitHubContributionCalendar> {
    const query = `
      query($login: String!) {
        user(login: $login) {
          contributionsCollection {
            totalCommitContributions
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                  contributionLevel
                  weekday
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(GITHUB_GRAPHQL, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ query, variables: { login: username } }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) throw new Error(`GitHub 잔디 조회 실패 (HTTP ${response.status})`);
    const body = await response.json() as ContributionGraphQlResponse;
    if (body.errors?.length) {
      throw new Error(body.errors.map((error) => error.message || "GraphQL 오류").join(", "));
    }

    const collection = body.data?.user?.contributionsCollection;
    const calendar = collection?.contributionCalendar;
    if (!calendar) throw new Error("GitHub 잔디 정보를 불러올 수 없습니다.");

    return {
      ...calendar,
      totalCommitContributions: collection?.totalCommitContributions ?? 0,
    };
  }

  async listRepositoryEvents(repository: RepositoryRef): Promise<GitHubRepositoryEvent[]> {
    const response = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/events?per_page=100`,
      {
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) throw new Error(`GitHub 저장소 이벤트 조회 실패 (${repository.owner}/${repository.repo}, HTTP ${response.status})`);
    return await response.json() as GitHubRepositoryEvent[];
  }
}

const LEVEL_COLORS: Record<GitHubContributionDay["contributionLevel"], string> = {
  NONE: "#161b22",
  FIRST_QUARTILE: "#0e4429",
  SECOND_QUARTILE: "#006d32",
  THIRD_QUARTILE: "#26a641",
  FOURTH_QUARTILE: "#39d353",
};

export async function renderGitHubGrass(calendar: GitHubContributionCalendar): Promise<Buffer> {
  const cell = 14;
  const gap = 4;
  const step = cell + gap;
  const padding = 8;
  const weeks = calendar.weeks.slice(-53);
  const width = Math.max(1, weeks.length * step - gap + padding * 2);
  const height = 7 * step - gap + padding * 2;
  const rects: string[] = [];

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      const x = padding + weekIndex * step;
      const y = padding + day.weekday * step;
      const color = LEVEL_COLORS[day.contributionLevel] ?? LEVEL_COLORS.NONE;
      rects.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${color}"/>`);
    });
  });

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${rects.join("")}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
