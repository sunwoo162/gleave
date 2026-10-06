import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertProjectModelId } from "./contracts.js";
import type { PortfolioDraft } from "./portfolio.js";
import { withDurablePortfolioLock } from "./portfolio-lock.js";

export type PortfolioSection = {
  id: "overview" | "features" | "technology" | "troubleshooting";
  title: string;
  generatedContent: string;
  content: string;
  included: boolean;
  evidenceIds: string[];
};

export type StoredPortfolioDocument = {
  version: 1;
  projectId: string;
  generatedAt: string;
  updatedAt: string;
  generationMode: "deterministic";
  sections: PortfolioSection[];
  generatedReadme: string;
  readme: string;
};

const SECTION_IDS = ["overview", "features", "technology", "troubleshooting"] as const;

function portfolioFile(root: string, projectId: string): string {
  assertProjectModelId(projectId);
  return resolve(root, "projects", projectId, "portfolio.json");
}

function bounded(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new Error(`Invalid portfolio ${label}`);
  return value;
}

function sectionContent(draft: PortfolioDraft, id: PortfolioSection["id"]): string {
  if (id === "overview") return draft.overview;
  if (id === "features") return draft.features.join("\n");
  if (id === "technology") return draft.technology.join("\n");
  return draft.troubleshooting.join("\n");
}

function sectionEvidence(draft: PortfolioDraft, id: PortfolioSection["id"]): string[] {
  const claimIds = id === "overview" || id === "technology" ? ["project-overview"] : id === "features"
    ? draft.claims.filter((claim) => claim.id.startsWith("feature:")).map((claim) => claim.id)
    : id === "troubleshooting" ? ["verification"] : [];
  return [...new Set(draft.claims.filter((claim) => claimIds.includes(claim.id)).flatMap((claim) => claim.evidenceIds))];
}

export function createPortfolioDocument(draft: PortfolioDraft, at = draft.generatedAt): StoredPortfolioDocument {
  const sections = SECTION_IDS.map((id) => {
    const content = sectionContent(draft, id);
    return {
      id,
      title: id === "overview" ? "프로젝트 소개" : id === "features" ? "주요 기능" : id === "technology" ? "기술과 근거" : "문제 해결",
      generatedContent: content,
      content,
      included: content.trim().length > 0,
      evidenceIds: sectionEvidence(draft, id),
    } satisfies PortfolioSection;
  });
  return {
    version: 1,
    projectId: draft.projectId,
    generatedAt: draft.generatedAt,
    updatedAt: at,
    generationMode: "deterministic",
    sections,
    generatedReadme: draft.readme,
    readme: draft.readme,
  };
}

async function loadPortfolioDocumentUnlocked(root: string, projectId: string): Promise<StoredPortfolioDocument | null> {
  const path = portfolioFile(root, projectId);
  try { return JSON.parse(await readFile(path, "utf8")) as StoredPortfolioDocument; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadPortfolioDocument(root: string, projectId: string): Promise<StoredPortfolioDocument | null> {
  return withDurablePortfolioLock(
    root,
    projectId,
    () => loadPortfolioDocumentUnlocked(root, projectId),
    { waitForMs: 2_000 },
  );
}

async function savePortfolioDocumentUnlocked(root: string, document: StoredPortfolioDocument): Promise<void> {
  assertProjectModelId(document.projectId);
  if (document.version !== 1 || document.generationMode !== "deterministic") throw new Error("Unsupported portfolio document");
  if (document.sections.length !== SECTION_IDS.length || document.sections.some((section, index) => section.id !== SECTION_IDS[index])) {
    throw new Error("Invalid portfolio sections");
  }
  const path = portfolioFile(root, document.projectId);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(document, null, 2), "utf8");
  await rename(temp, path);
}

export async function savePortfolioDocument(root: string, document: StoredPortfolioDocument): Promise<void> {
  return withDurablePortfolioLock(
    root,
    document.projectId,
    () => savePortfolioDocumentUnlocked(root, document),
    { waitForMs: 2_000 },
  );
}

export async function ensurePortfolioDocument(root: string, draft: PortfolioDraft, at = new Date().toISOString()): Promise<StoredPortfolioDocument> {
  return withDurablePortfolioLock(root, draft.projectId, async () => {
    const existing = await loadPortfolioDocumentUnlocked(root, draft.projectId);
    if (existing) return existing;
    const created = createPortfolioDocument(draft, at);
    await savePortfolioDocumentUnlocked(root, created);
    return created;
  }, { waitForMs: 2_000 });
}

export async function updatePortfolioDocument(
  root: string,
  projectId: string,
  input: { sections?: Array<{ id: string; content: string; included: boolean }>; readme?: string },
  at = new Date().toISOString(),
): Promise<StoredPortfolioDocument> {
  return withDurablePortfolioLock(root, projectId, async () => {
    const current = await loadPortfolioDocumentUnlocked(root, projectId);
    if (!current) throw new Error(`Portfolio document not found: ${projectId}`);
    if (input.sections !== undefined && !Array.isArray(input.sections)) throw new Error("Invalid portfolio sections");
    const requestedSections = input.sections ?? [];
    if (requestedSections.some((section) => !section || typeof section !== "object" || typeof section.id !== "string" || typeof section.content !== "string" || typeof section.included !== "boolean")) {
      throw new Error("Invalid portfolio sections");
    }
    if (new Set(requestedSections.map((section) => section.id)).size !== requestedSections.length) throw new Error("Invalid portfolio sections");
    const updates = new Map(requestedSections.map((section) => [section.id, section]));
    const sections = current.sections.map((section) => {
      const update = updates.get(section.id);
      if (!update) return section;
      if (typeof update.included !== "boolean") throw new Error("Invalid portfolio section inclusion");
      return { ...section, content: bounded(update.content, `section ${section.id}`, 20_000), included: update.included };
    });
    if (requestedSections.some((section) => !SECTION_IDS.includes(section.id as typeof SECTION_IDS[number]))) {
      throw new Error("Invalid portfolio section id");
    }
    const next = { ...current, sections, readme: input.readme === undefined ? current.readme : bounded(input.readme, "readme", 50_000), updatedAt: at };
    await savePortfolioDocumentUnlocked(root, next);
    return next;
  }, { waitForMs: 2_000 });
}

export function verifyStoredPortfolioGrounding(
  document: StoredPortfolioDocument,
  evidenceIds: ReadonlySet<string>,
): { grounded: boolean; needsReview: string[] } {
  const needsReview: string[] = [];
  for (const section of document.sections) {
    if (section.included && section.content !== section.generatedContent) needsReview.push(section.id);
    if (section.evidenceIds.some((id) => !evidenceIds.has(id))) needsReview.push(`${section.id}:evidence`);
  }
  if (document.readme !== document.generatedReadme) needsReview.push("readme");
  return { grounded: needsReview.length === 0, needsReview: [...new Set(needsReview)] };
}
