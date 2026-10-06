import { randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { RecruitmentApplication, RecruitmentInput, RecruitmentPost, RecruitmentService, RecruitmentServiceOptions } from "./contracts.js";
import { withDurableRecruitmentApplicationLock } from "./application-lock.js";
import { withDurableRecruitmentReviewLock } from "./review-lock.js";
import { listApplicationsUnlocked, listPostsUnlocked, loadApplication, loadApplicationUnlocked, loadPost, loadPostUnlocked, saveApplication, saveApplicationUnlocked, savePost } from "./store.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function required(value: string, label: string, max: number): string { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label} is required`); return trimmed; }

export function createRecruitmentService(root: string, options: RecruitmentServiceOptions): RecruitmentService {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async createPost(principal, input: RecruitmentInput) {
      ensurePrincipal(principal); if (!["project", "study"].includes(input.kind)) throw new Error("Invalid recruitment kind"); if (!await options.teamService.isManager(principal, input.teamId)) throw new Error("Team manager access required"); const at = now(); assertTimestamp(at, "recruitment timestamp"); const post: RecruitmentPost = { version: 1, id: `recruit-${randomUUID()}`, teamId: input.teamId, authorUserId: principal.userId, kind: input.kind, title: required(input.title, "Recruitment title", 200), description: required(input.description, "Recruitment description", 5_000), roles: input.roles.map((role) => required(role, "Recruitment role", 120)).slice(0, 32), tags: input.tags.map((tag) => required(tag, "Recruitment tag", 80)).slice(0, 32), status: "open", createdAt: at, updatedAt: at }; await savePost(root, post); await options.activityService?.recordActivityEvent(principal, { sourceType: "recruitment", sourceId: post.id, eventType: "recruitment.post.created", eventVersion: 1, actorType: "user", verificationStatus: "verified", payload: { teamId: post.teamId, kind: post.kind } }); return post;
    },
    async listPosts(principal, kind) {
      ensurePrincipal(principal);
      const candidates = await listPostsUnlocked(root);
      const current: RecruitmentPost[] = [];
      for (const candidate of candidates) {
        await withDurableTeamMembershipLock(root, candidate.teamId, async () => {
          const post = await loadPostUnlocked(root, candidate.id);
          if (post?.status === "open" && (!kind || post.kind === kind)) current.push(post);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getPost(principal, postId) {
      ensurePrincipal(principal); try { assertIdentityId(postId); } catch { return null; }
      const initialPost = await loadPost(root, postId); if (!initialPost) return null;
      const readPostContext = () => withDurableTeamMembershipLock(root, initialPost.teamId, async () => {
        const post = await loadPostUnlocked(root, postId);
        if (!post) return null;
        const canSeeApplications = await options.teamService.isManagerWithinMembershipLock(principal, post.teamId);
        if (!canSeeApplications && post.status !== "open") return null;
        return { post, canSeeApplications };
      }, { waitForMs: 2_000 });
      const initialContext = await readPostContext();
      if (!initialContext || !initialContext.canSeeApplications) return initialContext ? { post: initialContext.post, applications: [] } : null;
      const candidates = (await listApplicationsUnlocked(root)).filter((item) => item.postId === initialContext.post.id);
      const applications = [] as NonNullable<Awaited<ReturnType<typeof loadApplication>>>[];
      for (const candidate of candidates) {
        const current = await withDurableRecruitmentReviewLock(root, candidate.id, async () => {
          const context = await readPostContext();
          if (!context || !context.canSeeApplications) return null;
          const application = await loadApplicationUnlocked(root, candidate.id);
          if (!application || application.postId !== context.post.id) return null;
          return application;
        }, { waitForMs: 2_000 });
        if (current) applications.push(current);
      }
      const finalContext = await readPostContext();
      if (!finalContext) return null;
      return { post: finalContext.post, applications: finalContext.canSeeApplications ? applications.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [] };
    },
    async apply(principal, postId, message) {
      ensurePrincipal(principal);
      const initialPost = await loadPost(root, postId);
      if (!initialPost || initialPost.status !== "open") throw new Error("Recruitment post not found");
      const initialTeam = await options.teamService.getTeam(principal, initialPost.teamId);
      if (initialTeam?.members.some((member) => member.userId === principal.userId)) throw new Error("Already a team member");
      return withDurableTeamMembershipLock(root, initialPost.teamId, async () => withDurableRecruitmentApplicationLock(root, postId, principal.userId, async () => {
        const post = await loadPostUnlocked(root, postId);
        if (!post || post.status !== "open") throw new Error("Recruitment post not found");
        const team = await options.teamService.getTeamWithinMembershipLock(principal, post.teamId);
        if (team?.members.some((member) => member.userId === principal.userId)) throw new Error("Already a team member");
        const existing = (await listApplicationsUnlocked(root)).find((item) => item.postId === postId && item.applicantUserId === principal.userId && ["pending", "accepted"].includes(item.status));
        if (existing) return { application: existing, created: false };
        const at = now();
        assertTimestamp(at, "application timestamp");
        const application: RecruitmentApplication = { version: 1, id: `application-${randomUUID()}`, postId, teamId: post.teamId, applicantUserId: principal.userId, message: required(message, "Application message", 5_000), status: "pending", createdAt: at, updatedAt: at };
        await saveApplication(root, application);
        await options.activityService?.recordActivityEvent(principal, { sourceType: "recruitment", sourceId: application.id, eventType: "recruitment.application.created", eventVersion: 1, actorType: "user", verificationStatus: "verified", payload: { postId: application.postId, teamId: application.teamId } });
        return { application, created: true };
      }, { waitForMs: 2_000 }), { waitForMs: 2_000 });
    },
    async reviewApplication(principal, applicationId, action) {
      ensurePrincipal(principal); assertIdentityId(applicationId); if (!["accept", "reject"].includes(action)) throw new Error("Invalid application action");
      const initial = await loadApplication(root, applicationId); if (!initial) throw new Error("Application not found");
      return withDurableRecruitmentReviewLock(root, applicationId, async () => withDurableTeamMembershipLock(root, initial.teamId, async () => {
        const current = await loadApplicationUnlocked(root, applicationId); if (!current || current.teamId !== initial.teamId || !await options.teamService.isManagerWithinMembershipLock(principal, current.teamId) || current.status !== "pending") throw new Error("Application not found");
        const at = now(); const next: RecruitmentApplication = { ...current, status: action === "accept" ? "accepted" : "rejected", updatedAt: at }; if (action === "accept") await options.teamService.addMemberWithinMembershipLock(current.teamId, current.applicantUserId, "member", at); await saveApplicationUnlocked(root, next); await options.activityService?.recordActivityEvent(principal, { sourceType: "recruitment", sourceId: next.id, eventType: "recruitment.application.reviewed", eventVersion: 1, actorType: "user", verificationStatus: "verified", payload: { action, applicantUserId: next.applicantUserId, teamId: next.teamId } }); if (action === "accept" && options.notificationService) { let enabled = !options.settingsService; if (options.settingsService) { try { enabled = (await options.settingsService.getSettings({ userId: current.applicantUserId, sessionId: "notification-system", roles: ["system"] })).notifications.teamInvite; } catch { enabled = false; } } if (enabled) await options.notificationService.createTeamInviteNotification({ userId: current.applicantUserId, teamId: current.teamId, applicationId: next.id, actorUserId: principal.userId, createdAt: at }); } return next;
      }, { waitForMs: 2_000 }), { waitForMs: 2_000 });
    },
  };
}
