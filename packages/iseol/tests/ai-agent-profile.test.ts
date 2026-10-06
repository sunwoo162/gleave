import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { createAiAgentProfileService } from "../src/ai-agent/service.js";
import { withDurableAiAgentProfileLock } from "../src/ai-agent/profile-lock.js";
import { loadAiAgentProfile, saveAiAgentProfile, saveAiAgentProfileUnlocked } from "../src/ai-agent/store.js";

const principal = (userId: string): Principal => ({ userId, sessionId: `${userId}-session`, roles: ["user"] });

test("missing agent profile resolves to the stable default 이설 profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-"));
  const service = createAiAgentProfileService(root, { now: () => "2026-09-27T12:00:00.000Z" });

  const profile = await service.getProfile(principal("profile-default"));

  assert.equal(profile.userId, "profile-default");
  assert.equal(profile.agentId, "default");
  assert.equal(profile.name, "이설");
  assert.equal(profile.avatarUrl, "");
});

test("agent profile updates persist and remain isolated by authenticated user", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-"));
  const service = createAiAgentProfileService(root, { now: () => "2026-09-27T12:00:00.000Z" });

  const saved = await service.updateProfile(principal("profile-a"), {
    name: "이라그네프로",
    avatarUrl: "https://example.com/avatar.png",
    personality: "장난스럽고 실용적",
    tone: "반말",
    role: "프로젝트 동료",
  });
  const loaded = await service.getProfile(principal("profile-a"));
  const foreign = await service.getProfile(principal("profile-b"));

  assert.equal(saved.name, "이라그네프로");
  assert.equal(loaded.personality, "장난스럽고 실용적");
  assert.equal(foreign.name, "이설");
  assert.equal(foreign.personality, "사용자와 함께 배우고 만드는 개인 AI");
});

test("agent profile mutations across service instances preserve both patches", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-"));
  const firstService = createAiAgentProfileService(root, { now: () => "2026-09-27T12:00:00.000Z" });
  const secondService = createAiAgentProfileService(root, { now: () => "2026-09-27T12:00:01.000Z" });
  const owner = principal("profile-concurrent");

  await Promise.all([
    firstService.updateProfile(owner, { name: "첫 번째 이름" }),
    secondService.updateProfile(owner, { tone: "짧고 명확하게" }),
  ]);

  const persisted = await createAiAgentProfileService(root).getProfile(owner);
  assert.equal(persisted.name, "첫 번째 이름");
  assert.equal(persisted.tone, "짧고 명확하게");
});

test("agent profile reads wait for the durable profile lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-read-lock-"));
  const owner = principal("profile-read-lock");
  const service = createAiAgentProfileService(root, { now: () => "2026-09-29T12:00:00.000Z" });
  const profile = await service.updateProfile(owner, { name: "기존 이름" });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableAiAgentProfileLock(root, owner.userId, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.getProfile(owner).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveAiAgentProfileUnlocked(root, { ...profile, name: "잠금 해제 후 이름", updatedAt: "2026-09-29T12:00:01.000Z" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read).name, "잠금 해제 후 이름");
});

test("public agent profile store reads and writes wait for the shared profile lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-store-lock-"));
  const owner = principal("profile-store-lock");
  const service = createAiAgentProfileService(root, { now: () => "2026-09-29T12:00:00.000Z" });
  const profile = await service.updateProfile(owner, { name: "기존 이름" });
  const updated = { ...profile, name: "잠금 해제 후 이름", updatedAt: "2026-09-29T12:00:01.000Z" };
  const holdProfileLock = async () => {
    let release!: () => void;
    let acquired!: () => void;
    const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
    const holder = withDurableAiAgentProfileLock(root, owner.userId, async () => {
      acquired();
      await new Promise<void>((resolve) => { release = resolve; });
    }, { waitForMs: 0 });
    await acquiredPromise;
    return { holder, release };
  };

  const saveLock = await holdProfileLock();
  let saveSettled = false;
  const pendingSave = saveAiAgentProfile(root, updated).then(() => { saveSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(saveSettled, false);
  saveLock.release();
  await saveLock.holder;
  await pendingSave;

  const loadLock = await holdProfileLock();
  let loadSettled = false;
  const pendingLoad = loadAiAgentProfile(root, owner.userId).then((value) => {
    loadSettled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(loadSettled, false);
  loadLock.release();
  await loadLock.holder;
  assert.equal((await pendingLoad)?.name, "잠금 해제 후 이름");
});

test("agent profile rejects invalid names, oversized text, and unsafe avatar URLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-agent-profile-"));
  const service = createAiAgentProfileService(root);
  const owner = principal("profile-validation");

  await assert.rejects(() => service.updateProfile(owner, { name: "   " }), /Agent name is required/);
  await assert.rejects(() => service.updateProfile(owner, { name: "x".repeat(41) }), /Agent name must be between/);
  for (const avatarUrl of [
    "javascript:alert(1)",
    "https://user:password@example.com/avatar.png",
    "https://example.com\\@attacker.example.com/avatar.png",
    "https://example.com/%5Cavatar.png",
    "https://example.com/avatar\n.png",
    "https://example.com/avatar\t.png",
  ]) {
    await assert.rejects(() => service.updateProfile(owner, { avatarUrl }), /avatar URL/);
  }
  const dataUrl = await service.updateProfile(owner, { avatarUrl: "data:image/png;base64,AAAA" });
  assert.equal(dataUrl.avatarUrl, "data:image/png;base64,AAAA");
  await assert.rejects(() => service.updateProfile(owner, { personality: "x".repeat(501) }), /personality must be/);
});
