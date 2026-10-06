import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import type { AiChatConversation } from "./contracts.js";
import { withDurableAiChatConversationLock } from "./conversation-lock.js";

function directory(root: string, userId: string): string { assertIdentityId(userId); return resolve(root, "users", userId, "ai-chat", "conversations"); }
function pathFor(root: string, userId: string, conversationId: string): string { assertIdentityId(conversationId); return resolve(directory(root, userId), `${conversationId}.json`); }
async function saveJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), "utf8"); await rename(temporary, path); }
async function loadJson<T>(path: string): Promise<T | null> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
export const saveConversationUnlocked = (root: string, conversation: AiChatConversation) => saveJson(pathFor(root, conversation.userId, conversation.id), conversation);
export const saveConversation = (root: string, conversation: AiChatConversation) => withDurableAiChatConversationLock(root, conversation.userId, conversation.id, () => saveConversationUnlocked(root, conversation), { waitForMs: 2_000 });
export const loadConversationUnlocked = (root: string, userId: string, conversationId: string) => loadJson<AiChatConversation>(pathFor(root, userId, conversationId));
export const loadConversation = (root: string, userId: string, conversationId: string) => withDurableAiChatConversationLock(root, userId, conversationId, () => loadConversationUnlocked(root, userId, conversationId), { waitForMs: 2_000 });
export async function listConversationsUnlocked(root: string, userId: string): Promise<AiChatConversation[]> { let names: string[]; try { names = await readdir(directory(root, userId)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } const values: AiChatConversation[] = []; for (const name of names.filter((item) => item.endsWith(".json"))) { const value = await loadJson<AiChatConversation>(resolve(directory(root, userId), name)); if (value) values.push(value); } return values; }
export async function listConversations(root: string, userId: string): Promise<AiChatConversation[]> {
  const candidates = await listConversationsUnlocked(root, userId);
  const values: AiChatConversation[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableAiChatConversationLock(root, userId, candidate.id, async () => {
      const current = await loadConversationUnlocked(root, userId, candidate.id);
      if (current?.userId === userId) values.push(current);
    }, { waitForMs: 2_000 });
  }
  return values;
}
