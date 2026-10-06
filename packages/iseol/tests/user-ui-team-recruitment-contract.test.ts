import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("team recruitment UI exposes manager application review through the durable API", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Teams.tsx"), "utf8"),
  ]);
  assert.match(api, /getRecruitmentPost/);
  assert.match(api, /reviewRecruitmentApplication/);
  assert.match(page, /지원서 검토/);
  assert.match(page, /지원 수락/);
  assert.match(page, /지원 거절/);
  assert.match(page, /지원 상태를 저장했습니다/);
});

test("community UI uses durable per-user like state and refreshes the public post list", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Community.tsx"), "utf8"),
  ]);
  assert.match(page, /toggleCommunityLike/);
  assert.match(page, /viewerLiked/);
  assert.match(page, /likeCount/);
  assert.match(api, /toggleCommunityLike/);
  assert.match(api, /\/api\/user\/community\/\$\{encodeURIComponent\(postId\)\}\/like/);
});

test("teams UI exposes owner-scoped AI member permissions without claiming autonomous execution", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Teams.tsx"), "utf8"),
  ]);
  assert.match(api, /addAiTeamMember/);
  assert.match(api, /removeAiTeamMember/);
  assert.match(page, /AI 팀원 권한/);
  assert.match(page, /AI 팀원 ID/);
  assert.match(page, /owner-approved-execution/);
  assert.match(page, /소유자 승인/);
});

test("teams UI exposes durable member departure without offering owner self-removal", async () => {
  const [api, page] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Teams.tsx"), "utf8"),
  ]);
  assert.match(api, /export async function leaveTeam/);
  assert.match(api, /\/api\/user\/teams\/\$\{encodeURIComponent\(teamId\)\}\/leave/);
  assert.match(page, /leaveTeam/);
  assert.match(page, /팀 탈퇴/);
  assert.match(page, /viewerRole === 'owner'/);
});
