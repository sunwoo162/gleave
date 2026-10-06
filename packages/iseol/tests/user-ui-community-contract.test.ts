import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("community posts link authors to the owner-scoped public profile route", async () => {
  const page = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Community.tsx"), "utf8");
  assert.match(page, /from 'react-router'/);
  assert.match(page, /to=\{`\/profile\?userId=\$\{encodeURIComponent\(post\.author\.userId\)\}`\}/);
  assert.match(page, /프로필 보기/);
});

test("community posts expose durable comments and a real comment form", async () => {
  const page = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Community.tsx"), "utf8");
  const api = await readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8");
  assert.match(api, /comments: CommunityComment\[\]/);
  assert.match(api, /createCommunityComment/);
  assert.match(page, /post\.comments/);
  assert.match(page, /댓글 입력/);
  assert.match(page, /댓글 작성/);
});

test("community comment browser journey verifies owner notification and return navigation", async () => {
  const e2e = await readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8");
  assert.match(e2e, /community-comment-notification/);
  assert.match(e2e, /새 커뮤니티 댓글/);
  assert.match(e2e, /notification-bell/);
});

test("community exposes bounded report actions for posts and comments", async () => {
  const page = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Community.tsx"), "utf8");
  const api = await readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8");
  const e2e = await readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8");
  assert.match(api, /reportCommunityContent/);
  assert.match(page, /게시글 신고/);
  assert.match(page, /댓글 신고/);
  assert.match(page, /신고 사유/);
  assert.match(page, /신고가 저장되었습니다/);
  assert.match(e2e, /community-moderation/);
});

test("community keeps report drafts and busy state bound to each target", async () => {
  const page = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Community.tsx"), "utf8");
  assert.match(page, /reportDraftKey/);
  assert.match(page, /report-reason-post-/);
  assert.match(page, /report-reason-comment-/);
  assert.match(page, /const targetKey = reportDraftKey\('comment', comment\.id\)/);
  assert.match(page, /report\(post, 'comment', comment\.id, targetKey\)/);
});
