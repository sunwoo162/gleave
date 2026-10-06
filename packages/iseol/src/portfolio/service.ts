import { randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { PortfolioEntry, PortfolioEntryInput, PortfolioEvidence, PortfolioService, PortfolioServiceOptions, PortfolioSnapshot, PublicPortfolioView } from "./contracts.js";
import { withDurablePortfolioEntryLock } from "./entry-lock.js";
import { findPortfolioEntryUnlocked, listPortfolioEntriesUnlocked, loadPortfolioEntryUnlocked, savePortfolioEntry, savePortfolioEntryUnlocked } from "./store.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function required(value: string, label: string, max: number): string { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label} is required`); return trimmed; }
function actorFromProvider(provider?: string): PortfolioEvidence["actorType"] { return provider && /agent|ai|chatgpt|runtime/i.test(provider) ? "ai" : "system"; }
function validateVisibility(value: string): asserts value is PortfolioEntry["visibility"] { if (!["public", "unlisted", "private"].includes(value)) throw new Error("Invalid portfolio visibility"); }
function safePublicText(value: string): string { return sanitizeCredentialText(value, Math.max(value.length, 1)); }
function safePublicEntry(entry: PortfolioEntry): PortfolioEntry { return { ...entry, title: safePublicText(entry.title), summary: safePublicText(entry.summary) }; }
function safePublicEvidence(evidence: PortfolioEvidence): PortfolioEvidence { return { ...evidence, summary: safePublicText(evidence.summary) }; }

export function createPortfolioService(root: string, options: PortfolioServiceOptions): PortfolioService {
  const now = options.now ?? (() => new Date().toISOString());
  const collectEvidence = async (principal: Principal): Promise<PortfolioEvidence[]> => {
    const activity = await options.activityService.listActivityEvents(principal);
    const evidence: PortfolioEvidence[] = activity.filter((event) => event.status === "active").map((event) => ({ id: `activity:${event.id}`, sourceType: "activity", sourceId: event.id, actorType: event.actorType, verificationStatus: event.verificationStatus, summary: `${event.eventType}: ${event.sourceType}/${event.sourceId}`, occurredAt: event.occurredAt }));
    for (const project of await options.userProjectService.listProjects(principal)) {
      const view = await options.userProjectService.getProject(principal, project.id); if (!view) continue;
      for (const item of view.evidence) evidence.push({ id: `project-evidence:${project.id}:${item.id}`, sourceType: "project-evidence", sourceId: item.id, projectId: project.id, actorType: actorFromProvider(item.provider), verificationStatus: "verified", summary: `${project.name}: ${item.summary}`, occurredAt: item.recordedAt, ...(item.provider ? { provider: item.provider } : {}) });
    }
    if (options.learningService) {
      try {
        const goals = await options.learningService.listLearningGoals(principal);
        const reports = (await Promise.all(goals.slice(0, 64).map((goal) => options.learningService!.listLearningReports(principal, goal.id)))).flat();
        for (const report of reports.slice(0, 128)) {
          for (const outcome of report.verifiedOutcomes.slice(0, 64)) {
            if (outcome.evidenceRefs.length === 0) continue;
            evidence.push({
              id: `learning-report:${report.id}:${outcome.outcomeId}`,
              sourceType: "learning-report",
              sourceId: outcome.outcomeId,
              reportId: report.id,
              actorType: "user",
              verificationStatus: "verified",
              summary: `${report.goalSubject}: ${outcome.label}`,
              occurredAt: report.createdAt,
              provider: "learning-report-local",
            });
          }
        }
      } catch {
        // Learning evidence is an optional projection; preserve the core portfolio when its read model is unavailable.
      }
    }
    return evidence.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  };
  const readEntries = async (userId: string): Promise<PortfolioEntry[]> => {
    const entries = await listPortfolioEntriesUnlocked(root, userId);
    const current: PortfolioEntry[] = [];
    for (const initial of entries) {
      if (initial.userId !== userId) continue;
      await withDurablePortfolioEntryLock(root, userId, initial.id, async () => {
        const entry = await loadPortfolioEntryUnlocked(root, userId, initial.id);
        if (entry?.userId === userId) current.push(entry);
      }, { waitForMs: 2_000 });
    }
    return current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  };
  const readSnapshot = async (principal: Principal): Promise<PortfolioSnapshot> => ({ entries: await readEntries(principal.userId), evidence: await collectEvidence(principal) });
  const validateEntryInput = async (principal: Principal, input: PortfolioEntryInput): Promise<PortfolioEvidence[]> => { validateVisibility(input.visibility); if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length > 100) throw new Error("Portfolio evidence selection is invalid"); const evidence = await collectEvidence(principal); const byId = new Map(evidence.map((item) => [item.id, item])); const selected = [...new Set(input.evidenceIds)].map((id) => byId.get(id)); if (selected.some((item) => !item || item.verificationStatus !== "verified")) throw new Error("Portfolio entries require verified evidence"); return selected as PortfolioEvidence[]; };
  return {
    async listPortfolio(principal) { ensurePrincipal(principal); return readSnapshot(principal); },
    async listPublicEntries(userId) {
      assertIdentityId(userId);
      return (await readEntries(userId)).filter((entry) => entry.visibility === "public").map(safePublicEntry);
    },
    async createEntry(principal, input) { ensurePrincipal(principal); await validateEntryInput(principal, input); const at = now(); assertTimestamp(at, "portfolio timestamp"); const entry: PortfolioEntry = { version: 1, id: `portfolio-${randomUUID()}`, userId: principal.userId, title: required(input.title, "Portfolio title", 200), summary: required(input.summary, "Portfolio summary", 10_000), visibility: input.visibility, evidenceIds: [...new Set(input.evidenceIds)], createdAt: at, updatedAt: at }; await savePortfolioEntry(root, entry); return entry; },
    async updateEntry(principal, entryId, patch) { ensurePrincipal(principal); assertIdentityId(entryId); return withDurablePortfolioEntryLock(root, principal.userId, entryId, async () => { const current = await loadPortfolioEntryUnlocked(root, principal.userId, entryId); if (!current || current.userId !== principal.userId) throw new Error("Portfolio entry not found"); const nextInput: PortfolioEntryInput = { title: patch.title ?? current.title, summary: patch.summary ?? current.summary, visibility: patch.visibility ?? current.visibility, evidenceIds: patch.evidenceIds ?? current.evidenceIds }; await validateEntryInput(principal, nextInput); const next: PortfolioEntry = { ...current, title: required(nextInput.title, "Portfolio title", 200), summary: required(nextInput.summary, "Portfolio summary", 10_000), visibility: nextInput.visibility, evidenceIds: [...new Set(nextInput.evidenceIds)], updatedAt: now() }; await savePortfolioEntryUnlocked(root, next); return next; }, { waitForMs: 2_000 }); },
    async exportPortfolio(principal, format) { ensurePrincipal(principal); if (!["json", "markdown"].includes(format)) throw new Error("Unsupported portfolio format"); const snapshot = await readSnapshot(principal); const evidenceById = new Map(snapshot.evidence.map((item) => [item.id, item])); if (format === "json") return { format, filename: "iseol-portfolio.json", content: JSON.stringify({ entries: snapshot.entries, evidence: snapshot.evidence }, null, 2) }; const lines = [`# ISEOL Portfolio`, ``, `Generated: ${now()}`, ``]; for (const entry of snapshot.entries) { lines.push(`## ${entry.title}`, ``, entry.summary, ``, `Visibility: ${entry.visibility}`, ``); for (const evidenceId of entry.evidenceIds) { const item = evidenceById.get(evidenceId); if (item) lines.push(`- ${item.summary} (${item.actorType}, ${item.verificationStatus}, ${item.occurredAt})`); } lines.push(``); } return { format, filename: "iseol-portfolio.md", content: lines.join("\n") }; },
    async getPublicEntry(entryId): Promise<PublicPortfolioView | null> {
      assertIdentityId(entryId);
      const initial = await findPortfolioEntryUnlocked(root, entryId);
      if (!initial) return null;
      return withDurablePortfolioEntryLock(root, initial.userId, entryId, async () => {
        const entry = await loadPortfolioEntryUnlocked(root, initial.userId, entryId);
        if (!entry || entry.visibility === "private") return null;
        const evidence = await collectEvidence({ userId: entry.userId, sessionId: "public-portfolio", roles: ["user"] });
        const evidenceById = new Map(evidence.map((item) => [item.id, item]));
        const { userId: _userId, evidenceIds: _evidenceIds, ...publicEntry } = safePublicEntry(entry);
        return {
          entry: publicEntry,
          evidence: entry.evidenceIds
            .map((id) => evidenceById.get(id))
            .filter((item): item is PortfolioEvidence => Boolean(item && item.verificationStatus === "verified"))
            .map(safePublicEvidence)
            .map(({ id: _id, sourceId: _sourceId, projectId: _projectId, reportId: _reportId, ...item }) => item),
        };
      }, { waitForMs: 2_000 });
    },
  };
}
