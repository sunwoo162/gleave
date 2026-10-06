import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const executablePath = process.env.ISEOL_TEST_BROWSER ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

const LEARNING_PROJECT_RUNTIME_TIMEOUT_MS = 30_000;

if (!executablePath) {
  throw new Error("Set ISEOL_TEST_BROWSER to an installed test browser; the E2E runner never uses the operational browser profile");
}

function waitForServerUrl(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/ISEOL_BROWSER_SERVER_URL=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        child.stdout.off("data", onData);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`isolated browser server exited before binding (${code ?? "unknown"})`)));
  });
}

async function stopServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit").then(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, 3_000)),
  ]);
}

async function allowLocalRequests(context: BrowserContext): Promise<void> {
  await context.route("**/*", route => {
    const hostname = new URL(route.request().url()).hostname;
    return hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
}

async function verifyUnauthenticatedBoundary(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/app/world`);
    await page.waitForURL(/\/app\/login$/);
    await page.getByRole('heading', { name: '다시 돌아오셨군요!' }).waitFor();
  } finally {
    await context.close();
  }
}

async function verifyInformationRoutesUi(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/app/`);
  await page.getByRole("link", { name: "이용 원칙", exact: true }).waitFor();
  await page.getByRole("link", { name: "개인정보 안내", exact: true }).waitFor();
  await page.getByRole("link", { name: "도움말", exact: true }).waitFor();
  const routes: Array<{ path: string; heading: string; marker: string }> = [
    { path: "/terms", heading: "이용 원칙", marker: "AI 제안과 실행" },
    { path: "/privacy", heading: "개인정보 및 데이터 범위", marker: "개인 영역" },
    { path: "/help", heading: "도움말", marker: "처음 시작하기" },
  ];
  for (const route of routes) {
    const response = await page.goto(`${baseUrl}/app${route.path}`);
    if (!response || response.status() !== 200) throw new Error(`information route did not return HTTP 200: ${route.path}`);
    await page.getByRole("heading", { name: route.heading, exact: true }).waitFor();
    await page.getByText(route.marker, { exact: true }).waitFor();
  }
  await page.goto(`${baseUrl}/app/information-route-does-not-exist`);
  await page.getByRole("heading", { name: "페이지를 찾을 수 없어요", exact: true }).waitFor();
}

async function verifyLogoutAndRelogin(page: Page, baseUrl: string, email: string, password: string, displayName: string): Promise<void> {
  const oldToken = await browserSessionToken(page);
  await page.goto(`${baseUrl}/app/settings`);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.waitForURL(/\/app\/login$/);
  await page.getByRole("heading", { name: "다시 돌아오셨군요!", exact: true }).waitFor();

  const revokedStatus = await page.evaluate(async (token) => {
    const response = await fetch("/api/user/me", { headers: { authorization: `Bearer ${token}` } });
    return response.status;
  }, oldToken);
  if (revokedStatus !== 401) throw new Error(`logout left the previous server session usable: ${revokedStatus}`);

  await page.locator("#login-email").fill(email);
  await page.locator("#login-pw").fill(password);
  const unauthorizedRequests: string[] = [];
  const sessionSnapshots: string[] = [];
  const captureSessionSnapshot = async (label: string): Promise<void> => {
    const snapshot = await page.evaluate(() => {
      const raw = window.localStorage.getItem('iseol.platform.session');
      if (!raw) return 'missing';
      try {
        const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
        return `present:${Boolean(parsed.token)}:${parsed.expiresAt ?? 'none'}`;
      } catch {
        return 'malformed';
      }
    });
    sessionSnapshots.push(`${label}=${snapshot}`);
  };
  const recordUnauthorized = (response: import("playwright-core").Response) => {
    if (response.status() === 401) unauthorizedRequests.push(`${response.request().method()} ${new URL(response.url()).pathname} auth=${Boolean(response.request().headers().authorization)}`);
  };
  const recordLoginResponse = (response: import("playwright-core").Response) => {
    if (new URL(response.url()).pathname === '/api/user/login') void captureSessionSnapshot(`login-response-${response.status()}`);
  };
  page.on("response", recordUnauthorized);
  page.on("response", recordLoginResponse);
  await page.getByRole("button", { name: "로그인 → 내 세계로", exact: true }).click();
  await page.waitForURL(/\/app\/world$/);
  try {
    await page.locator("main").getByText(displayName, { exact: true }).first().waitFor();
  } catch (error) {
    const diagnostics = await page.evaluate(async () => {
      const session = window.localStorage.getItem('iseol.user.session');
      const [me, world] = await Promise.all([
        fetch('/api/user/me').then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) })),
        fetch('/api/user/world').then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) })),
      ]);
      return {
        url: window.location.href,
        hasSession: Boolean(session),
        meStatus: me.status,
        meDisplayName: me.body?.user?.displayName ?? null,
        worldStatus: world.status,
        worldDisplayName: world.body?.world?.displayName ?? null,
        mainText: document.querySelector('main')?.textContent?.slice(0, 400) ?? null,
      };
    });
    await captureSessionSnapshot('diagnostic');
    throw new Error(`relogin returned to world without the expected display name: ${JSON.stringify({ ...diagnostics, unauthorizedRequests, sessionSnapshots })}; ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    page.off("response", recordUnauthorized);
    page.off("response", recordLoginResponse);
  }
}

async function verifyWeeklyDigestAvailabilityUi(page: Page, baseUrl: string): Promise<void> {
  await signUpAndOnboard(page, baseUrl, `browser-weekly-digest-${Date.now()}@local.test`, "브라우저 알림 경계");
  await page.goto(`${baseUrl}/app/settings`);
  await page.locator("nav").getByRole("button", { name: "알림", exact: true }).click();
  await page.getByText("주간 활동 요약", { exact: true }).waitFor();
  await page.getByText("준비 중", { exact: true }).waitFor();
  const weeklySwitch = page.getByRole("switch", { name: "주간 활동 요약", exact: true });
  await weeklySwitch.waitFor();
  if (!(await weeklySwitch.isDisabled())) throw new Error("weekly digest switch was exposed as active");
  if ((await weeklySwitch.getAttribute("aria-disabled")) !== "true") throw new Error("weekly digest switch did not expose aria-disabled");
}

async function signUpAndOnboard(page: Page, baseUrl: string, email: string, displayName: string): Promise<void> {
  await page.goto(`${baseUrl}/app/signup`);
  await page.locator("#signup-name").fill(displayName);
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-pw").fill("local-e2e-password");
  await page.getByRole("button", { name: "다음 단계 →" }).click();
  await page.getByRole("button", { name: /계정 생성/ }).click();
  await page.waitForURL(/\/app\/onboarding$/);

  await page.getByRole("button", { name: "시작하기 →" }).click();
  await page.locator("#onboard-name").fill(displayName);
  await page.getByRole("button", { name: /로 시작할게요/ }).click();
  await page.getByRole("button", { name: /퍼플 마법사/ }).click();
  await page.getByRole("button", { name: "이 캐릭터로 할게요 →" }).click();
  await page.getByRole("button", { name: "건너뛰기 →" }).click();
  await page.getByRole("button", { name: "계속 →" }).click();
  await page.getByRole("button", { name: "이설과 함께 시작하기 →" }).click();
  await page.getByRole("button", { name: /내 세계로 이동/ }).click();
  await page.waitForURL(/\/app\/world$/);
  await page.locator("main").getByText(displayName, { exact: true }).first().waitFor();
}

async function assertResponsive(page: Page, baseUrl: string): Promise<void> {
  const routes = [
    "/app/world",
    "/app/idea-lab",
    "/app/projects",
    "/app/learning",
    "/app/ai-chat",
    "/app/teams",
    "/app/community",
    "/app/friends",
    "/app/profile",
    "/app/activity",
    "/app/portfolio",
    "/app/memory",
    "/app/settings",
  ];
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      if (overflow.documentWidth > overflow.viewportWidth + 1) {
        throw new Error(`horizontal overflow at ${route} ${width}px: ${overflow.documentWidth}px > ${overflow.viewportWidth}px`);
      }
    }
  }
}

async function createCommunityPost(page: Page): Promise<void> {
  await page.goto(new URL("/app/community", page.url()).toString());
  await page.getByRole("button", { name: /글 쓰기/ }).click();
  await page.getByLabel("게시글 제목").fill("로컬 브라우저 검증 기록");
  await page.getByLabel("게시글 내용").fill("두 사용자 컨텍스트에서 공개 커뮤니티 기록이 실제로 저장되고 보이는지 확인합니다.");
  await page.getByRole("button", { name: "게시글 저장" }).click();
  await page.getByRole("status").waitFor();
  await page.getByRole("heading", { name: "로컬 브라우저 검증 기록", exact: true }).waitFor();
}

async function verifyCommunityLikePersistence(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const title = "로컬 브라우저 검증 기록";
  await pageB.goto(`${baseUrl}/app/community`);
  const accountBPost = pageB.locator("article").filter({ hasText: title });
  await accountBPost.getByText(title, { exact: true }).waitFor();
  await accountBPost.getByRole("button", { name: "좋아요 0" }).click();
  await accountBPost.getByRole("button", { name: "좋아요 취소 1" }).waitFor();

  await pageB.reload();
  const reloadedAccountBPost = pageB.locator("article").filter({ hasText: title });
  await reloadedAccountBPost.getByRole("button", { name: "좋아요 취소 1" }).waitFor();

  await pageA.goto(`${baseUrl}/app/community`);
  const accountAPost = pageA.locator("article").filter({ hasText: title });
  await accountAPost.getByRole("button", { name: "좋아요 1" }).waitFor();

  await pageB.goto(`${baseUrl}/app/community`);
  const commentPost = pageB.locator("article").filter({ hasText: title });
  await commentPost.getByLabel(`댓글 입력 ${title}`).fill("브라우저에서 확인한 실제 댓글입니다.");
  await commentPost.getByRole("button", { name: `댓글 작성 ${title}` }).click();
  await commentPost.getByText("브라우저에서 확인한 실제 댓글입니다.", { exact: true }).waitFor();
  await pageB.reload();
  await pageB.locator("article").filter({ hasText: title }).getByText("브라우저에서 확인한 실제 댓글입니다.", { exact: true }).waitFor();

  const reportReason = pageB.getByLabel(`신고 사유 ${title}`);
  await reportReason.fill("공개 게시글 신고 사유입니다.");
  await pageB.getByRole("button", { name: `게시글 신고 ${title}`, exact: true }).click();
  await pageB.getByText("신고가 저장되었습니다.", { exact: true }).waitFor();
  const commentRow = pageB.locator("article").filter({ hasText: title }).locator("li").filter({ hasText: "브라우저에서 확인한 실제 댓글입니다." });
  await commentRow.getByLabel(/댓글 신고 사유/).fill("공개 댓글 신고 사유입니다.");
  await commentRow.getByRole("button", { name: /댓글 신고/ }).click();
  await pageB.getByText("신고가 저장되었습니다.", { exact: true }).waitFor();
  await pageB.reload();
  await pageB.locator("article").filter({ hasText: title }).getByText("브라우저에서 확인한 실제 댓글입니다.", { exact: true }).waitFor();

  await pageA.goto(`${baseUrl}/app/community`);
  if (await pageA.getByText("공개 게시글 신고 사유입니다.", { exact: true }).count() !== 0 || await pageA.getByText("공개 댓글 신고 사유입니다.", { exact: true }).count() !== 0) {
    throw new Error("community report reasons leaked into the public Community view");
  }
  await pageA.locator("article").filter({ hasText: title }).getByText("브라우저에서 확인한 실제 댓글입니다.", { exact: true }).waitFor();

  await pageA.getByTestId("notification-bell").click();
  const notificationDialog = pageA.getByRole("dialog", { name: "알림" });
  const communityNotification = notificationDialog.locator("button").filter({ hasText: "새 커뮤니티 댓글" });
  await communityNotification.waitFor();
  await communityNotification.click();
  await pageA.waitForURL(/\/app\/community$/);
  await pageA.locator("article").filter({ hasText: title }).getByText("브라우저에서 확인한 실제 댓글입니다.", { exact: true }).waitFor();
}

async function browserSessionToken(page: Page): Promise<string> {
  const raw = await page.evaluate(() => window.localStorage.getItem("iseol.platform.session"));
  const session = raw ? JSON.parse(raw) as { token?: string } : null;
  if (!session?.token) throw new Error("browser session token was not available for the isolated ACL journey");
  return session.token;
}

async function browserApi(baseUrl: string, token: string, path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function verifyPrivateTeamAcl(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const teamResult = await browserApi(baseUrl, tokenA, "/api/user/teams", { method: "POST", body: JSON.stringify({ name: "브라우저 비공개 팀", description: "격리 브라우저 ACL 검증용 팀", kind: "project", visibility: "private", capacity: 4 }) });
  const projectResult = await browserApi(baseUrl, tokenA, "/api/user/projects", { method: "POST", body: JSON.stringify({ name: "브라우저 비공개 프로젝트", objective: "팀 합류 전후의 프로젝트 읽기 권한을 검증합니다.", purpose: "portfolio", teamMode: "human", teamId: teamResult.team.id }) });
  const beforeJoin = await browserApi(baseUrl, tokenB, "/api/user/projects");
  if (beforeJoin.projects.some((project: { id: string }) => project.id === projectResult.project.id)) throw new Error("private team project leaked before membership acceptance");

  const postResult = await browserApi(baseUrl, tokenA, "/api/user/recruitment", { method: "POST", body: JSON.stringify({ teamId: teamResult.team.id, kind: "project", title: "브라우저 팀원 모집", description: "ACL 검증을 위한 실제 모집 공고입니다.", roles: ["검증 담당"], tags: ["local-e2e"] }) });
  await pageB.goto(`${baseUrl}/app/teams`);
  await pageB.getByRole("button", { name: /브라우저 팀원 모집/ }).click();
  await pageB.getByLabel("지원 메시지").fill("팀 프로젝트에 합류하겠습니다.");
  await pageB.getByRole("button", { name: "지원서 보내기 →", exact: true }).click();
  await pageB.getByText("지원이 저장되었습니다. 팀 관리자의 검토를 기다려주세요.", { exact: true }).waitFor();
  const postDetail = await browserApi(baseUrl, tokenA, `/api/user/recruitment/${encodeURIComponent(postResult.post.id)}`);
  const application = postDetail.applications.find((item: { applicantUserId: string; status: string }) => item.status === "pending");
  if (!application) throw new Error("pending team application was not durable");
  await pageA.goto(`${baseUrl}/app/teams`);
  await pageA.getByRole("button", { name: /브라우저 팀원 모집/ }).click();
  await pageA.getByText("지원서 검토", { exact: true }).waitFor();
  await pageA.getByRole("button", { name: "지원 수락", exact: true }).click();
  await pageA.getByText("지원 상태를 저장했습니다.", { exact: true }).waitFor();
  await pageB.reload();
  await pageB.waitForFunction(() => document.querySelector('[data-testid="notification-bell"]')?.getAttribute('aria-label') === '알림 1개');
  await pageB.getByTestId("notification-bell").click();
  const teamInviteNotification = pageB.getByRole("dialog", { name: "알림" });
  await teamInviteNotification.getByText("팀 합류 승인", { exact: true }).waitFor();
  await teamInviteNotification.getByText("팀 합류 승인", { exact: true }).click();
  await pageB.waitForURL(/\/app\/teams$/);
  await pageB.getByRole("button", { name: "알림", exact: true }).waitFor();
  const teamInviteInbox = await browserApi(baseUrl, tokenB, "/api/user/notifications");
  if (teamInviteInbox.unreadCount !== 0) throw new Error(`team invite notification was not durably marked read: ${JSON.stringify(teamInviteInbox)}`);
  const afterJoin = await browserApi(baseUrl, tokenB, "/api/user/projects");
  if (!afterJoin.projects.some((project: { id: string }) => project.id === projectResult.project.id)) throw new Error("accepted team member could not read the team project");
  await pageB.goto(`${baseUrl}/app/projects`);
  await pageB.getByText("브라우저 비공개 프로젝트", { exact: true }).waitFor();

  await pageA.goto(`${baseUrl}/app/teams`);
  await pageA.getByRole("heading", { name: "팀 채팅", exact: true }).waitFor();
  await pageA.getByLabel("팀 채팅 팀").selectOption(teamResult.team.id);
  await pageB.goto(`${baseUrl}/app/teams`);
  await pageB.getByRole("heading", { name: "팀 채팅", exact: true }).waitFor();
  await pageB.getByLabel("팀 채팅 팀").selectOption(teamResult.team.id);
  await pageB.getByLabel("팀 메시지 입력").fill("브라우저 팀 채팅 메시지");
  await pageB.getByRole("button", { name: "팀 메시지 전송", exact: true }).click();
  await pageB.getByText("팀 메시지를 저장했습니다.", { exact: true }).waitFor();
  await pageB.getByText("브라우저 팀 채팅 메시지", { exact: true }).waitFor();
  await pageA.waitForFunction(() => document.querySelector('[data-testid="notification-bell"]')?.getAttribute('aria-label') === '알림 1개');
  await pageB.reload();
  await pageB.getByText("브라우저 팀 채팅 메시지", { exact: true }).waitFor();
  await pageA.reload();
  await pageA.getByRole("heading", { name: "팀 채팅", exact: true }).waitFor();
  await pageA.getByLabel("팀 채팅 팀").selectOption(teamResult.team.id);
  await pageA.getByText("브라우저 팀 채팅 메시지", { exact: true }).waitFor();

  await pageB.reload();
  await pageB.waitForFunction(() => document.querySelector('[data-testid="notification-bell"]')?.getAttribute('aria-label') === '알림');
  await pageA.reload();
  const notificationBell = pageA.getByTestId("notification-bell");
  await notificationBell.waitFor();
  await pageA.waitForFunction(() => document.querySelector('[data-testid="notification-bell"]')?.getAttribute('aria-label') === '알림 1개');
  await notificationBell.click();
  const notificationDialog = pageA.getByRole("dialog", { name: "알림" });
  await notificationDialog.getByText("새 팀 메시지", { exact: true }).waitFor();
  await notificationDialog.getByText("새 팀 메시지", { exact: true }).click();
  await pageA.waitForURL(/\/app\/teams$/);
  await pageA.reload();
  await pageA.getByTestId("notification-bell").click();
  await pageA.getByRole("dialog", { name: "알림" }).getByText("읽지 않음 0", { exact: true }).waitFor();

  await pageB.goto(`${baseUrl}/app/teams`);
  await pageB.getByRole("heading", { name: "내가 참여한 팀", exact: true }).waitFor();
  await pageB.getByRole("button", { name: "브라우저 비공개 팀 팀 탈퇴", exact: true }).click();
  await pageB.getByRole("button", { name: "탈퇴 확인", exact: true }).click();
  await pageB.getByText("브라우저 비공개 팀 팀에서 탈퇴했습니다.", { exact: true }).waitFor();
  const afterLeave = await browserApi(baseUrl, tokenB, "/api/user/projects");
  if (afterLeave.projects.some((project: { id: string }) => project.id === projectResult.project.id)) throw new Error("left team member retained private team project access");
  await pageB.goto(`${baseUrl}/app/projects`);
  if (await pageB.getByText("브라우저 비공개 프로젝트", { exact: true }).count() !== 0) throw new Error("left team member still saw the private project in the UI");
  await pageB.goto(`${baseUrl}/app/teams`);
  const chatTeamSelectCount = await pageB.getByLabel("팀 채팅 팀").count();
  const remainingChatTeamNames = chatTeamSelectCount > 0 ? await pageB.getByLabel("팀 채팅 팀").locator("option").allTextContents() : [];
  if (remainingChatTeamNames.some((name) => name.includes("브라우저 비공개 팀"))) throw new Error("left team member retained private team chat access in the UI");
  const ownerAfterLeave = await browserApi(baseUrl, tokenA, "/api/user/projects");
  if (!ownerAfterLeave.projects.some((project: { id: string }) => project.id === projectResult.project.id)) throw new Error("owner lost project access after member departure");
}

async function verifyProjectTeamTransitionOnPages(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const suffix = Date.now().toString(36);
  const team = await browserApi(baseUrl, tokenA, "/api/user/teams", { method: "POST", body: JSON.stringify({ name: `브라우저 진행 중 팀 ${suffix}`, description: "진행 중 프로젝트 팀 전환과 ACL 보존 검증용 팀", kind: "project", visibility: "private", capacity: 4 }) });
  const project = await browserApi(baseUrl, tokenA, "/api/user/projects", { method: "POST", body: JSON.stringify({ name: `브라우저 진행 중 팀 전환 ${suffix}`, objective: "실행 중인 작업 공간을 유지한 채 팀 구성을 바꿉니다.", purpose: "portfolio", teamMode: "solo" }) });
  const projectId = project.project.id as string;
  const taskTitle = `팀 전환 뒤에도 유지되는 작업 ${suffix}`;
  const work = await browserApi(baseUrl, tokenA, `/api/user/projects/${encodeURIComponent(projectId)}/work-requests`, { method: "POST", body: JSON.stringify({ title: taskTitle, objective: "팀 전환에도 Work Request와 workspace tree를 보존합니다.", idempotencyKey: `team-transition-${suffix}` }) });
  const projectPath = `/api/user/projects/${encodeURIComponent(projectId)}`;
  const workRequestId = work.request.id as string;

  const statusOnly = async (token: string, path: string): Promise<number> => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
    return response.status;
  };
  const loadView = () => browserApi(baseUrl, tokenA, projectPath);
  const waitForView = async (predicate: (view: any) => boolean, label: string): Promise<any> => {
    let lastView: any = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      lastView = await loadView();
      if (predicate(lastView)) return lastView;
      await pageA.waitForTimeout(50);
    }
    throw new Error(`${label} was not durable: ${JSON.stringify(lastView)}`);
  };
  const assertWorkPreserved = (view: any, expectedMode: string, expectedTeamId?: string) => {
    if (view.project.teamMode !== expectedMode || (expectedTeamId ? view.project.teamId !== expectedTeamId : view.project.teamId)) {
      throw new Error(`project team state was not preserved for ${expectedMode}: ${JSON.stringify(view.project)}`);
    }
    const request = view.workRequests.find((item: { id: string }) => item.id === workRequestId);
    if (!request || request.status !== "queued" || request.runId) throw new Error(`team transition changed the queued Work Request: ${JSON.stringify({ request, expectedMode })}`);
    if (!view.workspace.tree.some((node: { title: string }) => node.title === taskTitle)) throw new Error(`team transition removed the workspace task node: ${JSON.stringify(view.workspace.tree)}`);
  };
  const saveMode = async (mode: "solo" | "ai" | "human" | "mixed", expectedTeamId?: string) => {
    await pageA.reload();
    await pageA.getByRole("heading", { name: project.project.name, exact: true }).waitFor();
    await pageA.locator('select[aria-label="진행 중 팀 모드"]').selectOption(mode);
    if (mode === "human" || mode === "mixed") await pageA.getByLabel("진행 중 팀 ID").fill(expectedTeamId ?? "");
    const teamPatch = pageA.waitForResponse((response) => response.url().includes(`/api/user/projects/${encodeURIComponent(projectId)}/team`) && response.request().method() === "PATCH");
    await pageA.getByRole("button", { name: "구성 저장", exact: true }).click();
    const teamResponse = await teamPatch;
    if (!teamResponse.ok()) throw new Error(`team mode ${mode} PATCH failed with ${teamResponse.status()}: ${await teamResponse.text()}`);
    const view = await waitForView((next) => next.project.teamMode === mode && (expectedTeamId ? next.project.teamId === expectedTeamId : !next.project.teamId), `team mode ${mode}`);
    assertWorkPreserved(view, mode, expectedTeamId);
    await pageA.getByText(`팀 ${mode}`, { exact: false }).waitFor();
  };

  await pageA.goto(`${baseUrl}/app/projects/${encodeURIComponent(projectId)}`);
  await pageA.getByRole("heading", { name: project.project.name, exact: true }).waitFor();
  await pageA.getByText(taskTitle, { exact: true }).first().waitFor();
  await pageA.locator('select[aria-label="진행 중 팀 모드"]').waitFor();
  const initialView = await loadView();
  assertWorkPreserved(initialView, "solo");
  const beforeJoin = await browserApi(baseUrl, tokenB, "/api/user/projects");
  if (beforeJoin.projects.some((item: { id: string }) => item.id === projectId)) throw new Error("solo project leaked before the team transition");

  const post = await browserApi(baseUrl, tokenA, "/api/user/recruitment", { method: "POST", body: JSON.stringify({ teamId: team.team.id, kind: "project", title: `진행 중 팀 전환 모집 ${suffix}`, description: "사람 팀 전환 전 멤버십을 연결합니다.", roles: ["검증 담당"], tags: ["team-transition-e2e"] }) });
  await browserApi(baseUrl, tokenB, `/api/user/recruitment/${encodeURIComponent(post.post.id)}/applications`, { method: "POST", body: JSON.stringify({ message: "진행 중 프로젝트 팀 전환 검증에 합류합니다." }) });
  const detail = await browserApi(baseUrl, tokenA, `/api/user/recruitment/${encodeURIComponent(post.post.id)}`);
  const application = detail.applications.find((item: { status: string }) => item.status === "pending");
  if (!application) throw new Error("team transition membership application was not durable");
  await browserApi(baseUrl, tokenA, `/api/user/recruitment/applications/${encodeURIComponent(application.id)}`, { method: "POST", body: JSON.stringify({ action: "accept" }) });

  await saveMode("human", team.team.id);
  await pageB.goto(`${baseUrl}/app/projects`);
  await pageB.getByText(project.project.name, { exact: true }).waitFor();
  await pageB.goto(`${baseUrl}/app/projects/${encodeURIComponent(projectId)}`);
  await pageB.getByRole("heading", { name: project.project.name, exact: true }).waitFor();
  await pageB.getByText(taskTitle, { exact: true }).first().waitFor();
  const afterHuman = await browserApi(baseUrl, tokenB, projectPath);
  if (afterHuman.project.teamMode !== "human" || afterHuman.project.teamId !== team.team.id) throw new Error("accepted team member could not read the human-team project after transition");

  await pageA.bringToFront();
  await saveMode("mixed", team.team.id);
  await pageB.reload();
  await pageB.getByText(taskTitle, { exact: true }).first().waitFor();
  const afterMixed = await browserApi(baseUrl, tokenB, projectPath);
  if (afterMixed.project.teamMode !== "mixed" || afterMixed.project.teamId !== team.team.id) throw new Error("accepted team member lost mixed-team project access");

  await pageA.bringToFront();
  await saveMode("ai");
  if ((await browserApi(baseUrl, tokenB, "/api/user/projects")).projects.some((item: { id: string }) => item.id === projectId)) throw new Error("team member retained project access after switching to AI team");
  if (await statusOnly(tokenB, projectPath) !== 404) throw new Error("team member could still GET the AI-team project after leaving the human ACL");
  await pageB.goto(`${baseUrl}/app/projects/${encodeURIComponent(projectId)}`);
  await pageB.getByText("프로젝트를 찾을 수 없습니다.", { exact: true }).waitFor();

  await pageA.bringToFront();
  await saveMode("solo");
  if ((await browserApi(baseUrl, tokenB, "/api/user/projects")).projects.some((item: { id: string }) => item.id === projectId)) throw new Error("team member retained project access after switching to solo");
  if (await statusOnly(tokenB, projectPath) !== 404) throw new Error("team member could still GET the solo project after ACL removal");
  await pageA.reload();
  await pageA.getByRole("heading", { name: project.project.name, exact: true }).waitFor();
  await pageA.getByText(taskTitle, { exact: true }).first().waitFor();
  if (await pageA.locator('select[aria-label="진행 중 팀 모드"]').inputValue() !== "solo") throw new Error("final team mode did not survive browser reload");

  const activity = await browserApi(baseUrl, tokenA, "/api/user/activity");
  const transitions = activity.events.filter((event: { eventType: string; sourceId: string; verificationStatus: string }) => event.eventType === "project.team.changed" && event.sourceId.startsWith(`${projectId}:team:`) && event.verificationStatus === "verified");
  if (transitions.length !== 4 || new Set(transitions.map((event: { sourceId: string }) => event.sourceId)).size !== 4) throw new Error(`team transition activity evidence was incomplete: ${JSON.stringify(transitions)}`);
}

async function verifyProjectTeamTransitionUi(browser: Browser, baseUrl: string): Promise<void> {
  const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(accountA);
  await allowLocalRequests(accountB);
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();
  try {
    await signUpAndOnboard(pageA, baseUrl, `browser-team-transition-a-${Date.now()}@local.test`, "브라우저 팀 전환 A");
    await signUpAndOnboard(pageB, baseUrl, `browser-team-transition-b-${Date.now()}@local.test`, "브라우저 팀 전환 B");
    await verifyProjectTeamTransitionOnPages(pageA, pageB, baseUrl);
  } finally {
    await accountA.close();
    await accountB.close();
  }
}

async function verifyAiTeamMemberControls(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const teamResult = await browserApi(baseUrl, tokenA, "/api/user/teams", { method: "POST", body: JSON.stringify({ name: "브라우저 AI 권한 팀", description: "AI 팀원 권한 경계 검증용 팀", kind: "project", visibility: "public", capacity: 4 }) });
  await pageA.goto(`${baseUrl}/app/teams`);
  await pageA.getByText("AI 팀원 권한", { exact: true }).waitFor();
  await pageA.getByLabel("AI 팀 권한 팀").selectOption(teamResult.team.id);
  await pageA.getByLabel("AI 팀원 ID").fill("frontend");
  await pageA.getByLabel("AI 팀원 역할").fill("frontend");
  await pageA.getByLabel("AI 팀원 capabilities").fill("context.read, task.propose");
  await pageA.getByLabel("AI 팀원 승인 범위").selectOption("suggestion-only");
  await pageA.getByRole("button", { name: "AI 팀원 추가", exact: true }).click();
  await pageA.getByText("AI 팀원을 저장했습니다.", { exact: true }).waitFor();
  await pageA.getByText("frontend · frontend", { exact: true }).waitFor();
  await pageA.reload();
  await pageA.getByText("frontend · frontend", { exact: true }).waitFor();
  await pageA.getByText("context.read, task.propose · 제안만", { exact: true }).waitFor();
  await pageA.getByRole("button", { name: "권한 제거", exact: true }).click();
  await pageA.getByText("AI 팀원 권한을 제거했습니다.", { exact: true }).waitFor();
  await pageA.getByText("아직 추가된 AI 팀원이 없습니다.", { exact: true }).waitFor();

  await pageB.goto(`${baseUrl}/app/teams`);
  if (await pageB.getByText("AI 팀원 권한", { exact: true }).count() !== 0) throw new Error("non-manager account received the AI team member management panel");
}

async function verifyStudyWorkspacePersistence(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA); const tokenB = await browserSessionToken(pageB);
  const team = await browserApi(baseUrl, tokenA, "/api/user/teams", { method: "POST", body: JSON.stringify({ name: "브라우저 스터디 팀", description: "공유 수업과 개인 답변 격리 검증용 팀", kind: "study", visibility: "public", capacity: 4 }) });
  const post = await browserApi(baseUrl, tokenA, "/api/user/recruitment", { method: "POST", body: JSON.stringify({ teamId: team.team.id, kind: "study", title: "브라우저 스터디 합류", description: "스터디 workspace 브라우저 검증", roles: ["학습자"], tags: ["study-e2e"] }) });
  await browserApi(baseUrl, tokenB, `/api/user/recruitment/${encodeURIComponent(post.post.id)}/applications`, { method: "POST", body: JSON.stringify({ message: "스터디에 합류합니다." }) });
  const detail = await browserApi(baseUrl, tokenA, `/api/user/recruitment/${encodeURIComponent(post.post.id)}`);
  const application = detail.applications.find((item: { status: string }) => item.status === "pending");
  if (!application) throw new Error("study application was not durable");
  await browserApi(baseUrl, tokenA, `/api/user/recruitment/applications/${encodeURIComponent(application.id)}`, { method: "POST", body: JSON.stringify({ action: "accept" }) });

  await pageA.goto(`${baseUrl}/app/teams`);
  await pageA.getByText("스터디 공간", { exact: true }).waitFor();
  await pageA.getByLabel("공유 수업 공간 제목").fill("브라우저 TypeScript 스터디");
  await pageA.getByLabel("공유 수업 공간 설명").fill("실제 저장되는 공유 수업 공간입니다.");
  await pageA.getByRole("button", { name: "공간 저장", exact: true }).click();
  await pageA.getByText("공유 스터디 공간을 저장했습니다.", { exact: true }).waitFor();
  await pageA.getByLabel("팀 과제 제목").fill("타입 좁히기 설명");
  await pageA.getByLabel("팀 과제 설명").fill("union narrowing 예제를 설명하세요.");
  await pageA.getByRole("button", { name: "과제 추가", exact: true }).click();
  await pageA.getByText("팀 과제를 저장했습니다.", { exact: true }).waitFor();
  await pageA.getByText("타입 좁히기 설명", { exact: true }).waitFor();

  await pageB.goto(`${baseUrl}/app/teams`);
  await pageB.getByRole("heading", { name: "브라우저 TypeScript 스터디", exact: true }).waitFor();
  await pageB.getByText("타입 좁히기 설명", { exact: true }).waitFor();
  await pageB.getByLabel("내 답변").fill("account B의 개인 답변");
  await pageB.getByRole("button", { name: "내 답변 저장", exact: true }).click();
  await pageB.getByText("내 답변을 저장했습니다.", { exact: true }).waitFor();
  await pageB.reload();
  await pageB.getByText("내 답변 저장됨", { exact: true }).waitFor();

  await pageA.reload();
  await pageA.getByRole("heading", { name: "브라우저 TypeScript 스터디", exact: true }).waitFor();
  if (await pageA.getByText("account B의 개인 답변", { exact: true }).count() !== 0) throw new Error("study member answer leaked to another team member");
}

async function createAndVerifyPublicPortfolio(page: Page, baseUrl: string): Promise<string> {
  const raw = await page.evaluate(() => window.localStorage.getItem("iseol.platform.session"));
  const session = raw ? JSON.parse(raw) as { token?: string } : null;
  if (!session?.token) throw new Error("browser session token was not available for the isolated portfolio journey");
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.token}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
    return response.json() as Promise<any>;
  };
  const learningGoal = await request("/api/user/learning/goals", { method: "POST", body: JSON.stringify({ subjectText: "브라우저 TypeScript 학습 목표", duration: { days: 14 }, dailyMinutes: 30 }) });
  if (learningGoal.goal.status !== "draft" || learningGoal.goal.input.dailyMinutes !== 30) throw new Error("learning goal draft was not durable");
  await page.goto(`${baseUrl}/app/learning`);
  await page.getByText("새 학습 목표", { exact: true }).waitFor();
  await page.getByLabel("학습 분야").fill("브라우저 TypeScript 학습 목표");
  await page.getByLabel("학습 기간").fill("14");
  await page.getByLabel("하루 학습 시간").fill("30");
  await page.getByRole("button", { name: "학습 목표 초안 저장" }).click();
  await page.getByText("브라우저 TypeScript 학습 목표", { exact: true }).first().waitFor();
  await page.reload();
  await page.getByText("브라우저 TypeScript 학습 목표", { exact: true }).first().waitFor();
  const goalsAfterReload = await request("/api/user/learning/goals") as { goals: Array<{ id: string; input: { subjectText: string }; revision: number }> };
  const previewGoal = goalsAfterReload.goals.find((goal) => goal.input.subjectText === "브라우저 TypeScript 학습 목표");
  if (!previewGoal) throw new Error("learning goal was not available for plan preview");
  const planPreview = await request(`/api/user/learning/goals/${encodeURIComponent(previewGoal.id)}/plan-preview`, { method: "POST", body: JSON.stringify({ expectedRevision: previewGoal.revision }) }) as { interpretation: { source: { kind: string } }; plan: { days: unknown[] } };
  if (planPreview.interpretation.source.kind !== "local-template" || planPreview.plan.days.length !== 14) throw new Error("learning plan preview was not durable");
  await page.reload();
  await page.getByRole("button", { name: "학습 계획 미리보기" }).first().click();
  await page.getByText(/local-template/).first().waitFor();
  await page.getByLabel(/재조정 하루 시간/).first().fill("25");
  await page.getByRole("button", { name: "재조정안 만들기", exact: true }).click();
  await page.getByText(/수락 전 재조정안/).waitFor();
  await page.getByRole("button", { name: "이 재조정안 수락", exact: true }).click();
  await page.getByText(/수락된 재조정안/).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "학습 계획 미리보기" }).first().click();
  await page.getByText(/local-template/).first().waitFor();
  await page.getByRole("button", { name: "오늘의 학습 세션 시작" }).first().click();
  await page.getByText("활성 세션", { exact: true }).waitFor();
  await page.getByText(/오늘 상태: 학습 중/).first().waitFor();
  const goalSessions = await request("/api/user/learning/sessions") as { sessions: Array<{ id: string; goalId?: string; status: string }> };
  const goalSession = goalSessions.sessions.find((candidate) => candidate.goalId && candidate.status === "active");
  if (!goalSession) throw new Error("goal day session was not durable");
  const contentRequest = await request(`/api/user/learning/sessions/${encodeURIComponent(goalSession.id)}/content`, { method: "POST", body: "{}" }) as { request: { state: string; scope: string; id: string } };
  if (contentRequest.request.state !== "waiting-runtime" || contentRequest.request.scope !== "private") throw new Error("learning content request did not preserve the local Runtime boundary");
  await page.reload();
  const contentAfterReload = await request(`/api/user/learning/sessions/${encodeURIComponent(goalSession.id)}/content`) as { request: { id: string; state: string } };
  if (contentAfterReload.request.id !== contentRequest.request.id || contentAfterReload.request.state !== "waiting-runtime") throw new Error("learning content request was not durable after browser reload");
  const progressBeforeCompletion = await request(`/api/user/learning/goals/${encodeURIComponent(previewGoal.id)}/progress`) as { progress: { schedule: { plannedDays: number }; actual: { sessions: { active: number } }; warnings: string[] } };
  if (progressBeforeCompletion.progress.schedule.plannedDays !== 14 || progressBeforeCompletion.progress.actual.sessions.active !== 1 || progressBeforeCompletion.progress.warnings.some((warning) => /숙달률|percentage|percent/i.test(warning))) throw new Error("learning progress did not preserve evidence-only boundaries");
  await page.getByText("콘텐츠 상태: 로컬 Runtime 대기", { exact: true }).waitFor();
  await page.getByText("진도 근거", { exact: true }).first().waitFor();
  await page.getByLabel("학습 도움 요청").fill("제네릭 타입 보존을 이해할 수 있게 힌트를 주세요.");
  await page.getByRole("button", { name: "힌트 요청" }).click();
  await page.getByText(/학습 도움 요청을 저장했습니다/).waitFor();
  const actionState = await request(`/api/user/learning/sessions/${encodeURIComponent(goalSession.id)}/actions`) as { actions: Array<{ type: string; status: string; question?: string; response?: string }> };
  const waitingAction = actionState.actions.find((action) => action.type === "hint" && action.question === "제네릭 타입 보존을 이해할 수 있게 힌트를 주세요.");
  if (!waitingAction || waitingAction.status !== "waiting-runtime" || waitingAction.response) throw new Error("learning action did not preserve the local Runtime waiting boundary");
  await page.reload();
  await page.getByText("학습 도움 기록", { exact: true }).waitFor();
  await request(`/api/user/learning/sessions/${encodeURIComponent(goalSession.id)}/complete`, { method: "POST", body: "{}" });
  const plan = await request("/api/user/learning/plans", { method: "POST", body: JSON.stringify({ title: "브라우저 포트폴리오 학습", description: "공개 포트폴리오 증거 생성", goals: ["검증"] }) });
  const learningSession = await request("/api/user/learning/sessions", { method: "POST", body: JSON.stringify({ planId: plan.plan.id }) });
  await request("/api/user/learning/attempts", { method: "POST", body: JSON.stringify({ sessionId: learningSession.session.id, questionId: "browser-e2e", answer: "verified", correct: true }) });
  const codingExercise = await request("/api/user/learning/coding-exercises", { method: "POST", body: JSON.stringify({ sessionId: learningSession.session.id, title: "브라우저 코딩 문제", prompt: "타입을 보존하는 함수를 작성하세요.", language: "typescript", estimatedMinutes: 10 }) });
  const codingAttempt = await request(`/api/user/learning/coding-exercises/${encodeURIComponent(codingExercise.exercise.id)}/attempts`, { method: "POST", body: JSON.stringify({ clientRequestId: "browser-coding-attempt-1", response: "function identity<T>(value: T): T { return value; }" }) });
  if (codingAttempt.attempt.practiceResult.status !== "environment-required") throw new Error("coding attempt was presented as executed without an isolated executor");
  const answerReceipt = await request(`/api/user/learning/sessions/${encodeURIComponent(learningSession.session.id)}/answers`, { method: "POST", body: JSON.stringify({ exerciseId: codingExercise.exercise.id, attemptId: codingAttempt.attempt.id, response: codingAttempt.attempt.response, artifactRefs: [] }) });
  const feedback = await request(`/api/user/learning/answers/${encodeURIComponent(answerReceipt.answer.id)}/feedback`);
  if (answerReceipt.answer.status !== "evaluation-pending" || feedback.feedback.status !== "pending") throw new Error("learning answer was not preserved as pending evaluation");
  const dispute = await request(`/api/user/learning/feedback/${encodeURIComponent(feedback.feedback.id)}/disputes`, { method: "POST", body: JSON.stringify({ reason: "브라우저 검증에서 평가 근거를 다시 확인합니다." }) });
  if (dispute.dispute.status !== "waiting-runtime" || dispute.feedback.status !== "disputed" || dispute.answer.status !== "disputed") throw new Error("learning feedback dispute did not preserve the Runtime boundary");
  await page.goto(`${baseUrl}/app/learning`);
  await page.getByText("코딩 테스트 학습", { exact: true }).waitFor();
  await page.getByRole("button", { name: /브라우저 코딩 문제/ }).click();
  await page.getByText(/현재 상태: 환경 필요/).waitFor();
  await page.getByText("평가 상태: 재평가 대기", { exact: false }).waitFor();
  const syntaxExercise = await request("/api/user/learning/coding-exercises", { method: "POST", body: JSON.stringify({ sessionId: learningSession.session.id, title: "브라우저 구문 문제", prompt: "유효한 JavaScript를 작성하세요.", language: "javascript", estimatedMinutes: 5 }) }) as { exercise: { id: string } };
  await page.reload();
  await page.getByRole("button", { name: /브라우저 구문 문제/ }).click();
  await page.getByLabel("코딩 테스트 답변").fill("const answer = 1;");
  await page.getByRole("button", { name: "답변 저장", exact: true }).click();
  await page.getByText(/현재 상태: 구문 확인됨/).waitFor();
  const syntaxAttempts = await request(`/api/user/learning/coding-exercises/${encodeURIComponent(syntaxExercise.exercise.id)}/attempts`) as { attempts: Array<{ practiceResult: { status: string; receipt?: { checkKind: string; passed: boolean } } }> };
  if (syntaxAttempts.attempts[0]?.practiceResult.status !== "syntax-verified" || syntaxAttempts.attempts[0]?.practiceResult.receipt?.checkKind !== "syntax-only" || syntaxAttempts.attempts[0]?.practiceResult.receipt?.passed !== true) throw new Error("local coding syntax verifier receipt was not durable through the approved UI");
  const completedSession = await request(`/api/user/learning/sessions/${encodeURIComponent(learningSession.session.id)}/complete`, { method: "POST", body: "{}" });
  if (completedSession.session.status !== "completed") throw new Error("learning session completion was not durable in the browser journey");
  const reviewPrompt = `브라우저 복습 질문 ${Date.now()}`;
  await page.getByLabel("복습 질문").fill(reviewPrompt);
  await page.getByLabel("복습 답변").fill("타입 관계를 보존하는 제네릭 제약입니다.");
  await page.getByRole("button", { name: "복습 항목 저장", exact: true }).click();
  await page.getByText(reviewPrompt, { exact: true }).waitFor();
  await page.getByRole("button", { name: "이해함", exact: true }).click();
  await page.getByText("현재 도래한 복습 항목이 없습니다.", { exact: true }).waitFor();
  const rescheduledReviews = await request("/api/user/learning/reviews?at=2099-01-01T00:00:00.000Z");
  const rescheduled = rescheduledReviews.items.find((item: { prompt: string }) => item.prompt === reviewPrompt);
  if (!rescheduled || rescheduled.reviewCount !== 1 || rescheduled.intervalDays !== 2) throw new Error("learning review did not persist its next scheduled interval");
  await page.goto(`${baseUrl}/app/learning`);
  await page.getByText("완료된 세션", { exact: true }).waitFor();
  const portfolio = await request("/api/user/portfolio");
  const evidence = portfolio.evidence.find((item: { verificationStatus: string }) => item.verificationStatus === "verified");
  if (!evidence) throw new Error("verified portfolio evidence was not projected from the learning attempt");
  const reviewEvidence = portfolio.evidence.find((item: { sourceType: string; sourceId: string; summary: string; verificationStatus: string }) => item.sourceType === "activity" && item.summary.includes("learning.review.completed") && item.verificationStatus === "verified");
  if (!reviewEvidence) throw new Error("completed learning review was not projected as verified portfolio evidence");
  const entry = await request("/api/user/portfolio", { method: "POST", body: JSON.stringify({ title: "브라우저 검증 포트폴리오", summary: "실제 로컬 학습 기록에서 생성된 공개 항목", visibility: "public", evidenceIds: [evidence.id] }) }) as { entry: { id: string; title: string } };

  await page.goto(`${baseUrl}/app/portfolio`);
  await page.getByRole("button", { name: "JSON 내보내기" }).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON 내보내기" }).click(),
  ]);
  if (!download.suggestedFilename().endsWith(".json")) throw new Error(`unexpected portfolio export filename: ${download.suggestedFilename()}`);
  const jsonPath = await download.path();
  if (!jsonPath) throw new Error("portfolio JSON export did not expose a download path");
  const jsonExport = JSON.parse(await readFile(jsonPath, "utf8")) as { entries?: Array<{ id: string; title: string }>; evidence?: unknown[] };
  if (!jsonExport.entries?.some((item) => item.id === entry.entry.id && item.title === entry.entry.title) || !Array.isArray(jsonExport.evidence)) throw new Error("portfolio JSON export did not contain the durable entry and evidence collections");

  const [markdownDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Markdown 내보내기" }).click(),
  ]);
  if (markdownDownload.suggestedFilename() !== "iseol-portfolio.md") throw new Error(`unexpected portfolio Markdown filename: ${markdownDownload.suggestedFilename()}`);
  const markdownPath = await markdownDownload.path();
  if (!markdownPath) throw new Error("portfolio Markdown export did not expose a download path");
  const markdownExport = await readFile(markdownPath, "utf8");
  if (!markdownExport.includes("# ISEOL Portfolio") || !markdownExport.includes(`## ${entry.entry.title}`) || !markdownExport.includes("실제 로컬 학습 기록에서 생성된 공개 항목")) throw new Error("portfolio Markdown export did not contain the durable entry content");

  await page.getByRole("button", { name: "공개 링크 복사", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "공개 포트폴리오 링크" }).waitFor();
  await page.getByRole("link", { name: "공개 포트폴리오 열기", exact: true }).click();
  await page.getByText(entry.entry.title, { exact: true }).waitFor();

  await page.goto(`${baseUrl}/app/portfolio/public/${encodeURIComponent(entry.entry.id)}`);
  await page.getByText(entry.entry.title, { exact: true }).waitFor();
  await page.getByText("실제 로컬 학습 기록에서 생성된 공개 항목", { exact: true }).waitFor();
  return entry.entry.id;
}

async function verifyLearningProjectApplicationUi(page: Page, baseUrl: string): Promise<void> {
  const token = await browserSessionToken(page);
  const suffix = Date.now();
  const subject = `브라우저 학습 적용 목표 ${suffix}`;
  const projectName = `브라우저 학습 적용 프로젝트 ${suffix}`;
  const projectResult = await browserApi(baseUrl, token, "/api/user/projects", {
    method: "POST",
    body: JSON.stringify({ name: projectName, objective: "학습 증거에서 승인 가능한 작업 초안을 만듭니다.", purpose: "portfolio", teamMode: "solo" }),
  });
  const goalResult = await browserApi(baseUrl, token, "/api/user/learning/goals", {
    method: "POST",
    body: JSON.stringify({ subjectText: subject, duration: { days: 7 }, dailyMinutes: 20 }),
  });

  await page.goto(`${baseUrl}/app/learning`);
  await page.getByRole("heading", { name: "학습 내용을 프로젝트에 적용", exact: true }).waitFor();
  const projectSelect = page.getByLabel(`학습 적용 프로젝트 ${subject}`, { exact: true });
  await projectSelect.selectOption(projectResult.project.id);
  await projectSelect.locator("..", { has: page.getByRole("button", { name: "적용 초안 만들기", exact: true }) }).getByRole("button", { name: "적용 초안 만들기", exact: true }).click();
  try {
    await page.getByText("프로젝트 적용 초안을 저장했습니다. 실행은 별도 승인 전까지 시작되지 않습니다.", { exact: true }).waitFor({ timeout: 5_000 });
  } catch (error) {
    const body = await page.locator("main").innerText().catch(() => "<main unavailable>");
    throw new Error(`learning project application draft did not save: ${String(error)}\n${body.slice(-4000)}`);
  }
  await page.getByRole("button", { name: "학습 적용 작업 수락", exact: true }).click();
  await page.getByText("프로젝트 Work Request를 만들었습니다. 실행은 기존 승인·Runtime 절차를 따릅니다.", { exact: true }).waitFor();

  const view = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectResult.project.id)}`) as { workRequests: Array<{ title: string; status: string; runId?: string }> };
  const workRequest = view.workRequests.find((request) => request.title === `${subject} 적용 작업`);
  if (!workRequest || workRequest.status !== "queued" || workRequest.runId) throw new Error("accepted learning application did not persist an unexecuted Work Request");
  await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(projectResult.project.id)}`);
  await page.getByText(`${subject} 적용 작업`, { exact: true }).first().waitFor();

  const proposals = await browserApi(baseUrl, token, `/api/user/learning/goals/${encodeURIComponent(goalResult.goal.id)}/project-proposals`) as { proposals: Array<{ id: string; status: string; workRequestId?: string }> };
  const accepted = proposals.proposals.find((application) => application.status === "accepted");
  if (!accepted || accepted.workRequestId !== workRequest.id) throw new Error("accepted learning application was not durable after navigation");
  const activity = await browserApi(baseUrl, token, "/api/user/activity");
  const acceptedActivity = activity.events.filter((event: { eventType: string; sourceId: string; status: string; verificationStatus: string }) => event.eventType === "learning.project.application.accepted" && event.sourceId === accepted.id && event.status === "active" && event.verificationStatus === "unverified");
  if (acceptedActivity.length !== 1) throw new Error(`accepted learning application did not produce exactly one unverified ActivityEvent: ${JSON.stringify(activity.events)}`);
}

async function verifyLearningReportUi(page: Page, baseUrl: string): Promise<void> {
  const token = await browserSessionToken(page);
  const suffix = Date.now();
  const subject = `브라우저 근거 보고 목표 ${suffix}`;
  const goalResult = await browserApi(baseUrl, token, "/api/user/learning/goals", {
    method: "POST",
    body: JSON.stringify({ subjectText: subject, duration: { days: 3 }, dailyMinutes: 20 }),
  });
  const planPreview = await browserApi(baseUrl, token, `/api/user/learning/goals/${encodeURIComponent(goalResult.goal.id)}/plan-preview`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: goalResult.goal.revision }),
  }) as { goal: { revision: number }; plan: { id: string; days: Array<{ id: string }> } };
  const learningSession = await browserApi(baseUrl, token, `/api/user/learning/goals/${encodeURIComponent(goalResult.goal.id)}/start`, {
    method: "POST",
    body: JSON.stringify({ planVersionId: planPreview.plan.id, dayId: planPreview.plan.days[0]?.id, expectedRevision: planPreview.goal.revision }),
  }) as { session: { id: string } };
  await browserApi(baseUrl, token, "/api/user/learning/attempts", {
    method: "POST",
    body: JSON.stringify({ sessionId: learningSession.session.id, questionId: `browser-report-${suffix}`, answer: "verified", correct: true }),
  });
  await browserApi(baseUrl, token, `/api/user/learning/sessions/${encodeURIComponent(learningSession.session.id)}/complete`, { method: "POST", body: "{}" });
  const date = planPreview.plan.days[0]?.localDate;
  if (!date) throw new Error("learning report browser journey did not receive a local plan date");
  await page.goto(`${baseUrl}/app/learning`);
  await page.getByRole("heading", { name: "학습 주간·최종 보고", exact: true }).waitFor();
  await page.getByLabel("보고 시작일", { exact: true }).fill(date);
  await page.getByLabel("보고 종료일", { exact: true }).fill(date);
  await page.getByRole("button", { name: "근거 기반 보고서 생성", exact: true }).first().click();
  await page.getByText("기간 보고서를 저장했습니다. 검증된 이해와 미검증 self-report를 분리해 기록했습니다.", { exact: true }).waitFor();
  await page.getByLabel("보고 유형", { exact: true }).selectOption("final");
  await page.getByRole("button", { name: "근거 기반 보고서 생성", exact: true }).first().click();
  await page.getByText("기간 보고서를 저장했습니다. 검증된 이해와 미검증 self-report를 분리해 기록했습니다.", { exact: true }).waitFor();
  const reportPath = `/api/user/learning/goals/${encodeURIComponent(goalResult.goal.id)}/reports`;
  type BrowserReport = { id: string; goalSubject: string; period: { kind: string }; provenance: { kind: string }; verifiedOutcomes: Array<{ evidenceRefs: string[] }>; summary: string };
  let reports = await browserApi(baseUrl, token, reportPath) as { reports: BrowserReport[] };
  const reportDeadline = Date.now() + 5_000;
  while (!reports.reports.some((candidate) => candidate.goalSubject === subject && candidate.period.kind === "final") && Date.now() < reportDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    reports = await browserApi(baseUrl, token, reportPath) as { reports: BrowserReport[] };
  }
  const report = reports.reports.find((candidate) => candidate.goalSubject === subject && candidate.period.kind === "final");
  if (!report || report.provenance.kind !== "local-evidence" || report.verifiedOutcomes.length === 0 || !/숙달이나 역량을 주장하지 않습니다/.test(report.summary)) throw new Error(`learning report did not preserve verified evidence-only boundaries: ${JSON.stringify({ date, report })}`);
  await page.reload();
  await page.getByText(subject, { exact: true }).first().waitFor();
  const draftButton = page.getByRole("button", { name: "학습 보고서를 포트폴리오 초안으로 저장", exact: true }).last();
  try {
    await draftButton.waitFor();
  } catch (error) {
    const body = await page.locator("main").innerText().catch(() => "<main unavailable>");
    throw new Error(`learning report portfolio draft action was not rendered: ${body.slice(-5000)}; ${error instanceof Error ? error.message : String(error)}`);
  }
  await draftButton.click();
  await page.getByText("학습 보고서를 비공개 포트폴리오 초안으로 저장했습니다. 포트폴리오에서 편집 후 공개할 수 있습니다.", { exact: true }).waitFor();
  const portfolio = await browserApi(baseUrl, token, "/api/user/portfolio") as { entries: Array<{ title: string; visibility: string; evidenceIds: string[] }> };
  const draft = portfolio.entries.find((entry) => entry.title === `${subject} 학습 보고서 초안`);
  const reportIds = reports.reports.filter((candidate) => candidate.goalSubject === subject).map((candidate) => candidate.id);
  if (!draft || draft.visibility !== "private" || !draft.evidenceIds.some((evidenceId) => reportIds.some((reportId) => evidenceId.startsWith(`learning-report:${reportId}:`)))) {
    throw new Error(`learning report portfolio draft was not private or linked to the report evidence: ${JSON.stringify(portfolio.entries)}`);
  }
  await page.goto(`${baseUrl}/app/portfolio`);
  await page.getByText(`${subject} 학습 보고서 초안`, { exact: true }).waitFor();
  await page.getByRole("button", { name: `포트폴리오 ${subject} 학습 보고서 초안 편집`, exact: true }).click();
  await page.getByLabel("포트폴리오 항목 공개 범위 수정", { exact: true }).selectOption("public");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByText("포트폴리오를 수정했습니다.", { exact: true }).waitFor();
  const publishedPortfolio = await browserApi(baseUrl, token, "/api/user/portfolio") as { entries: Array<{ id: string; title: string; summary: string; visibility: string; evidenceIds: string[] }> };
  const publishedDraft = publishedPortfolio.entries.find((entry) => entry.title === `${subject} 학습 보고서 초안`);
  if (!publishedDraft || publishedDraft.visibility !== "public" || publishedDraft.evidenceIds.length === 0) {
    throw new Error(`learning report portfolio draft was not published with evidence: ${JSON.stringify(publishedPortfolio.entries)}`);
  }
  const publicView = await browserApi(baseUrl, token, `/api/public/portfolio/${encodeURIComponent(publishedDraft.id)}`) as { entry: { title: string; summary: string; visibility: string }; evidence: Array<{ summary: string; actorType: string; verificationStatus: string }> };
  if (publicView.entry.visibility !== "public" || publicView.entry.title !== publishedDraft.title || publicView.evidence.length === 0 || publicView.evidence.some((item) => item.verificationStatus !== "verified")) {
    throw new Error(`published learning report portfolio did not expose only verified evidence: ${JSON.stringify(publicView)}`);
  }
  await page.locator(`a[aria-label="공개 포트폴리오 열기"][href$="/app/portfolio/public/${encodeURIComponent(publishedDraft.id)}"]`).click();
  await page.getByRole("heading", { name: `${subject} 학습 보고서 초안`, exact: true }).waitFor();
  await page.getByText(/검증된 활동 근거 \d+개/).waitFor();
  await page.getByText(/검증된 정답 시도/).waitFor();
}

async function verifyPrivateAiChat(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const prompt = `브라우저 개인 AI 격리 ${Date.now()}`;
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const projectResult = await browserApi(baseUrl, tokenA, "/api/user/projects", {
    method: "POST",
    body: JSON.stringify({ name: `브라우저 AI 맥락 프로젝트 ${Date.now()}`, objective: "선택한 프로젝트의 제한된 메타데이터만 개인 AI 대화에 연결합니다.", purpose: "rapid-prototype", teamMode: "solo" }),
  });
  const projectId = projectResult.project.id as string;
  await pageA.goto(`${baseUrl}/app/ai-chat`);
  await pageA.getByRole("button", { name: "+ 새 대화" }).click();
  await pageA.getByText("새 대화를 만들었습니다.", { exact: true }).waitFor();
  await pageA.getByRole("button", { name: "맥락 편집", exact: true }).click();
  await pageA.getByRole("region", { name: "AI 대화 맥락 편집" }).waitFor();
  const memoryContextCheckbox = pageA.locator("label").filter({ hasText: "개인 기억" }).getByRole("checkbox");
  const learningContextCheckbox = pageA.locator("label").filter({ hasText: "학습 기록" }).getByRole("checkbox");
  if (!(await memoryContextCheckbox.isChecked()) || !(await learningContextCheckbox.isChecked())) throw new Error("AI chat context editor did not start with permitted context enabled");
  await memoryContextCheckbox.uncheck();
  await learningContextCheckbox.uncheck();
  await pageA.getByRole("button", { name: "닫기", exact: true }).click();
  const projectContext = pageA.getByLabel("AI 대화 프로젝트 연결");
  await projectContext.selectOption(projectId);
  const input = pageA.getByRole("textbox", { name: "AI 이설에게 메시지 보내기" });
  await input.fill(prompt);
  await pageA.getByLabel("AI 대화 첨부 파일").setInputFiles({ name: "browser-learning-notes.md", mimeType: "text/markdown", buffer: Buffer.from("# 브라우저 학습 메모\n\n제네릭은 타입 매개변수로 재사용성을 높입니다.", "utf8") });
  await pageA.getByText(/첨부 파일 준비|browser-learning-notes\.md/, { exact: false }).first().waitFor();
  const aiMessageResponsePromise = pageA.waitForResponse((response) => response.url().includes("/api/user/ai-chat/conversations/") && response.url().endsWith("/messages") && response.request().method() === "POST");
  await pageA.getByRole("button", { name: "전송 →" }).click();
  const aiMessageResponse = await aiMessageResponsePromise;
  if (!aiMessageResponse.ok()) throw new Error(`AI attachment message request failed (${aiMessageResponse.status()}): ${await aiMessageResponse.text()}`);
  try {
    await pageA.locator("section").getByText(prompt, { exact: false }).last().waitFor();
  } catch (error) {
    const diagnosticText = await pageA.locator("body").textContent();
    throw new Error(`AI attachment message was not rendered: ${JSON.stringify({ url: pageA.url(), text: diagnosticText?.slice(-1_200) })}; ${error instanceof Error ? error.message : String(error)}`);
  }
  await pageA.getByText(/첨부 파일 · browser-learning-notes\.md/, { exact: false }).waitFor();
  await pageA.locator("section").getByText(/프로젝트 맥락 연결됨/, { exact: false }).waitFor();
  await pageA.getByText("메시지를 저장했습니다. 개인 AI Runtime 연결을 기다리고 있습니다.", { exact: true }).waitFor();
  const conversations = await browserApi(baseUrl, tokenA, "/api/user/ai-chat/conversations");
  const selectedConversation = conversations.conversations.find((item: { messages: Array<{ content: string }> }) => item.messages.some((message) => message.content === prompt));
  const selectedMessage = selectedConversation?.messages.find((message: { content: string; projectId?: string; contextSelection?: { memory: boolean; learningHistory: boolean }; attachments?: Array<{ name: string; content: string }> }) => message.content === prompt);
  if (!selectedMessage || selectedMessage.projectId !== projectId) throw new Error("AI chat did not persist the selected project context");
  if (selectedMessage.contextSelection?.memory !== false || selectedMessage.contextSelection?.learningHistory !== false) throw new Error("AI chat did not persist the edited context selection");
  if (!selectedMessage.attachments?.some((attachment) => attachment.name === "browser-learning-notes.md" && attachment.content.includes("제네릭"))) throw new Error("AI chat did not persist the bounded text attachment");
  await pageA.reload();
  await pageA.locator("section").getByText(prompt, { exact: false }).last().waitFor();
  await pageA.getByText(/첨부 파일 · browser-learning-notes\.md/, { exact: false }).waitFor();
  await pageA.getByRole("button", { name: "맥락 편집", exact: true }).click();
  await pageA.getByRole("region", { name: "AI 대화 맥락 편집" }).waitFor();
  if (await pageA.locator("label").filter({ hasText: "개인 기억" }).getByRole("checkbox").isChecked()) throw new Error("AI chat did not restore the edited memory context selection");
  if (await pageA.locator("label").filter({ hasText: "학습 기록" }).getByRole("checkbox").isChecked()) throw new Error("AI chat did not restore the edited learning context selection");
  await pageA.getByRole("button", { name: "닫기", exact: true }).click();
  if (await projectContext.inputValue() !== projectId) throw new Error("AI chat did not restore the selected project context after reload");
  await pageA.locator("section").getByText(/Runtime 대기/, { exact: false }).first().waitFor();
  const [download] = await Promise.all([
    pageA.waitForEvent("download"),
    pageA.getByRole("button", { name: "대화 내보내기", exact: true }).click(),
  ]);
  if (!/^iseol-ai-conversation-[a-f0-9-]+\.md$/.test(download.suggestedFilename())) throw new Error(`private AI export used an unexpected filename: ${download.suggestedFilename()}`);
  await pageA.getByText("대화 내보내기를 시작했습니다.", { exact: true }).waitFor();

  await browserApi(baseUrl, tokenA, "/api/user/settings", { method: "PATCH", body: JSON.stringify({ aiAccess: { projectFiles: false } }) });
  await pageA.reload();
  await pageA.getByText(/프로젝트 맥락 권한 꺼짐/, { exact: false }).waitFor();
  if (!(await pageA.getByLabel("AI 대화 프로젝트 연결").isDisabled())) throw new Error("AI chat project context selector stayed enabled after projectFiles permission was disabled");
  await browserApi(baseUrl, tokenA, "/api/user/settings", { method: "PATCH", body: JSON.stringify({ aiAccess: { projectFiles: true } }) });

  await pageB.goto(`${baseUrl}/app/ai-chat`);
  await pageB.getByText("저장된 대화가 없습니다.", { exact: true }).waitFor();
  const foreignProjects = await browserApi(baseUrl, tokenB, "/api/user/projects");
  if (foreignProjects.projects.some((item: { id: string }) => item.id === projectId)) {
    throw new Error("AI chat project context leaked the owner-only project into account B");
  }
  if (await pageB.getByText(prompt, { exact: true }).count() !== 0) {
    throw new Error("private AI chat leaked account A conversation into account B");
  }
}

async function verifyAiAgentProfileUi(browser: Browser, baseUrl: string): Promise<void> {
  const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(account);
  const page = await account.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-ai-profile-${Date.now()}@local.test`, "브라우저 AI 프로필");
    const agentName = `브라우저 코치 ${Date.now()}`;
    await page.goto(`${baseUrl}/app/settings`);
    await page.getByRole("button", { name: "AI 설정", exact: true }).click();
    await page.getByText("AI 프로필", { exact: true }).waitFor();
    await page.getByLabel("에이전트 이름", { exact: true }).fill(agentName);
    await page.getByLabel("AI 성격", { exact: true }).fill("차분하고 근거를 확인하는 코치");
    await page.getByLabel("AI 말투", { exact: true }).fill("짧고 따뜻하게");
    await page.getByLabel("AI 역할", { exact: true }).fill("학습 동반자");
    await page.getByRole("button", { name: "AI 프로필 저장", exact: true }).click();
    await page.getByText("개인 AI 프로필을 저장했습니다.", { exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "AI 설정", exact: true }).click();
    await page.getByLabel("에이전트 이름", { exact: true }).waitFor();
    if (await page.getByLabel("에이전트 이름", { exact: true }).inputValue() !== agentName) throw new Error("AI profile name was not durable after settings reload");

    await page.goto(`${baseUrl}/app/ai-chat`);
    await page.getByText(agentName, { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "+ 새 대화" }).click();
    await page.getByText("새 대화를 만들었습니다.", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "AI 이설에게 메시지 보내기" }).fill("프로필 반영 여부를 확인해줘");
    await page.getByRole("button", { name: "전송 →" }).click();
    await page.getByText(agentName, { exact: true }).first().waitFor();
  } finally {
    await account.close();
  }
}

async function verifyPasswordChangeUi(browser: Browser, baseUrl: string): Promise<void> {
  const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(account);
  const page = await account.newPage();
  const email = `browser-password-change-${Date.now()}@local.test`;
  const displayName = "브라우저 비밀번호 변경";
  try {
    await signUpAndOnboard(page, baseUrl, email, displayName);
    await page.goto(`${baseUrl}/app/settings`);
    await page.getByText("보안", { exact: true }).waitFor();
    await page.getByLabel("현재 비밀번호", { exact: true }).fill("local-e2e-password");
    await page.getByLabel("새 비밀번호", { exact: true }).fill("local-e2e-new-password");
    await page.getByLabel("새 비밀번호 확인", { exact: true }).fill("local-e2e-new-password");
    const passwordChangeResponses: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/user/password") || response.url().includes("/api/user/logout")) passwordChangeResponses.push(`${response.request().method()} ${response.url()} ${response.status()}`);
    });
    await page.getByRole("button", { name: "비밀번호 변경", exact: true }).click();
    try {
      await page.waitForURL(/\/login$/);
    } catch (error) {
      throw new Error(`password change did not return to login: ${JSON.stringify({ url: page.url(), responses: passwordChangeResponses, body: (await page.locator("body").textContent())?.slice(-1_000), error: error instanceof Error ? error.message : String(error) })}`);
    }

    await page.locator("#login-email").fill(email);
    await page.locator("#login-pw").fill("local-e2e-password");
    await page.getByRole("button", { name: "로그인 → 내 세계로", exact: true }).click();
    await page.getByText("이메일 또는 비밀번호를 확인해주세요.", { exact: true }).waitFor();

    await page.locator("#login-pw").fill("local-e2e-new-password");
    await page.getByRole("button", { name: "로그인 → 내 세계로", exact: true }).click();
    await page.waitForURL(/\/app\/world$/);
    await page.locator("main").getByText(displayName, { exact: true }).first().waitFor();
  } finally {
    await account.close();
  }
}

async function verifyAiChatExecutionPlanUi(browser: Browser, baseUrl: string): Promise<void> {
  const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(account);
  const page = await account.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-ai-execution-plan-${Date.now()}@local.test`, "브라우저 실행 계획");
    const token = await browserSessionToken(page);
    const projectResult = await browserApi(baseUrl, token, "/api/user/projects", { method: "POST", body: JSON.stringify({ name: `브라우저 계획 연결 프로젝트 ${Date.now()}`, objective: "승인된 AI 계획을 queued 작업 요청으로 연결합니다.", purpose: "portfolio", teamMode: "solo" }) });
    const projectId = projectResult.project.id as string;
    const projectName = projectResult.project.name as string;
    await browserApi(baseUrl, token, "/api/user/settings", { method: "PATCH", body: JSON.stringify({ aiApproval: { buildRun: true } }) });
    await page.goto(`${baseUrl}/app/ai-chat`);
    await page.getByRole("button", { name: "+ 새 대화" }).click();
    await page.getByText("새 대화를 만들었습니다.", { exact: true }).waitFor();
    await page.getByLabel("AI 대화 프로젝트 연결").selectOption(projectId);
    await page.getByRole("textbox", { name: "AI 이설에게 메시지 보내기" }).fill("읽기 전용 실행 계획을 제안해줘");
    await page.getByRole("button", { name: "전송 →" }).click();
    const plan = page.getByRole("region", { name: "AI 실행 계획" });
    await plan.waitFor();
    await plan.getByRole("button", { name: "실행 계획 승인", exact: true }).click();
    await page.getByText("실행 계획 승인 기록을 저장했습니다. 별도 실행은 시작되지 않았습니다.", { exact: true }).waitFor();
    await plan.getByText("승인 기록됨", { exact: true }).waitFor();
    await plan.getByRole("button", { name: "프로젝트 작업 요청 만들기", exact: true }).click();
    await page.getByText("프로젝트 작업 요청을 저장했습니다. 실행은 시작되지 않았습니다.", { exact: true }).waitFor();
    await plan.getByText("프로젝트 작업 요청 연결됨", { exact: false }).waitFor();
    const conversations = await browserApi(baseUrl, token, "/api/user/ai-chat/conversations");
    const approvedPlan = conversations.conversations.flatMap((item: { messages: Array<{ executionPlan?: { status: string; workRequestId?: string } }> }) => item.messages).find((message) => message.executionPlan);
    if (approvedPlan?.executionPlan?.status !== "approved" || !approvedPlan.executionPlan.workRequestId) throw new Error("AI execution-plan approval or work-request handoff was not persisted through the user API");
    await plan.getByRole("link", { name: "프로젝트 작업실에서 실행 승인 검토", exact: true }).click();
    await page.waitForURL(/\/app\/projects\/[^/]+$/);
    await page.getByRole("heading", { name: projectName, exact: true }).waitFor();
    await page.getByText("AI 계획 · 격리 Runtime 읽기 계획", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "승인 후 실행", exact: true }).click();
    await page.getByRole("heading", { name: "실행 승인 확인", exact: true }).waitFor();
    const beforeApproval = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
    const queuedBeforeApproval = beforeApproval.workRequests.find((request: { id: string }) => request.id === approvedPlan?.executionPlan?.workRequestId);
    if (!queuedBeforeApproval || queuedBeforeApproval.status !== "queued" || queuedBeforeApproval.runId || beforeApproval.runtime.status !== "not-started") throw new Error("AI plan workspace link crossed the execution checkpoint before approval");
    await page.getByRole("button", { name: "승인 취소", exact: true }).click();
    await page.goto(`${baseUrl}/app/ai-chat`);

    const projectView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
    const queuedRequest = projectView.workRequests.find((request: { id: string }) => request.id === approvedPlan.executionPlan?.workRequestId);
    if (!queuedRequest || queuedRequest.status !== "queued" || projectView.runtime.status !== "not-started") throw new Error("AI plan handoff did not remain a queued, non-running project task");

    await page.getByRole("button", { name: "+ 새 대화" }).click();
    await page.getByText("새 대화를 만들었습니다.", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "AI 이설에게 메시지 보내기" }).fill("이번에는 계획을 거절해줘");
    await page.getByRole("button", { name: "전송 →" }).click();
    const rejectedPlan = page.getByRole("region", { name: "AI 실행 계획" });
    await rejectedPlan.waitFor();
    await rejectedPlan.getByRole("button", { name: "실행 계획 거절", exact: true }).click();
    await page.getByText("실행 계획 거절 기록을 저장했습니다.", { exact: true }).waitFor();
    await rejectedPlan.getByText("거절됨", { exact: true }).waitFor();
    const afterReject = await browserApi(baseUrl, token, "/api/user/ai-chat/conversations");
    const rejected = afterReject.conversations.flatMap((item: { messages: Array<{ executionPlan?: { status: string } }> }) => item.messages).find((message) => message.executionPlan?.status === "rejected");
    if (!rejected) throw new Error("AI execution-plan rejection was not persisted through the user API");

    await page.reload();
    await page.getByRole("region", { name: "AI 실행 계획" }).getByText("거절됨", { exact: true }).waitFor();
  } finally {
    await account.close();
  }
}

async function verifyActivityExport(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/app/settings`);
  await page.getByRole("button", { name: "개인정보", exact: true }).click();
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "활동 기록 내보내기", exact: true }).click(),
  ]);
  if (jsonDownload.suggestedFilename() !== "iseol-activity-export.json") throw new Error(`unexpected activity export filename: ${jsonDownload.suggestedFilename()}`);
  const jsonPath = await jsonDownload.path();
  if (!jsonPath) throw new Error("JSON activity export did not expose a download path");
  const jsonExport = JSON.parse(await readFile(jsonPath, "utf8")) as { events?: unknown[] };
  if (!Array.isArray(jsonExport.events)) throw new Error("JSON activity export did not contain an events array");
  await page.getByText("활동 기록 내보내기를 시작했습니다.", { exact: true }).waitFor();

  const [markdownDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "활동 기록 Markdown 내보내기", exact: true }).click(),
  ]);
  if (markdownDownload.suggestedFilename() !== "iseol-activity-export.md") throw new Error(`unexpected Markdown activity export filename: ${markdownDownload.suggestedFilename()}`);
  const markdownPath = await markdownDownload.path();
  if (!markdownPath) throw new Error("Markdown activity export did not expose a download path");
  const markdownExport = await readFile(markdownPath, "utf8");
  if (!markdownExport.includes("# ISEOL 활동 기록")) throw new Error("Markdown activity export did not contain its document heading");
  await page.getByText("Markdown 활동 기록 내보내기를 시작했습니다.", { exact: true }).waitFor();
}

async function verifyPersonalSpaceNavigationUi(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/app/settings`);
  const personalSpace = page.getByRole("link", { name: "개인 공간", exact: true });
  await personalSpace.waitFor();
  const href = await personalSpace.getAttribute("href");
  if (!href?.endsWith("/app/world")) throw new Error(`personal space control points to an unexpected route: ${href}`);
  await personalSpace.click();
  await page.waitForURL(/\/app\/world$/);
}

async function verifyMobileNavigationAccessibilityUi(page: Page, baseUrl: string): Promise<void> {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseUrl}/app/settings`);
  const trigger = page.getByRole("button", { name: "전체 메뉴 열기", exact: true });
  await trigger.waitFor();
  if ((await trigger.getAttribute("aria-expanded")) !== "false") throw new Error("mobile menu trigger was open before interaction");
  if ((await trigger.getAttribute("aria-haspopup")) !== "dialog") throw new Error("mobile menu trigger did not expose dialog semantics");
  const controls = await trigger.getAttribute("aria-controls");
  if (controls !== "mobile-navigation-menu") throw new Error(`mobile menu trigger controls an unexpected target: ${controls}`);

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "ISEOL 전체 메뉴", exact: true });
  await dialog.waitFor();
  if ((await dialog.getAttribute("aria-modal")) !== "true") throw new Error("mobile navigation dialog was not modal");
  const close = dialog.getByRole("button", { name: "메뉴 닫기", exact: true });
  await close.waitFor();
  const initialFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (initialFocus !== "메뉴 닫기") throw new Error(`mobile menu did not move focus to close control: ${initialFocus}`);

  await page.keyboard.press("Tab");
  const firstMenuHref = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href"));
  if (!firstMenuHref?.endsWith("/app/character")) throw new Error(`Tab did not enter the first mobile menu link: ${firstMenuHref}`);
  await page.keyboard.press("Shift+Tab");
  const returnedFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (returnedFocus !== "메뉴 닫기") throw new Error(`Shift+Tab did not return to the close control: ${returnedFocus}`);

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  if ((await trigger.getAttribute("aria-expanded")) !== "false") throw new Error("Escape did not close the mobile menu");
  const restoredFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (restoredFocus !== "전체 메뉴 열기") throw new Error(`closing the mobile menu did not restore trigger focus: ${restoredFocus}`);

  await trigger.click();
  await page.keyboard.press("Shift+Tab");
  const lastMenuHref = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href"));
  if (!lastMenuHref?.endsWith("/app/settings")) throw new Error(`reverse Tab did not wrap to the last mobile menu link: ${lastMenuHref}`);
  await page.keyboard.press("Tab");
  const wrappedFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (wrappedFocus !== "메뉴 닫기") throw new Error(`forward Tab did not wrap to the close control: ${wrappedFocus}`);
  await page.keyboard.press("Escape");
}

async function verifyCharacterAssetsUi(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/app/world`);
  await page.locator('img[src="/app/assets/characters/iseol-user-character-v1.png"]').first().waitFor({ state: "attached" });
  await page.locator('img[src="/app/assets/characters/iseol-ai-companion-v1.png"]').first().waitFor({ state: "attached" });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('img[src="/app/assets/characters/iseol-user-character-v1.png"], img[src="/app/assets/characters/iseol-ai-companion-v1.png"]')).every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0));

  const environmentImage = page.locator('img[src="/app/assets/environments/iseol-personal-workshop-v1-provisional.png"]').first();
  await environmentImage.waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const image = document.querySelector('img[src="/app/assets/environments/iseol-personal-workshop-v1-provisional.png"]') as HTMLImageElement | null;
    return Boolean(image && image.complete && image.naturalWidth > 0);
  });
  await environmentImage.evaluate((image) => image.dispatchEvent(new Event("error")));
  await page.getByRole("img", { name: "개인 작업실 환경 — 개인 작업실 환경 자산 대기" }).waitFor();

  await page.goto(`${baseUrl}/app/ai-chat`);
  await page.waitForFunction(() => {
    const image = document.querySelector('img[alt="ISEOL 개인 AI 동반자"]') as HTMLImageElement | null;
    return Boolean(image && image.complete && image.naturalWidth > 0 && image.src.endsWith('/app/assets/characters/iseol-ai-companion-v1.png'));
  });
}

async function verifyCharacterCustomizationUi(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/app/character/customize`);
  await page.getByRole("heading", { name: "캐릭터 · 공간 꾸미기", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const saveButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "저장하기") as HTMLButtonElement | undefined;
    return Boolean(saveButton && !saveButton.disabled);
  });

  await page.getByLabel("헤어스타일", { exact: true }).selectOption("violet-bob");
  await page.getByRole("button", { name: "안경", exact: true }).click();
  if (await page.getByLabel("헤어스타일", { exact: true }).inputValue() !== "violet-bob") throw new Error("character customization did not apply the selected hair style");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page.getByText("캐릭터 설정을 저장했습니다.", { exact: true }).waitFor();

  await page.reload();
  await page.getByRole("heading", { name: "캐릭터 · 공간 꾸미기", exact: true }).waitFor();
  await page.waitForFunction(() => (document.querySelector('[aria-label="헤어스타일"]') as HTMLSelectElement | null)?.value === "violet-bob");
  await page.waitForFunction(() => document.querySelector('button[aria-label="안경"]')?.getAttribute("aria-pressed") === "true");

  await page.getByRole("button", { name: "캐릭터 설정 초기화", exact: true }).click();
  await page.getByText("기본 캐릭터 설정으로 되돌렸습니다. 저장하기를 눌러 반영하세요.", { exact: true }).waitFor();
  if (await page.getByLabel("헤어스타일", { exact: true }).inputValue() !== "blue-wave") throw new Error("character reset did not restore the default hair style draft");
  if ((await page.getByRole("button", { name: "블루 캡", exact: true }).getAttribute("aria-pressed")) !== "true") throw new Error("character reset did not restore the default accessory draft");

  await page.reload();
  await page.getByRole("heading", { name: "캐릭터 · 공간 꾸미기", exact: true }).waitFor();
  await page.waitForFunction(() => (document.querySelector('[aria-label="헤어스타일"]') as HTMLSelectElement | null)?.value === "violet-bob");
  await page.waitForFunction(() => document.querySelector('button[aria-label="안경"]')?.getAttribute("aria-pressed") === "true");
}

async function verifyWorldMissionCompletionUi(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  await pageA.goto(`${baseUrl}/app/world`);
  await pageA.getByRole("button", { name: "오늘의 미션", exact: true }).click();
  const missionButton = pageA.getByRole("button", { name: /^미션 완료 기록:/ }).first();
  await missionButton.waitFor();
  const missionLabel = await missionButton.getAttribute("aria-label");
  const missionId = await missionButton.getAttribute("data-mission-id");
  if (!missionLabel || !missionId) throw new Error("world mission completion control did not expose its accessible label and stable mission identity");
  await missionButton.click();
  await pageA.getByText("미션 완료 기록을 저장했습니다.", { exact: false }).waitFor();
  await pageA.reload();
  await pageA.getByRole("button", { name: "오늘의 미션", exact: true }).click();
  await pageA.getByText("사용자 완료 기록됨", { exact: false }).first().waitFor();
  await pageA.locator(`button[data-mission-id="${missionId}"]`).click();
  await pageA.getByText("미션 완료 기록을 저장했습니다.", { exact: false }).waitFor();

  const eventsA = await browserApi(baseUrl, tokenA, "/api/user/activity") as { events: Array<{ eventType: string; actorType: string; verificationStatus: string; status: string; payload?: Record<string, unknown> }> };
  const missionEvents = eventsA.events.filter((event) => event.eventType === "world.mission.completed" && event.status === "active");
  const missionEvent = missionEvents[0];
  if (missionEvents.length !== 1) throw new Error(`re-recording one world mission created duplicate activity events: ${JSON.stringify(missionEvents)}`);
  if (!missionEvent || missionEvent.actorType !== "user" || missionEvent.verificationStatus !== "unverified" || missionEvent.payload?.missionId !== missionId) {
    throw new Error(`world mission completion was not stored as an unverified owner action: ${JSON.stringify({ missionLabel, missionId, missionEvent })}`);
  }
  const eventsB = await browserApi(baseUrl, tokenB, "/api/user/activity") as { events: Array<{ eventType: string }> };
  if (eventsB.events.some((event) => event.eventType === "world.mission.completed")) throw new Error("world mission completion leaked across browser users");
}

async function verifySettingsPermissionIsolation(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const memoryLabel = "개인 기억 참조";
  const projectLabel = "내 프로젝트 파일 접근";
  const activityLabel = "활동 타임라인 참조";
  const teamDocsLabel = "팀 공유 문서 접근";
  const readSwitch = async (page: Page, label: string): Promise<string | null> => page.getByRole("switch", { name: label, exact: true }).getAttribute("aria-checked");
  await pageA.goto(`${baseUrl}/app/settings`);
  await pageA.getByRole("button", { name: "AI 설정", exact: true }).click();
  if (await readSwitch(pageA, memoryLabel) !== "true" || await readSwitch(pageA, projectLabel) !== "true" || await readSwitch(pageA, activityLabel) !== "true" || await readSwitch(pageA, teamDocsLabel) !== "false") throw new Error("account A AI context permissions did not start with the approved defaults");
  await pageA.getByRole("switch", { name: memoryLabel, exact: true }).click();
  await pageA.getByRole("switch", { name: projectLabel, exact: true }).click();
  await pageA.getByRole("switch", { name: activityLabel, exact: true }).click();
  await pageA.getByRole("switch", { name: teamDocsLabel, exact: true }).click();
  await pageA.getByText("설정을 저장했습니다.", { exact: true }).waitFor();
  await pageA.reload();
  await pageA.getByRole("button", { name: "AI 설정", exact: true }).click();
  await pageA.waitForFunction(() => (
    document.querySelector('button[role="switch"][aria-label="개인 기억 참조"]')?.getAttribute("aria-checked") === "false"
    && document.querySelector('button[role="switch"][aria-label="내 프로젝트 파일 접근"]')?.getAttribute("aria-checked") === "false"
    && document.querySelector('button[role="switch"][aria-label="활동 타임라인 참조"]')?.getAttribute("aria-checked") === "false"
    && document.querySelector('button[role="switch"][aria-label="팀 공유 문서 접근"]')?.getAttribute("aria-checked") === "true"
  ));
  if (await readSwitch(pageA, memoryLabel) !== "false" || await readSwitch(pageA, projectLabel) !== "false" || await readSwitch(pageA, activityLabel) !== "false" || await readSwitch(pageA, teamDocsLabel) !== "true") throw new Error("account A AI context permission change did not persist");

  await pageB.goto(`${baseUrl}/app/settings`);
  await pageB.getByRole("button", { name: "AI 설정", exact: true }).click();
  if (await readSwitch(pageB, memoryLabel) !== "true" || await readSwitch(pageB, projectLabel) !== "true" || await readSwitch(pageB, activityLabel) !== "true" || await readSwitch(pageB, teamDocsLabel) !== "false") throw new Error("account A AI context permission leaked into account B");
}

async function verifyIntegrationConsentIsolation(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const githubLabel = "GitHub 외부 전달 동의";
  await pageA.goto(`${baseUrl}/app/integrations`);
  const githubSwitch = pageA.getByRole("switch", { name: githubLabel, exact: true });
  await githubSwitch.waitFor();
  if (await githubSwitch.getAttribute("aria-checked") !== "false") throw new Error("account A GitHub integration consent did not start disabled");

  await githubSwitch.click();
  await pageA.getByText("설정을 저장했습니다.", { exact: true }).waitFor();
  const integrationsBeforeReload = await browserApi(baseUrl, tokenA, "/api/user/integrations") as { integrations: Array<{ provider: string; optedIn: boolean }> };
  await pageA.reload();
  await pageA.waitForFunction(() => {
    const control = document.querySelector('[role="switch"][aria-label="GitHub 외부 전달 동의"]');
    return control?.getAttribute("aria-checked") === "true" && !control.hasAttribute("disabled");
  });
  if (await pageA.getByRole("switch", { name: githubLabel, exact: true }).getAttribute("aria-checked") !== "true") {
    const integrationsAfterReload = await browserApi(baseUrl, tokenA, "/api/user/integrations") as { integrations: Array<{ provider: string; optedIn: boolean }> };
    throw new Error(`account A GitHub integration consent did not persist after reload: ${JSON.stringify({ integrationsBeforeReload, integrationsAfterReload })}`);
  }

  const integrationsA = await browserApi(baseUrl, tokenA, "/api/user/integrations") as {
    integrations: Array<{ provider: string; optedIn: boolean; configured: boolean; lastDelivery: unknown }>;
  };
  const githubA = integrationsA.integrations.find((provider) => provider.provider === "github");
  if (!githubA || githubA.optedIn !== true || githubA.configured !== false || githubA.lastDelivery !== null) {
    throw new Error(`account A integration status was not durable and truthful: ${JSON.stringify(integrationsA)}`);
  }

  await pageB.goto(`${baseUrl}/app/integrations`);
  const githubSwitchB = pageB.getByRole("switch", { name: githubLabel, exact: true });
  await githubSwitchB.waitFor();
  await pageB.waitForFunction(() => {
    const control = document.querySelector('[role="switch"][aria-label="GitHub 외부 전달 동의"]');
    return control?.getAttribute("aria-checked") === "false" && !control.hasAttribute("disabled");
  });
  if (await githubSwitchB.getAttribute("aria-checked") !== "false") throw new Error("account A integration consent leaked into account B");
  const integrationsB = await browserApi(baseUrl, tokenB, "/api/user/integrations") as {
    integrations: Array<{ provider: string; optedIn: boolean }>;
  };
  const githubB = integrationsB.integrations.find((provider) => provider.provider === "github");
  if (!githubB || githubB.optedIn !== false) throw new Error(`account B integration consent was not isolated: ${JSON.stringify(integrationsB)}`);
}

async function verifyGrowthAchievements(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const plan = await browserApi(baseUrl, tokenA, "/api/user/learning/plans", {
    method: "POST",
    body: JSON.stringify({ title: "브라우저 성장 학습", description: "검증 업적 표시를 위한 실제 학습 계획", goals: ["실제 학습 세션 완료"] }),
  });
  const session = await browserApi(baseUrl, tokenA, "/api/user/learning/sessions", { method: "POST", body: JSON.stringify({ planId: plan.plan.id }) });
  await browserApi(baseUrl, tokenA, `/api/user/learning/sessions/${encodeURIComponent(session.session.id)}/complete`, { method: "POST", body: "{}" });

  await pageA.goto(`${baseUrl}/app/world`);
  await pageA.getByRole("button", { name: "업적", exact: true }).click();
  await pageA.getByText("학습 기록", { exact: true }).waitFor();
  await pageA.getByText("근거 증거 1건", { exact: false }).first().waitFor();
  const achievementInbox = await browserApi(baseUrl, tokenA, "/api/user/notifications");
  const unreadAchievements = achievementInbox.notifications.filter((item: { source?: { type?: string }; readAt?: string }) => item.source?.type === "achievement" && !item.readAt);
  if (unreadAchievements.length !== 2) throw new Error(`growth achievement notifications were not durably produced: ${JSON.stringify(achievementInbox)}`);
  await pageA.waitForFunction(() => /^알림 \d+개$/.test(document.querySelector('[data-testid="notification-bell"]')?.getAttribute('aria-label') ?? ''));
  await pageA.getByTestId("notification-bell").click();
  const achievementNotificationDialog = pageA.getByRole("dialog", { name: "알림" });
  await achievementNotificationDialog.getByText("업적 달성: 첫 검증 기록", { exact: true }).waitFor();
  const achievementReadResponsePromise = pageA.waitForResponse((response) => response.url().includes("/api/user/notifications/") && response.url().endsWith("/read") && response.request().method() === "POST");
  await achievementNotificationDialog.getByText("업적 달성: 첫 검증 기록", { exact: true }).click();
  const achievementReadResponse = await achievementReadResponsePromise;
  if (!achievementReadResponse.ok()) throw new Error(`achievement notification read request failed (${achievementReadResponse.status()}): ${await achievementReadResponse.text()}`);
  await pageA.waitForURL(/\/app\/character$/);
  let afterAchievementRead = await browserApi(baseUrl, tokenA, "/api/user/notifications");
  for (let attempt = 0; attempt < 20 && afterAchievementRead.notifications.filter((item: { source?: { type?: string }; readAt?: string }) => item.source?.type === "achievement" && !item.readAt).length !== 1; attempt += 1) {
    await pageA.waitForTimeout(50);
    afterAchievementRead = await browserApi(baseUrl, tokenA, "/api/user/notifications");
  }
  if (afterAchievementRead.notifications.filter((item: { source?: { type?: string }; readAt?: string }) => item.source?.type === "achievement" && !item.readAt).length !== 1) throw new Error(`achievement notification read transition was not isolated: ${JSON.stringify(afterAchievementRead)}`);

  await pageB.goto(`${baseUrl}/app/world`);
  await pageB.getByRole("button", { name: "업적", exact: true }).click();
  await pageB.getByText("아직 획득한 검증 업적이 없습니다.", { exact: false }).waitFor();
  if (await pageB.getByText("학습 기록", { exact: true }).count()) throw new Error("growth achievement leaked across browser users");

  const events = await browserApi(baseUrl, tokenA, "/api/user/activity");
  const completed = events.events.find((event: { eventType: string; sourceId: string }) => event.eventType === "learning.session.completed" && event.sourceId === session.session.id);
  if (!completed) throw new Error("completed learning evidence was not durable for the achievement journey");
  await browserApi(baseUrl, tokenA, `/api/user/activity/${encodeURIComponent(completed.id)}`, { method: "DELETE" });
  await pageA.goto(`${baseUrl}/app/world`);
  await pageA.getByRole("button", { name: "업적", exact: true }).click();
  await pageA.getByText("아직 획득한 검증 업적이 없습니다.", { exact: false }).waitFor();
}

async function verifyProjectApprovalWaiting(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  await browserApi(baseUrl, tokenA, "/api/user/settings", { method: "PATCH", body: JSON.stringify({ aiApproval: { buildRun: true } }) });
  const project = await browserApi(baseUrl, tokenA, "/api/user/projects", {
    method: "POST",
    body: JSON.stringify({ name: "브라우저 실행 승인 프로젝트", objective: "승인·대기·재개 경계를 확인합니다.", purpose: "rapid-prototype", teamMode: "solo" }),
  });
  const work = await browserApi(baseUrl, tokenA, `/api/user/projects/${encodeURIComponent(project.project.id)}/work-requests`, {
    method: "POST",
    body: JSON.stringify({ title: "브라우저 실행 작업", objective: "Runtime 대기 상태를 저장합니다.", idempotencyKey: `browser-approval-${Date.now()}` }),
  });
  const beforeForeignRead = await browserApi(baseUrl, tokenB, "/api/user/projects");
  if (beforeForeignRead.projects.some((item: { id: string }) => item.id === project.project.id)) throw new Error("solo project leaked across browser users");

  await pageA.goto(`${baseUrl}/app/projects/${encodeURIComponent(project.project.id)}`);
  await pageA.getByText("브라우저 실행 작업", { exact: true }).first().waitFor();
  await pageA.getByRole("button", { name: "승인 후 실행", exact: true }).click();
  await pageA.getByRole("heading", { name: "실행 승인 확인", exact: true }).waitFor();
  await pageA.getByRole("button", { name: "승인 취소", exact: true }).click();
  if (await pageA.getByRole("heading", { name: "실행 승인 확인", exact: true }).count() !== 0) throw new Error("project execution approval dialog did not cancel");

  await pageA.getByRole("button", { name: "승인 후 실행", exact: true }).click();
  await pageA.getByRole("button", { name: "승인하고 실행", exact: true }).click();
  await pageA.getByText("Project Runtime is not configured", { exact: true }).first().waitFor();
  const waiting = await browserApi(baseUrl, tokenA, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
  const waitingRequest = waiting.workRequests.find((item: { id: string }) => item.id === work.request.id);
  if (!waitingRequest || waitingRequest.status !== "waiting" || waitingRequest.runId) throw new Error("approved project execution did not persist an honest no-Runtime waiting request");

  await pageA.reload();
  await pageA.getByText("Project Runtime is not configured", { exact: true }).first().waitFor();
  if (await pageA.getByRole("button", { name: "승인 후 재개", exact: true }).count() !== 0) throw new Error("a no-Runtime waiting request exposed a resume action without a durable Run");
}

async function verifyProjectRuntimeApprovalUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-runtime-approval-${Date.now()}@local.test`, "브라우저 Runtime 승인 사용자");
    const token = await browserSessionToken(page);
    await browserApi(baseUrl, token, "/api/user/settings", { method: "PATCH", body: JSON.stringify({ aiApproval: { buildRun: true } }) });
    const project = await browserApi(baseUrl, token, "/api/user/projects", {
      method: "POST",
      body: JSON.stringify({ name: "브라우저 Runtime 승인 프로젝트", objective: "승인 전 dispatch 차단과 승인 후 실행을 검증합니다.", purpose: "rapid-prototype", teamMode: "solo" }),
    });
    const work = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}/work-requests`, {
      method: "POST",
      body: JSON.stringify({ title: "승인 필요 Runtime 작업", objective: "승인된 뒤에만 격리 Runtime으로 전달합니다.", idempotencyKey: `browser-runtime-approval-${Date.now()}` }),
    });
    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(project.project.id)}`);
    await page.getByRole("heading", { name: "브라우저 Runtime 승인 프로젝트", exact: true }).waitFor();
    await page.getByRole("button", { name: "승인 후 실행", exact: true }).click();
    await page.getByRole("heading", { name: "실행 승인 확인", exact: true }).waitFor();
    const beforeApproval = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
    const queuedBeforeApproval = beforeApproval.workRequests.find((item: { id: string }) => item.id === work.request.id);
    if (!queuedBeforeApproval || queuedBeforeApproval.status !== "queued" || queuedBeforeApproval.runId || beforeApproval.runtime?.status !== "not-started") {
      throw new Error(`Runtime dispatch occurred before explicit approval: ${JSON.stringify({ queuedBeforeApproval, runtime: beforeApproval.runtime })}`);
    }
    await page.getByRole("button", { name: "승인 취소", exact: true }).click();
    if (await page.getByRole("heading", { name: "실행 승인 확인", exact: true }).count() !== 0) throw new Error("Runtime approval checkpoint did not cancel");
    await page.getByRole("button", { name: "승인 후 실행", exact: true }).click();
    await page.getByRole("button", { name: "승인하고 실행", exact: true }).click();

    let completed = false;
    let lastView: any = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      lastView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
      if (lastView.runtime?.status === "completed" && lastView.workRequests?.some((item: { id: string; status: string }) => item.id === work.request.id && item.status === "completed")) {
        completed = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!completed) throw new Error(`approved Runtime execution did not complete: ${JSON.stringify(lastView)}`);
    await page.reload();
    await page.getByText("프로젝트 생명주기", { exact: true }).waitFor();
    await page.getByText("Run ID:", { exact: false }).waitFor();
    await page.getByText("실제 Runtime/Agent 근거", { exact: false }).waitFor();
  } finally {
    await context.close();
  }
}

async function verifyProjectRuntimeExecutionUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-runtime-${Date.now()}@local.test`, "브라우저 Runtime 사용자");
    await page.goto(`${baseUrl}/app/idea-lab`);
    await page.getByText("프로젝트 Runtime 준비됨", { exact: false }).waitFor();
    await page.getByText("개인 AI 후보 생성 준비됨", { exact: true }).waitFor();
    await page.goto(`${baseUrl}/app/projects`);
    await page.getByRole("button", { name: "+ 새 프로젝트", exact: true }).click();
    await page.getByLabel("프로젝트 이름").fill("브라우저 Runtime 프로젝트");
    await page.getByLabel("프로젝트 목적").fill("격리된 Runtime 실행과 프로젝트 생명주기 증거를 확인합니다.");
    await page.getByRole("button", { name: "프로젝트 저장", exact: true }).click();
    await page.getByText("브라우저 Runtime 프로젝트", { exact: true }).click();
    await page.waitForURL(/\/app\/projects\/[^/]+$/);
    const projectId = new URL(page.url()).pathname.split("/").at(-1);
    if (!projectId) throw new Error("Runtime browser journey did not expose a project id");

    await page.getByLabel("작업 제목").fill("Runtime 통합 실행");
    await page.getByLabel("작업 목적").fill("실제 사용자 UI에서 검증 가능한 Run 증거를 남깁니다.");
    await page.getByRole("button", { name: "작업 요청 저장", exact: true }).click();
    await page.getByText("Runtime 통합 실행", { exact: true }).first().waitFor();
    await page.getByText("요청 ID:", { exact: false }).waitFor();
    await page.getByText("시도 0회", { exact: true }).waitFor();
    const runtimeExecutionResponsePromise = page.waitForResponse((response) => response.url().includes("/api/user/projects/") && response.url().endsWith("/runs") && response.request().method() === "POST");
    await page.getByRole("button", { name: "실행 요청", exact: true }).click();
    const runtimeExecutionResponse = await runtimeExecutionResponsePromise;
    if (!runtimeExecutionResponse.ok()) throw new Error(`project Runtime execution request failed with ${runtimeExecutionResponse.status()}: ${await runtimeExecutionResponse.text()}`);

    const token = await browserSessionToken(page);
    let completed = false;
    let lastView: any = null;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      lastView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
      if (lastView.runtime?.status === "completed" && lastView.workRequests?.some((item: { status: string }) => item.status === "completed")) {
        completed = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!completed) throw new Error(`project Runtime browser journey did not complete: ${JSON.stringify(lastView)}`);
    const workspaceFiles = lastView.workspace?.files;
    if (workspaceFiles?.status !== "ready" || workspaceFiles.items?.some((item: { path: string; size: number; content?: unknown }) => !item.path || item.path.startsWith("/") || item.path.includes("\\") || "content" in item) || workspaceFiles.items?.some((item: { path: string }) => /(^|[./])(\.env|\.git)([/]|$)/i.test(item.path))) {
      throw new Error(`project workspace file projection was not bounded and content-free: ${JSON.stringify(workspaceFiles)}`);
    }
    const completedRequest = lastView.workRequests.find((item: { status: string }) => item.status === "completed");
    const taskNode = lastView.workspace.tree.find((node: { id: string; kind: string }) => node.id === completedRequest?.nodeId);
    if (!completedRequest?.nodeId || taskNode?.kind !== "task" || !taskNode.runIds.includes(completedRequest.runId)) {
      throw new Error(`project Task → Run linkage was not persisted: ${JSON.stringify({ completedRequest, taskNode })}`);
    }

    const activity = await browserApi(baseUrl, token, "/api/user/activity");
    const requestedActivity = activity.events.filter((event: { eventType: string; sourceId: string; status: string; verificationStatus: string }) => event.eventType === "project.run.requested" && event.sourceId === completedRequest.runId && event.status === "active" && event.verificationStatus === "unverified");
    if (requestedActivity.length !== 1) throw new Error(`project Run request did not produce exactly one active unverified ActivityEvent: ${JSON.stringify(activity.events)}`);
    const completedActivity = activity.events.filter((event: { eventType: string; sourceId: string; status: string; verificationStatus: string }) => event.eventType === "project.run.completed" && event.sourceId === completedRequest.runId && event.status === "active" && event.verificationStatus === "verified");
    if (completedActivity.length !== 1) throw new Error(`project Run did not produce exactly one active verified ActivityEvent: ${JSON.stringify(activity.events)}`);
    const growth = await browserApi(baseUrl, token, "/api/user/growth");
    if (growth.stats?.development !== 150 || !growth.achievements?.some((item: { id: string; evidenceEventIds: string[] }) => item.id === "project-run" && item.evidenceEventIds.includes(completedActivity[0].id))) {
      throw new Error(`project Run did not project into development growth: ${JSON.stringify(growth)}`);
    }
    const portfolioSnapshot = await browserApi(baseUrl, token, "/api/user/portfolio");
    const activityEvidence = portfolioSnapshot.evidence.find((item: { id: string; verificationStatus: string }) => item.id === `activity:${completedActivity[0].id}` && item.verificationStatus === "verified");
    const projectEvidence = portfolioSnapshot.evidence.find((item: { id: string; verificationStatus: string }) => item.id.startsWith(`project-evidence:${projectId}:`) && item.verificationStatus === "verified");
    if (!activityEvidence || !projectEvidence) throw new Error(`project Run evidence was not collected into the portfolio snapshot: ${JSON.stringify(portfolioSnapshot)}`);

    await page.reload();
    try {
      await page.getByText("성공", { exact: false }).first().waitFor();
    } catch (error) {
      const screen = await page.locator("main").innerText().catch(() => "<main unavailable>");
      throw new Error(`project Runtime UI did not render completed state at ${page.url()}: ${screen.slice(0, 4_000)}`, { cause: error });
    }
    await page.getByText("프로젝트 생명주기", { exact: true }).waitFor();
    await page.getByText("실제 작업공간 파일", { exact: true }).waitFor();
    await page.getByText("Run ID:", { exact: false }).waitFor();
    await page.getByText("Artifact", { exact: true }).waitFor();
    await page.getByText("Revision", { exact: true }).waitFor();
    await page.getByText("Deployment", { exact: true }).waitFor();
    await page.getByText("isolated browser Runtime TEST", { exact: true }).first().waitFor();
    await page.getByText("Run 관찰 기록", { exact: true }).waitFor();
    await page.getByText("변경 파일", { exact: true }).waitFor();
    await page.getByText("테스트·빌드 결과", { exact: true }).waitFor();
    await page.getByText("실행 로그 요약", { exact: true }).waitFor();
    await page.getByText("미리보기 주소가 기록되지 않았습니다.", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const workspaceTabList = page.getByRole("tablist", { name: "프로젝트 작업실" });
    await workspaceTabList.waitFor();
    const overviewTab = page.getByRole("tab", { name: "개요: 팀 구성과 실행 프로필", exact: true });
    const tasksTab = page.getByRole("tab", { name: "작업: 작업 요청과 프로젝트 구조", exact: true });
    const aiTab = page.getByRole("tab", { name: "AI 협업: AI 제안과 기술 토론", exact: true });
    const evidenceTab = page.getByRole("tab", { name: "실행·증거: Runtime 결과와 활동 근거", exact: true });
    await overviewTab.waitFor();
    await page.getByText("진행 중 팀 구성", { exact: true }).waitFor();
    await tasksTab.click();
    await page.getByText("작업 요청", { exact: true }).waitFor();
    await page.getByText("프로젝트 구조", { exact: true }).waitFor();
    await page.getByText("실제 작업공간 파일", { exact: true }).waitFor();
    await aiTab.click();
    await page.getByRole("heading", { name: "AI 협업", exact: true }).waitFor();
    await evidenceTab.click();
    await page.getByText("프로젝트 생명주기", { exact: true }).waitFor();
    await page.getByText("Runtime 상태", { exact: true }).waitFor();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    if (!lastView.history?.some((event: { type: string }) => event.type === "run-attached")) {
      throw new Error("project history did not retain the attached run event");
    }
    await page.getByText("프로젝트 활동 기록", { exact: true }).waitFor();
    await page.getByText("run-attached", { exact: true }).waitFor();

    await page.goto(`${baseUrl}/app/projects`);
    await page.getByRole("heading", { name: "브라우저 Runtime 프로젝트", exact: true }).waitFor();
    try {
      await page.locator(".status-success").waitFor();
    } catch (error) {
      const listApi = await browserApi(baseUrl, token, "/api/user/projects");
      const viewApi = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
      const screen = await page.locator("main").innerText().catch(() => "<main unavailable>");
      throw new Error(`project list runtime status was not rendered: ${JSON.stringify({ listApi, viewApi, screen: screen.slice(0, 4_000) })}`, { cause: error });
    }
    await page.getByText("Run 완료", { exact: false }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "브라우저 Runtime 프로젝트", exact: true }).waitFor();
    await page.locator(".status-success").waitFor();
    await page.getByText("Run 완료", { exact: false }).waitFor();

    await page.goto(`${baseUrl}/app/world`);
    await page.getByText("브라우저 Runtime 프로젝트", { exact: true }).waitFor();
    await page.locator(".status-success").waitFor();
    await page.getByText("Run 완료", { exact: false }).waitFor();
    await page.reload();
    await page.getByText("브라우저 Runtime 프로젝트", { exact: true }).waitFor();
    await page.locator(".status-success").waitFor();
    await page.getByText("Run 완료", { exact: false }).waitFor();
    await page.getByText("최근 활동", { exact: true }).waitFor();
    await page.getByText("project.run.completed", { exact: true }).waitFor();
    await page.getByRole("button", { name: "오늘의 미션" }).click();
    await page.getByText("검증된 활동 근거 1건", { exact: false }).waitFor();
    await page.reload();
    await page.getByText("project.run.completed", { exact: true }).waitFor();
    await page.getByRole("button", { name: "오늘의 미션" }).click();
    await page.getByText("검증된 활동 근거 1건", { exact: false }).waitFor();
    await page.getByRole("link", { name: "활동 상세 보기", exact: false }).first().click();
    await page.waitForURL(/\/app\/activity\?event=/);
    await page.getByText("전체 활동 원장", { exact: true }).waitFor();
    await page.getByText("project.run.completed", { exact: true }).waitFor();
    await page.goto(`${baseUrl}/app/world`);
    await page.getByText("최근 활동", { exact: true }).waitFor();
    await page.getByText("project.run.completed", { exact: true }).waitFor();

    await page.goto(`${baseUrl}/app/activity`);
    await page.getByText("전체 활동 원장", { exact: true }).waitFor();
    await page.getByText("project.run.completed", { exact: true }).waitFor();
    await page.getByRole("link", { name: "원 프로젝트 보기", exact: false }).first().waitFor();
    await page.getByRole("link", { name: "원 프로젝트 보기", exact: false }).first().click();
    await page.getByRole("heading", { name: "브라우저 Runtime 프로젝트", exact: true }).waitFor();
    await page.goto(`${baseUrl}/app/activity`);
    await page.getByText("전체 활동 원장", { exact: true }).waitFor();
    await page.getByText("project.run.completed", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("전체 활동 원장", { exact: true }).waitFor();
    await page.getByText("project.run.completed", { exact: true }).waitFor();

    await page.goto(`${baseUrl}/app/portfolio`);
    await page.getByText("브라우저 Runtime 프로젝트: isolated browser Runtime TEST", { exact: true }).waitFor();
    await page.getByLabel("포트폴리오 제목").fill("브라우저 Runtime 통합 포트폴리오");
    await page.getByLabel("포트폴리오 요약").fill("완료된 Run이 검증된 활동·성장·프로젝트 증거로 연결되었습니다.");
    await page.locator("select").first().selectOption("public");
    await page.locator("label").filter({ hasText: "project.run.completed" }).first().locator("input").check();
    await page.locator("label").filter({ hasText: "브라우저 Runtime 프로젝트: isolated browser Runtime TEST" }).first().locator("input").check();
    await page.getByRole("button", { name: "포트폴리오 저장", exact: true }).click();
    await page.getByText("포트폴리오를 저장했습니다.", { exact: true }).waitFor();
    const savedPortfolio = await browserApi(baseUrl, token, "/api/user/portfolio");
    const savedEntry = savedPortfolio.entries.find((entry: { title: string }) => entry.title === "브라우저 Runtime 통합 포트폴리오");
    if (!savedEntry || savedEntry.evidenceIds.length !== 2) throw new Error(`project-derived portfolio entry was not durable: ${JSON.stringify(savedPortfolio.entries)}`);
    await page.reload();
    await page.getByText("브라우저 Runtime 통합 포트폴리오", { exact: true }).waitFor();
    await page.getByRole("button", { name: "미리보기", exact: true }).click();
    await page.getByRole("link", { name: "원 프로젝트 보기", exact: false }).first().waitFor();
    await page.getByRole("link", { name: "활동 원장 보기", exact: false }).first().waitFor();
    await page.getByRole("link", { name: "활동 원장 보기", exact: false }).first().click();
    await page.getByText("전체 활동 원장", { exact: true }).waitFor();
    await page.getByText("project.run.completed", { exact: true }).waitFor();
    await page.goto(`${baseUrl}/app/portfolio`);
    await page.getByText("브라우저 Runtime 통합 포트폴리오", { exact: true }).waitFor();
    await page.getByRole("button", { name: "미리보기", exact: true }).click();
    await page.getByRole("link", { name: "원 프로젝트 보기", exact: false }).first().click();
    await page.getByRole("heading", { name: "브라우저 Runtime 프로젝트", exact: true }).waitFor();

    const foreignContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await allowLocalRequests(foreignContext);
    const foreignPage = await foreignContext.newPage();
    try {
      await signUpAndOnboard(foreignPage, baseUrl, `browser-runtime-foreign-${Date.now()}@local.test`, "브라우저 Runtime 다른 사용자");
      const foreignToken = await browserSessionToken(foreignPage);
      const foreignProjects = await browserApi(baseUrl, foreignToken, "/api/user/projects");
      if (foreignProjects.projects.some((item: { id: string }) => item.id === projectId)) throw new Error("project Runtime data leaked into a second browser account");
      const foreignActivity = await browserApi(baseUrl, foreignToken, "/api/user/activity");
      if (foreignActivity.events.some((event: { sourceId: string }) => event.sourceId === completedRequest.runId)) throw new Error("project ActivityEvent leaked into a second browser account");
      await foreignPage.goto(`${baseUrl}/app/world`);
      await foreignPage.getByText("최근 활동", { exact: true }).waitFor();
      await foreignPage.getByText("아직 저장된 활동이 없습니다.", { exact: true }).waitFor();
      await foreignPage.getByRole("button", { name: "오늘의 미션" }).click();
      await foreignPage.getByText("연결된 검증 근거 없음", { exact: true }).first().waitFor();
      if (await foreignPage.getByText("project.run.completed", { exact: true }).count() !== 0) throw new Error("project ActivityEvent leaked into the second account's My World UI");
      await foreignPage.goto(`${baseUrl}/app/activity`);
      await foreignPage.getByText("전체 활동 원장", { exact: true }).waitFor();
      await foreignPage.getByText("아직 저장된 활동 이벤트가 없습니다.", { exact: true }).waitFor();
      if (await foreignPage.getByText("project.run.completed", { exact: true }).count() !== 0) throw new Error("project ActivityEvent leaked into the second account's Activity UI");
      const foreignGrowth = await browserApi(baseUrl, foreignToken, "/api/user/growth");
      if (foreignGrowth.stats?.development !== 0 || foreignGrowth.achievements?.some((item: { id: string }) => item.id === "project-run")) throw new Error("project growth leaked into a second browser account");
      const foreignPortfolio = await browserApi(baseUrl, foreignToken, "/api/user/portfolio");
      if (foreignPortfolio.evidence.some((item: { id: string }) => item.id === activityEvidence.id || item.id === projectEvidence.id)) throw new Error("project portfolio evidence leaked into a second browser account");
    } finally {
      await foreignContext.close();
    }
  } finally {
    await context.close();
  }
}

async function verifyProjectLocalAgentRuntimeUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-local-agent-${Date.now()}@local.test`, "브라우저 Local Agent 사용자");
    await page.goto(`${baseUrl}/app/projects`);
    await page.getByRole("button", { name: "+ 새 프로젝트", exact: true }).click();
    await page.getByLabel("프로젝트 이름").fill("브라우저 Local Agent 프로젝트");
    await page.getByLabel("프로젝트 목적").fill("격리된 Desktop Core와 Agent의 실제 경계를 확인합니다.");
    await page.getByRole("button", { name: "프로젝트 저장", exact: true }).click();
    await page.getByText("브라우저 Local Agent 프로젝트", { exact: true }).click();
    await page.waitForURL(/\/app\/projects\/[^/]+$/);
    const projectId = new URL(page.url()).pathname.split("/").at(-1);
    if (!projectId) throw new Error("local Agent browser journey did not expose a project id");
    const projectList = await browserApi(baseUrl, await browserSessionToken(page), "/api/user/projects");
    const project = projectList.projects?.find((item: { name: string }) => item.name === "브라우저 Local Agent 프로젝트");
    if (!project?.workspaceRoot) throw new Error("local Agent browser journey did not expose the owned workspace root");
    await writeFile(join(project.workspaceRoot, "smoke.test.cjs"), "const { test } = require('node:test'); test('browser local Agent smoke', () => {});\n", "utf8");
    await writeFile(join(project.workspaceRoot, "package.json"), JSON.stringify({ name: "iseol-browser-local-agent", private: true, scripts: { build: "node --check smoke.test.cjs" } }) + "\n", "utf8");
    await writeFile(join(project.workspaceRoot, "change.patch"), [
      "diff --git a/smoke.test.cjs b/smoke.test.cjs",
      "--- a/smoke.test.cjs",
      "+++ b/smoke.test.cjs",
      "@@ -1 +1,2 @@",
      " const { test } = require('node:test'); test('browser local Agent smoke', () => {});",
      "+console.log('verified diff preview');",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(project.workspaceRoot, "image.bin"), Buffer.from([0, 1, 2, 3]));
    await page.getByLabel("작업 제목").fill("로컬 Agent 실제 실행");
    await page.getByLabel("작업 목적").fill("Desktop Core와 Agent가 실제 작업 경계를 통과합니다.");
    await page.getByRole("button", { name: "작업 요청 저장", exact: true }).click();
    await page.getByText("로컬 Agent 실제 실행", { exact: true }).first().waitFor();
    const localAgentExecutionResponsePromise = page.waitForResponse((response) => response.url().includes("/api/user/projects/") && response.url().endsWith("/runs") && response.request().method() === "POST");
    await page.getByRole("button", { name: "실행 요청", exact: true }).click();
    const localAgentExecutionResponse = await localAgentExecutionResponsePromise;
    if (!localAgentExecutionResponse.ok()) throw new Error(`local Agent execution request failed with ${localAgentExecutionResponse.status()}: ${await localAgentExecutionResponse.text()}`);

    const token = await browserSessionToken(page);
    let lastView: any = null;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      lastView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
      if (lastView.runtime?.status === "completed" && lastView.workRequests?.some((item: { status: string }) => item.status === "completed")) break;
      await page.waitForTimeout(100);
    }
    if (lastView?.runtime?.status !== "completed") throw new Error(`local Agent browser journey did not complete: ${JSON.stringify(lastView)}`);
    const localAgentEvidence = lastView.evidence?.filter((item: { provider?: string }) => item.provider === "iseol-desktop-agent") ?? [];
    const localProviderEvidence = lastView.evidence?.filter((item: { provider?: string }) => item.provider === "isolated-local-provider") ?? [];
    if (!localAgentEvidence.some((item: { kind: string }) => item.kind === "test") || !localAgentEvidence.some((item: { kind: string }) => item.kind === "commit")) {
      throw new Error(`local Agent evidence was not persisted: ${JSON.stringify(lastView.evidence)}`);
    }
    if (localProviderEvidence.length === 0) throw new Error("local provider evidence was not persisted for non-external stages");
    await page.reload();
    await page.getByText("실제 작업공간 파일", { exact: true }).waitFor();
    await page.getByRole("button", { name: "파일 열기 package.json", exact: true }).click();
    await page.locator("pre").filter({ hasText: "iseol-browser-local-agent" }).waitFor();
    await page.locator('[aria-label="파일 줄 번호 1"]').waitFor();
    await page.locator("span").filter({ hasText: "B · 읽기 전용" }).waitFor();
    await page.getByRole("button", { name: "파일 열기 change.patch", exact: true }).click();
    await page.getByText("변경사항 보기", { exact: true }).waitFor();
    await page.getByText("+1 추가", { exact: true }).waitFor();
    await page.getByLabel("변경사항 @@ -1 +1,2 @@").waitFor();
    await page.getByRole("button", { name: "파일 열기 image.bin", exact: true }).click();
    await page.getByText("Binary files cannot be previewed.", { exact: false }).waitFor();
    await page.getByText("프로젝트 생명주기", { exact: true }).waitFor();
    await page.getByText("Run ID:", { exact: false }).waitFor();
    await page.getByText("Artifact", { exact: true }).waitFor();
    await page.getByText("Revision", { exact: true }).waitFor();
    await page.getByText("Deployment", { exact: true }).waitFor();
  } finally {
    await context.close();
  }
}

async function verifyProjectRuntimeFailureRecoveryUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-runtime-failure-${Date.now()}@local.test`, "브라우저 Runtime 실패 복구 사용자");
    const token = await browserSessionToken(page);
    const project = await browserApi(baseUrl, token, "/api/user/projects", {
      method: "POST",
      body: JSON.stringify({ name: "브라우저 Runtime 실패 프로젝트", objective: "실패 상태를 보존하고 같은 Run을 소유자 승인으로 재시도합니다.", purpose: "rapid-prototype", teamMode: "solo" }),
    });
    const work = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}/work-requests`, {
      method: "POST",
      body: JSON.stringify({ title: "실패 후 재시도 작업", objective: "첫 실행 실패 후 동일 Run을 복구합니다.", idempotencyKey: `browser-runtime-failure-${Date.now()}` }),
    });
    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(project.project.id)}`);
    await page.getByText("실패 후 재시도 작업", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "실행 요청", exact: true }).click();

    let failed = false;
    let failedView: any = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      failedView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
      if (failedView.runtime?.status === "failed" && failedView.workRequests?.some((item: { id: string; status: string; runId?: string }) => item.id === work.request.id && item.status === "failed" && item.runId)) {
        failed = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!failed) throw new Error(`project Runtime failure was not durably exposed: ${JSON.stringify(failedView)}`);
    const failedRequest = failedView.workRequests.find((item: { id: string }) => item.id === work.request.id);
    const failedRunId = failedRequest.runId;
    if (!failedRunId || !String(failedRequest.blocker).includes("owner retry required")) throw new Error(`failed project Run did not preserve an actionable blocker: ${JSON.stringify(failedRequest)}`);
    const failedActivity = await browserApi(baseUrl, token, "/api/user/activity");
    if (failedActivity.events.some((event: { eventType: string; sourceId: string }) => event.eventType === "project.run.completed" && event.sourceId === failedRunId)) throw new Error("failed project Run was incorrectly projected as completed activity");
    const failedGrowth = await browserApi(baseUrl, token, "/api/user/growth");
    if (failedGrowth.stats?.development !== 0) throw new Error(`failed project Run incorrectly granted growth: ${JSON.stringify(failedGrowth)}`);

    await page.reload();
    try {
      await page.getByText("isolated browser Runtime failure; owner retry required", { exact: true }).first().waitFor();
    } catch (error) {
      const screen = await page.locator("main").innerText().catch(() => "<main unavailable>");
      throw new Error(`project Runtime failure UI did not render the durable blocker: ${screen.slice(0, 6_000)}`, { cause: error });
    }
    await page.getByRole("button", { name: "재시도", exact: true }).click();

    let completed = false;
    let completedView: any = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      completedView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
      const retriedRequest = completedView.workRequests?.find((item: { id: string }) => item.id === work.request.id);
      if (completedView.runtime?.status === "completed" && retriedRequest?.status === "completed") {
        completed = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!completed) throw new Error(`failed project Run did not recover after owner retry: ${JSON.stringify(completedView)}`);
    const retriedRequest = completedView.workRequests.find((item: { id: string }) => item.id === work.request.id);
    if (retriedRequest.runId !== failedRunId) throw new Error(`project retry changed the durable Run identity: ${JSON.stringify({ failedRunId, retriedRunId: retriedRequest.runId })}`);
    const recoveredActivity = await browserApi(baseUrl, token, "/api/user/activity");
    const completedActivities = recoveredActivity.events.filter((event: { eventType: string; sourceId: string; verificationStatus: string }) => event.eventType === "project.run.completed" && event.sourceId === failedRunId && event.verificationStatus === "verified");
    if (completedActivities.length !== 1) throw new Error(`recovered project Run did not produce one verified completion activity: ${JSON.stringify(recoveredActivity.events)}`);
    const retryActivities = recoveredActivity.events.filter((event: { eventType: string; verificationStatus: string; payload?: { runId?: string; retryCycle?: number } }) => event.eventType === "project.run.retried" && event.verificationStatus === "unverified" && event.payload?.runId === failedRunId && event.payload.retryCycle === 1);
    if (retryActivities.length !== 1) throw new Error(`recovered project Run did not produce one unverified retry activity: ${JSON.stringify(recoveredActivity.events)}`);
    const recoveredGrowth = await browserApi(baseUrl, token, "/api/user/growth");
    if (recoveredGrowth.stats?.development !== 150) throw new Error(`recovered project Run did not grant development growth: ${JSON.stringify(recoveredGrowth)}`);
    await page.reload();
    await page.getByText("성공", { exact: false }).first().waitFor();
    if (await page.getByRole("button", { name: "재시도", exact: true }).count() !== 0) throw new Error("recovered project UI still exposed a retry action");
  } finally {
    await context.close();
  }
}

async function verifyProjectRuntimePauseUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-runtime-pause-${Date.now()}@local.test`, "브라우저 Runtime 일시 중단");
    const token = await browserSessionToken(page);
    const project = await browserApi(baseUrl, token, "/api/user/projects", {
      method: "POST",
      body: JSON.stringify({ name: "브라우저 Runtime 일시 중단 프로젝트", objective: "실행 중 checkpoint에서 같은 Run을 일시 중단하고 재개합니다.", purpose: "rapid-prototype", teamMode: "solo" }),
    });
    const projectId = project.project.id as string;
    const work = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}/work-requests`, {
      method: "POST",
      body: JSON.stringify({ title: "checkpoint 일시 중단 작업", objective: "실행 중인 작업을 안전한 checkpoint에서 멈춥니다.", idempotencyKey: `browser-runtime-pause-${Date.now()}` }),
    });
    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(projectId)}`);
    await page.getByText("checkpoint 일시 중단 작업", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "실행 요청", exact: true }).click();
    await page.getByRole("button", { name: "실행 중단", exact: true }).waitFor();
    const runningView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
    const runningRequest = runningView.workRequests.find((item: { id: string }) => item.id === work.request.id);
    if (!runningRequest?.runId || runningRequest.status !== "running") throw new Error(`pause journey did not expose a running durable Run: ${JSON.stringify(runningView)}`);
    const runId = runningRequest.runId;

    await page.getByRole("button", { name: "실행 중단", exact: true }).last().click();
    await page.getByRole("alertdialog", { name: "Run 실행 중단 확인" }).waitFor();
    await page.getByRole("alertdialog", { name: "Run 실행 중단 확인" }).getByRole("button", { name: "실행 중단", exact: true }).click();
    await page.getByRole("button", { name: "Run 재개", exact: true }).waitFor();
    await page.getByText("프로젝트 소유자가 다음 checkpoint", { exact: false }).first().waitFor();
    const pausedView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
    const pausedRequest = pausedView.workRequests.find((item: { id: string }) => item.id === work.request.id);
    if (pausedView.runtime?.status !== "waiting" || pausedRequest?.status !== "waiting" || pausedRequest.runId !== runId) throw new Error(`pause checkpoint was not durable or changed Run identity: ${JSON.stringify(pausedView)}`);
    const pausedRun = await browserApi(baseUrl, token, "/api/user/activity");
    const pauseEvents = pausedRun.events.filter((event: { eventType: string; verificationStatus: string; payload?: { runId?: string } }) => event.eventType === "project.run.paused" && event.verificationStatus === "unverified" && event.payload?.runId === runId);
    if (pauseEvents.length !== 1) throw new Error(`pause activity was not recorded exactly once: ${JSON.stringify(pausedRun.events)}`);
    await page.reload();
    await page.getByRole("button", { name: "Run 재개", exact: true }).waitFor();

    await page.getByRole("button", { name: "Run 재개", exact: true }).click();
    let completedView: any = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      completedView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
      const resumedRequest = completedView.workRequests?.find((item: { id: string }) => item.id === work.request.id);
      if (completedView.runtime?.status === "completed" && resumedRequest?.status === "completed") break;
      await page.waitForTimeout(100);
    }
    const resumedRequest = completedView?.workRequests?.find((item: { id: string }) => item.id === work.request.id);
    if (completedView?.runtime?.status !== "completed" || resumedRequest?.runId !== runId) throw new Error(`paused Run did not resume to completion with the same identity: ${JSON.stringify(completedView)}`);
  } finally {
    await context.close();
  }
}

async function verifyProjectTaskDependencyUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-project-dependency-${Date.now()}@local.test`, "브라우저 작업 의존성");
    const token = await browserSessionToken(page);
    const project = await browserApi(baseUrl, token, "/api/user/projects", { method: "POST", body: JSON.stringify({ name: "브라우저 작업 의존성 프로젝트", objective: "Task dependency graph and execution waiting", purpose: "rapid-prototype", teamMode: "solo" }) });
    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(project.project.id)}`);
    await page.getByRole("heading", { name: "브라우저 작업 의존성 프로젝트", exact: true }).waitFor();
    await page.getByLabel("작업 제목").fill("선행 작업");
    await page.getByLabel("작업 목적").fill("먼저 완료되어야 하는 작업입니다.");
    await page.getByRole("button", { name: "작업 요청 저장", exact: true }).click();
    await page.getByText("선행 작업", { exact: true }).first().waitFor();
    await page.getByLabel("의존 작업 제목").fill("후속 작업");
    await page.getByLabel("의존 작업 목적").fill("선행 작업 완료 후 실행되어야 합니다.");
    await page.getByLabel("선행 작업 선행 작업", { exact: true }).check();
    await page.getByRole("button", { name: "의존 작업 저장", exact: true }).click();
    await page.getByText("선행 작업이 연결된 작업을 저장했습니다.", { exact: false }).waitFor();
    await page.reload();
    await page.getByText("후속 작업", { exact: true }).first().waitFor();
    await page.getByText("선행 작업: 선행 작업", { exact: false }).waitFor();
    const view = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
    const prerequisite = view.workRequests.find((item: { title: string }) => item.title === "선행 작업");
    const dependent = view.workRequests.find((item: { title: string }) => item.title === "후속 작업");
    if (!prerequisite || !dependent || JSON.stringify(dependent.dependencies ?? []) !== JSON.stringify([prerequisite.id]) || dependent.status !== "queued") {
      throw new Error(`task dependency was not durably preserved: ${JSON.stringify(view.workRequests)}`);
    }
    const startResponse = await fetch(`${baseUrl}/api/user/projects/${encodeURIComponent(project.project.id)}/runs`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ workRequestId: dependent.id, runId: `dependency-run-${Date.now()}` }) });
    const startBody = await startResponse.json().catch(() => null) as { blocker?: string };
    if (startResponse.status !== 409 || !startBody.blocker?.includes("dependencies incomplete")) throw new Error(`incomplete dependency did not block Run start: ${startResponse.status} ${JSON.stringify(startBody)}`);
  } finally { await context.close(); }
}

async function verifyProjectQueueSchedulerUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-project-scheduler-${Date.now()}@local.test`, "브라우저 작업 큐 스케줄러");
    const token = await browserSessionToken(page);
    const project = await browserApi(baseUrl, token, "/api/user/projects", { method: "POST", body: JSON.stringify({ name: "브라우저 작업 큐 프로젝트", objective: "명시적인 동시 실행 한도와 승인 경계를 검증합니다.", purpose: "rapid-prototype", teamMode: "solo" }) });
    const projectId = project.project.id as string;
    const first = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}/work-requests`, { method: "POST", body: JSON.stringify({ title: "큐 첫 번째 작업", objective: "첫 번째 큐 작업을 실행합니다.", idempotencyKey: `scheduler-first-${Date.now()}` }) });
    const second = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}/work-requests`, { method: "POST", body: JSON.stringify({ title: "큐 두 번째 작업", objective: "동시성 한도를 확인하기 위해 대기합니다.", idempotencyKey: `scheduler-second-${Date.now()}` }) });
    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(projectId)}`);
    await page.getByRole("heading", { name: "브라우저 작업 큐 프로젝트", exact: true }).waitFor();
    await page.getByText("큐 첫 번째 작업", { exact: true }).first().waitFor();
    await page.getByText("큐 두 번째 작업", { exact: true }).first().waitFor();
    await page.getByLabel("최대 동시 실행").selectOption("1");
    await page.getByRole("button", { name: "준비된 작업 실행", exact: true }).click();
    await page.getByText("큐 처리 결과", { exact: false }).waitFor();

    const scheduledView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
    const scheduledFirst = scheduledView.workRequests.find((item: { id: string }) => item.id === first.request.id);
    const scheduledSecond = scheduledView.workRequests.find((item: { id: string }) => item.id === second.request.id);
    if (!scheduledFirst || !scheduledSecond || !["running", "completed", "waiting"].includes(scheduledFirst.status) || scheduledSecond.status !== "queued") {
      throw new Error(`bounded queue scheduler did not preserve one queued task: ${JSON.stringify(scheduledView.workRequests)}`);
    }
    if (!scheduledFirst.runId) throw new Error(`scheduled task did not receive a durable Run identity: ${JSON.stringify(scheduledFirst)}`);

    await browserApi(baseUrl, token, "/api/user/settings", { method: "PATCH", body: JSON.stringify({ aiApproval: { buildRun: true } }) });
    await page.reload();
    await page.getByRole("button", { name: "준비된 작업 실행", exact: true }).click();
    await page.getByText("실행 승인 필요", { exact: true }).waitFor();
    const approvalView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(projectId)}`);
    const approvalSecond = approvalView.workRequests.find((item: { id: string }) => item.id === second.request.id);
    if (!approvalSecond || approvalSecond.status !== "queued") throw new Error(`queue scheduler crossed the approval boundary: ${JSON.stringify(approvalSecond)}`);
    await page.getByRole("button", { name: "취소", exact: true }).click();
    if (await page.getByText("실행 승인 필요", { exact: true }).count() !== 0) throw new Error("queue scheduler approval checkpoint did not close after cancellation");
  } finally { await context.close(); }
}

async function verifyProjectQueuedCancellationUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-project-cancel-${Date.now()}@local.test`, "브라우저 작업 취소");
    await page.goto(`${baseUrl}/app/projects`);
    await page.getByRole("button", { name: "+ 새 프로젝트", exact: true }).click();
    await page.getByLabel("프로젝트 이름").fill("브라우저 작업 취소 프로젝트");
    await page.getByLabel("프로젝트 목적").fill("아직 실행되지 않은 작업 요청을 안전하게 취소합니다.");
    await page.getByRole("button", { name: "프로젝트 저장", exact: true }).click();
    await page.getByRole("heading", { name: "브라우저 작업 취소 프로젝트", exact: true }).click();
    await page.waitForURL(/\/app\/projects\/[^/]+$/);
    const projectId = page.url().split("/").pop();
    const token = await browserSessionToken(page);
    if (!projectId) throw new Error("created project URL did not contain a project identity");
    const projectActivity = await browserApi(baseUrl, token, "/api/user/activity");
    const createdProjectEvents = projectActivity.events.filter((event: { eventType: string; sourceId: string; verificationStatus: string }) => event.eventType === "project.created" && event.sourceId === projectId && event.verificationStatus === "unverified");
    if (createdProjectEvents.length !== 1) throw new Error(`project creation did not create one unverified activity event: ${JSON.stringify(projectActivity.events)}`);
    await page.getByLabel("작업 제목").fill("취소할 대기 작업");
    await page.getByLabel("작업 목적").fill("Run 시작 전에 취소 가능한 작업인지 확인합니다.");
    await page.getByRole("button", { name: "작업 요청 저장", exact: true }).click();
    await page.getByText("취소할 대기 작업", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "요청 취소", exact: true }).click();
    await page.getByRole("alertdialog", { name: "작업 요청 취소 확인" }).waitFor();
    const cancelResponsePromise = page.waitForResponse((response) => response.url().includes("/work-requests/") && response.url().endsWith("/cancel") && response.request().method() === "POST");
    await page.getByRole("button", { name: "작업 요청 취소", exact: true }).click();
    const cancelResponse = await cancelResponsePromise;
    if (!cancelResponse.ok()) throw new Error(`queued work cancellation failed with ${cancelResponse.status()}: ${await cancelResponse.text()}`);
    await page.getByText("취소됨", { exact: true }).waitFor();
    await page.getByText("프로젝트 소유자가 실행 전에 취소했습니다.", { exact: true }).waitFor();
    if (await page.getByRole("button", { name: "요청 취소", exact: true }).count() !== 0) throw new Error("cancelled work request still exposed a cancellation action");
    if (await page.getByRole("button", { name: "실행 요청", exact: true }).count() !== 0) throw new Error("cancelled work request still exposed an execution action");
    const activity = await browserApi(baseUrl, token, "/api/user/activity");
    const cancelledWorkId = cancelResponse.url().split("/work-requests/")[1]?.split("/cancel")[0];
    const createdEvents = activity.events.filter((event: { eventType: string; sourceId: string; verificationStatus: string }) => event.eventType === "project.work.created" && event.sourceId === cancelledWorkId && event.verificationStatus === "unverified");
    if (createdEvents.length !== 1) throw new Error(`queued work creation did not create one unverified activity event: ${JSON.stringify(activity.events)}`);
    const cancellationEvents = activity.events.filter((event: { eventType: string; sourceId: string; verificationStatus: string }) => event.eventType === "project.work.cancelled" && event.sourceId === cancelledWorkId && event.verificationStatus === "unverified");
    if (cancellationEvents.length !== 1) throw new Error(`queued work cancellation did not create one unverified activity event: ${JSON.stringify(activity.events)}`);
    const growth = await browserApi(baseUrl, token, "/api/user/growth");
    if (growth.xp !== 0) throw new Error(`queued work cancellation unexpectedly changed growth: ${JSON.stringify(growth)}`);
    await page.reload();
    await page.getByText("취소됨", { exact: true }).waitFor();
    await page.getByText("프로젝트 소유자가 실행 전에 취소했습니다.", { exact: true }).waitFor();
  } finally {
    await context.close();
  }
}

async function verifyLearningProjectRuntimeIntegrationUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-learning-runtime-project-${Date.now()}@local.test`, "브라우저 학습 Runtime 연결 사용자");
    const token = await browserSessionToken(page);
    const suffix = Date.now();
    const subject = `브라우저 학습 Runtime 목표 ${suffix}`;
    const project = await browserApi(baseUrl, token, "/api/user/projects", {
      method: "POST",
      body: JSON.stringify({ name: `브라우저 학습 Runtime 프로젝트 ${suffix}`, objective: "학습 적용 작업을 실제 격리 Runtime으로 실행합니다.", purpose: "portfolio", teamMode: "solo" }),
    });
    const goal = await browserApi(baseUrl, token, "/api/user/learning/goals", {
      method: "POST",
      body: JSON.stringify({ subjectText: subject, duration: { days: 7 }, dailyMinutes: 20 }),
    });

    await page.goto(`${baseUrl}/app/learning`);
    await page.getByRole("heading", { name: "학습 내용을 프로젝트에 적용", exact: true }).waitFor();
    const projectSelect = page.getByLabel(`학습 적용 프로젝트 ${subject}`, { exact: true });
    await projectSelect.selectOption(project.project.id);
    await projectSelect.locator("..").getByRole("button", { name: "적용 초안 만들기", exact: true }).click();
    try {
      await page.getByText("프로젝트 적용 초안을 저장했습니다. 실행은 별도 승인 전까지 시작되지 않습니다.", { exact: true }).waitFor();
    } catch (error) {
      const screen = await page.locator("main").innerText().catch(() => "<main unavailable>");
      const selectedProject = await projectSelect.inputValue().catch(() => "<select unavailable>");
      throw new Error(`learning Runtime integration application draft did not save (selected=${selectedProject}): ${String(error)}\n${screen.slice(-4000)}`);
    }
    await page.getByRole("button", { name: "학습 적용 작업 수락", exact: true }).click();
    await page.getByText("프로젝트 Work Request를 만들었습니다. 실행은 기존 승인·Runtime 절차를 따릅니다.", { exact: true }).waitFor();

    const queuedView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
    const applicationRequest = queuedView.workRequests.find((item: { title: string; status: string; runId?: string }) => item.title === `${subject} 적용 작업`);
    if (!applicationRequest || applicationRequest.status !== "queued" || applicationRequest.runId) throw new Error(`learning application did not create a queued Work Request: ${JSON.stringify(queuedView.workRequests)}`);
    const proposals = await browserApi(baseUrl, token, `/api/user/learning/goals/${encodeURIComponent(goal.goal.id)}/project-proposals`);
    const accepted = proposals.proposals.find((item: { status: string; workRequestId?: string }) => item.status === "accepted");
    if (!accepted || accepted.workRequestId !== applicationRequest.id) throw new Error("accepted learning application was not linked to its Work Request before execution");

    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(project.project.id)}`);
    await page.getByText(`${subject} 적용 작업`, { exact: true }).first().waitFor();
    const requestCard = page.getByText(`${subject} 적용 작업`, { exact: true }).first().locator("..").locator("..").locator("..");
    await requestCard.getByRole("button", { name: "실행 요청", exact: true }).click();

    let completed = false;
    let lastView: any = null;
    for (let elapsed = 0; elapsed < LEARNING_PROJECT_RUNTIME_TIMEOUT_MS; elapsed += 100) {
      lastView = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}`);
      if (lastView.runtime?.status === "completed" && lastView.workRequests?.some((item: { id: string; status: string }) => item.id === applicationRequest.id && item.status === "completed")) {
        completed = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!completed) throw new Error(`learning application Work Request did not complete in the isolated Runtime: ${JSON.stringify(lastView)}`);

    const activity = await browserApi(baseUrl, token, "/api/user/activity");
    const completedActivity = activity.events.find((event: { eventType: string; sourceId: string; verificationStatus: string }) => event.eventType === "project.run.completed" && event.sourceId === lastView.runtime.runId && event.verificationStatus === "verified");
    if (!completedActivity) throw new Error("learning application Run did not create verified project activity");
    const growth = await browserApi(baseUrl, token, "/api/user/growth");
    if (growth.stats?.development !== 150 || !growth.achievements?.some((item: { id: string; evidenceEventIds: string[] }) => item.id === "project-run" && item.evidenceEventIds.includes(completedActivity.id))) throw new Error(`learning application Run did not project growth: ${JSON.stringify(growth)}`);
    const portfolio = await browserApi(baseUrl, token, "/api/user/portfolio");
    if (!portfolio.evidence.some((item: { id: string; verificationStatus: string }) => item.id === `activity:${completedActivity.id}` && item.verificationStatus === "verified")) throw new Error("learning application project activity was not visible as portfolio evidence");
    await page.reload();
    await page.getByText("성공", { exact: false }).first().waitFor();
  } finally {
    await context.close();
  }
}

async function verifyAiTeamProposalRuntimeUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-ai-team-${Date.now()}@local.test`, '브라우저 AI 팀 제안 사용자');
    const token = await browserSessionToken(page);
    const team = await browserApi(baseUrl, token, '/api/user/teams', { method: 'POST', body: JSON.stringify({ name: '브라우저 AI 제안 팀', description: '격리 AI 제안 검증용 팀', kind: 'project', visibility: 'public', capacity: 4 }) });
    await browserApi(baseUrl, token, `/api/user/teams/${encodeURIComponent(team.team.id)}/ai-members`, { method: 'POST', body: JSON.stringify({ agentId: 'frontend', assignmentRole: 'frontend', capabilities: ['task.propose', 'discussion.propose'], approvalScope: 'owner-approved-execution' }) });
    const project = await browserApi(baseUrl, token, '/api/user/projects', { method: 'POST', body: JSON.stringify({ name: '브라우저 AI 제안 프로젝트', objective: '승인 경계를 실제 UI에서 확인합니다.', purpose: 'rapid-prototype', teamMode: 'mixed', teamId: team.team.id }) });
    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(project.project.id)}`);
    await page.getByRole('heading', { name: '브라우저 AI 제안 프로젝트', exact: true }).waitFor();
    await page.getByLabel('AI 제안 팀원 ID').fill('frontend');
    await page.getByRole('button', { name: 'AI 제안 요청', exact: true }).click();
    await page.getByText('격리 AI 팀 제안', { exact: true }).first().waitFor();
    await page.getByText('승인 대기', { exact: true }).waitFor();
    const acceptResponsePromise = page.waitForResponse((response) => response.url().includes('/ai-proposals/') && response.url().endsWith('/accept') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '제안 승인', exact: true }).click();
    const acceptResponse = await acceptResponsePromise;
    if (!acceptResponse.ok()) throw new Error(`AI proposal acceptance returned ${acceptResponse.status()}: ${await acceptResponse.text()}`);
    await page.getByText('작업 요청 생성', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('격리 AI 팀 제안', { exact: true }).first().waitFor();
    await page.getByText('작업 요청 생성', { exact: true }).waitFor();
  } finally { await context.close(); }
}

async function verifyAiTeamProposalExecutionApprovalUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-ai-execution-${Date.now()}@local.test`, '브라우저 AI 실행 승인 사용자');
    const token = await browserSessionToken(page);
    await browserApi(baseUrl, token, '/api/user/settings', { method: 'PATCH', body: JSON.stringify({ aiApproval: { buildRun: true } }) });
    const team = await browserApi(baseUrl, token, '/api/user/teams', { method: 'POST', body: JSON.stringify({ name: '브라우저 AI 실행 팀', description: 'AI 제안 실행 승인 경계 검증용 팀', kind: 'project', visibility: 'public', capacity: 4 }) });
    await browserApi(baseUrl, token, `/api/user/teams/${encodeURIComponent(team.team.id)}/ai-members`, { method: 'POST', body: JSON.stringify({ agentId: 'frontend', assignmentRole: 'frontend', capabilities: ['task.propose', 'discussion.propose'], approvalScope: 'owner-approved-execution' }) });
    const project = await browserApi(baseUrl, token, '/api/user/projects', { method: 'POST', body: JSON.stringify({ name: '브라우저 AI 실행 승인 프로젝트', objective: 'AI 제안 수락과 실제 실행을 사람 승인 뒤에 연결합니다.', purpose: 'rapid-prototype', teamMode: 'mixed', teamId: team.team.id }) });
    const projectPath = `/api/user/projects/${encodeURIComponent(project.project.id)}`;
    await page.goto(`${baseUrl}${projectPath.replace('/api/user', '/app')}`);
    await page.getByRole('heading', { name: '브라우저 AI 실행 승인 프로젝트', exact: true }).waitFor();
    await page.getByLabel('AI 제안 팀원 ID').fill('frontend');
    await page.getByRole('button', { name: 'AI 제안 요청', exact: true }).click();
    await page.getByText('격리 AI 팀 제안', { exact: true }).first().waitFor();
    const proposed = await browserApi(baseUrl, token, `${projectPath}/ai-proposals`);
    const proposal = proposed.proposals.find((item: { status: string; title: string }) => item.status === 'proposed' && item.title === '격리 AI 팀 제안');
    if (!proposal) throw new Error(`AI proposal was not durable before acceptance: ${JSON.stringify(proposed)}`);

    await page.getByRole('button', { name: '제안 승인', exact: true }).click();
    await page.getByText('작업 요청 생성', { exact: true }).waitFor();
    const accepted = await browserApi(baseUrl, token, `${projectPath}/ai-proposals`);
    const acceptedProposal = accepted.proposals.find((item: { id: string; status: string; workRequestId?: string }) => item.id === proposal.id);
    if (!acceptedProposal || acceptedProposal.status !== 'accepted' || !acceptedProposal.workRequestId) throw new Error(`AI proposal acceptance did not persist its Work Request identity: ${JSON.stringify(accepted)}`);
    const acceptedActivity = await browserApi(baseUrl, token, '/api/user/activity');
    const proposalAcceptanceEvents = acceptedActivity.events.filter((event: { eventType: string; sourceId: string; status: string; verificationStatus: string; payload?: { proposalId?: string; workRequestId?: string } }) => event.eventType === 'ai.team.proposal.accepted' && event.sourceId === acceptedProposal.id && event.status === 'active' && event.verificationStatus === 'unverified' && event.payload?.proposalId === acceptedProposal.id && event.payload.workRequestId === acceptedProposal.workRequestId);
    if (proposalAcceptanceEvents.length !== 1) throw new Error(`AI proposal acceptance did not produce exactly one unverified ActivityEvent: ${JSON.stringify(acceptedActivity.events)}`);

    const beforeExecution = await browserApi(baseUrl, token, projectPath);
    const queuedRequest = beforeExecution.workRequests.find((item: { id: string }) => item.id === acceptedProposal.workRequestId);
    if (!queuedRequest || queuedRequest.status !== 'queued' || queuedRequest.runId || beforeExecution.runtime?.status !== 'not-started') {
      throw new Error(`AI proposal was executed before explicit Run approval: ${JSON.stringify({ queuedRequest, runtime: beforeExecution.runtime })}`);
    }

    await page.goto(`${baseUrl}/app/world`);
    const pendingAiWorkRegion = page.getByRole('region', { name: '사용자 확인이 필요한 AI 작업', exact: true });
    await pendingAiWorkRegion.getByText('격리 AI 팀 제안', { exact: true }).waitFor();
    await pendingAiWorkRegion.getByText('실행 확인 대기', { exact: true }).waitFor();
    const openPendingAiWork = pendingAiWorkRegion.getByRole('link', { name: '작업실에서 확인 →', exact: true });
    await openPendingAiWork.waitFor();
    await openPendingAiWork.click();
    await page.waitForURL(new RegExp(`/app/projects/${project.project.id}$`));

    await page.getByRole('button', { name: '승인 후 실행', exact: true }).click();
    await page.getByRole('heading', { name: '실행 승인 확인', exact: true }).waitFor();
    const stillQueued = await browserApi(baseUrl, token, projectPath);
    const stillQueuedRequest = stillQueued.workRequests.find((item: { id: string }) => item.id === acceptedProposal.workRequestId);
    if (!stillQueuedRequest || stillQueuedRequest.status !== 'queued' || stillQueuedRequest.runId || stillQueued.runtime?.status !== 'not-started') {
      throw new Error(`AI proposal dispatched before the approval confirmation: ${JSON.stringify({ stillQueuedRequest, runtime: stillQueued.runtime })}`);
    }
    await page.getByRole('button', { name: '승인 취소', exact: true }).click();
    if (await page.getByRole('heading', { name: '실행 승인 확인', exact: true }).count() !== 0) throw new Error('AI proposal execution approval did not cancel');
    await page.getByRole('button', { name: '승인 후 실행', exact: true }).click();
    await page.getByRole('button', { name: '승인하고 실행', exact: true }).click();

    let completed = false;
    let lastView: any = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      lastView = await browserApi(baseUrl, token, projectPath);
      if (lastView.runtime?.status === 'completed' && lastView.workRequests?.some((item: { id: string; status: string }) => item.id === acceptedProposal.workRequestId && item.status === 'completed')) {
        completed = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!completed) throw new Error(`approved AI proposal execution did not complete: ${JSON.stringify(lastView)}`);
    const completedRequest = lastView.workRequests.find((item: { id: string }) => item.id === acceptedProposal.workRequestId);
    const taskNode = lastView.workspace.tree.find((node: { id: string; runIds: string[] }) => node.id === completedRequest?.nodeId);
    if (!completedRequest?.runId || taskNode?.runIds.includes(completedRequest.runId) !== true || lastView.runtime.runId !== completedRequest.runId) {
      throw new Error(`AI proposal Work Request → Run identity was not persisted: ${JSON.stringify({ completedRequest, taskNode, runtime: lastView.runtime })}`);
    }
    const activity = await browserApi(baseUrl, token, '/api/user/activity');
    if (!activity.events.some((event: { eventType: string; sourceId: string; verificationStatus: string }) => event.eventType === 'project.run.completed' && event.sourceId === completedRequest.runId && event.verificationStatus === 'verified')) {
      throw new Error(`AI proposal Run did not produce verified project activity: ${JSON.stringify(activity.events)}`);
    }
    await page.reload();
    await page.getByText('프로젝트 생명주기', { exact: true }).waitFor();
    await page.getByText('Run ID:', { exact: false }).waitFor();
    await page.getByText('실제 Runtime/Agent 근거', { exact: false }).waitFor();
    await page.getByText('작업 요청 생성', { exact: true }).waitFor();
  } finally { await context.close(); }
}

async function verifyAiTeamDiscussionRuntimeUi(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-ai-discussion-${Date.now()}@local.test`, '브라우저 AI 토론 사용자');
    const token = await browserSessionToken(page);
    const team = await browserApi(baseUrl, token, '/api/user/teams', { method: 'POST', body: JSON.stringify({ name: '브라우저 AI 토론 팀', description: '격리 AI 토론 검증용 팀', kind: 'project', visibility: 'public', capacity: 4 }) });
    await browserApi(baseUrl, token, `/api/user/teams/${encodeURIComponent(team.team.id)}/ai-members`, { method: 'POST', body: JSON.stringify({ agentId: 'architect', assignmentRole: 'architecture', capabilities: ['discussion.propose'], approvalScope: 'suggestion-only' }) });
    const project = await browserApi(baseUrl, token, '/api/user/projects', { method: 'POST', body: JSON.stringify({ name: '브라우저 AI 토론 프로젝트', objective: '기술 토론 경계를 실제 UI에서 확인합니다.', purpose: 'rapid-prototype', teamMode: 'mixed', teamId: team.team.id }) });
    await page.goto(`${baseUrl}/app/projects/${encodeURIComponent(project.project.id)}`);
    await page.getByRole('heading', { name: '브라우저 AI 토론 프로젝트', exact: true }).waitFor();
    await page.getByLabel('AI 토론 팀원 ID').fill('architect');
    const question = 'API 경계의 위험과 대안을 설명해 주세요.';
    await page.getByLabel('토론 질문').fill(question);
    await page.getByRole('button', { name: '토론 요청', exact: true }).click();
    await page.getByText(`격리 Runtime 토론 답변: ${question}`, { exact: true }).waitFor();
    await page.getByText('답변 확인', { exact: true }).waitFor();
    await page.reload();
    await page.getByText(`격리 Runtime 토론 답변: ${question}`, { exact: true }).waitFor();
    const discussionSnapshot = await browserApi(baseUrl, token, `/api/user/projects/${encodeURIComponent(project.project.id)}/ai-discussions`);
    const savedDiscussion = discussionSnapshot.discussions.find((item: { question: string }) => item.question === question);
    if (!savedDiscussion) throw new Error('AI team discussion was not durably restored for activity verification');
    const activitySnapshot = await browserApi(baseUrl, token, '/api/user/activity');
    const matchingActivity = activitySnapshot.events.filter((event: { eventType: string; sourceId: string; status: string; verificationStatus: string; payload?: { discussionId?: string; projectId?: string; status?: string } }) => event.eventType === 'ai.team.discussion.requested' && event.sourceId === savedDiscussion.id && event.status === 'active' && event.verificationStatus === 'unverified' && event.payload?.discussionId === savedDiscussion.id && event.payload.projectId === project.project.id && event.payload.status === savedDiscussion.status);
    if (matchingActivity.length !== 1) throw new Error(`AI team discussion activity was not recorded exactly once: ${matchingActivity.length}`);
  } finally { await context.close(); }
}

async function verifyAiChatRuntimeResponse(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-ai-runtime-${Date.now()}@local.test`, "브라우저 AI Runtime 사용자");
    await page.goto(`${baseUrl}/app/ai-chat`);
    await page.getByRole("button", { name: "+ 새 대화", exact: true }).click();
    await page.getByText("새 대화를 만들었습니다.", { exact: true }).waitFor();
    const prompt = "개인 프로젝트의 현재 학습 맥락을 요약해 주세요.";
    const expected = `isolated browser AI Runtime response: ${prompt}`;
    await page.getByRole("textbox", { name: "AI 이설에게 메시지 보내기" }).fill(prompt);
    await page.getByRole("button", { name: "전송 →", exact: true }).click();
    await page.getByText("개인 AI Runtime이 답변을 저장했습니다.", { exact: true }).waitFor();
    await page.locator("section").getByText(expected, { exact: true }).waitFor();
    await page.reload();
    await page.locator("section").getByText(expected, { exact: true }).waitFor();
    await page.getByRole("button", { name: "알림 1개", exact: true }).waitFor();
    await page.getByRole("button", { name: "알림 1개", exact: true }).click();
    await page.getByText("개인 AI 답변 완료", { exact: true }).click();
    await page.getByRole("button", { name: "알림", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "알림", exact: true }).waitFor();
    await page.locator("section").getByText(expected, { exact: true }).waitFor();
    const assistant = await page.locator("section").getByText(expected, { exact: true }).count();
    if (assistant !== 1) throw new Error(`private AI Runtime response was not rendered exactly once after reload: ${assistant}`);
  } finally {
    await context.close();
  }
}

async function verifyLearningRuntimeResponse(browser: Browser, baseUrl: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await allowLocalRequests(context);
  const page = await context.newPage();
  try {
    await signUpAndOnboard(page, baseUrl, `browser-learning-runtime-${Date.now()}@local.test`, "브라우저 Learning Runtime 사용자");
    await page.goto(`${baseUrl}/app/learning`);
    await page.getByLabel("학습 분야").fill("Runtime 통합 학습");
    await page.getByLabel("학습 기간").fill("3");
    await page.getByLabel("하루 학습 시간").fill("20");
    await page.getByRole("button", { name: "학습 목표 초안 저장", exact: true }).click();
    await page.getByText("Runtime 통합 학습", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "학습 계획 미리보기", exact: true }).first().click();
    await page.getByText(/local-template/).first().waitFor();
    await page.getByRole("button", { name: "오늘의 학습 세션 시작", exact: true }).first().click();
    await page.getByText("활성 세션", { exact: true }).waitFor();

    await page.getByRole("button", { name: "오늘 수업 콘텐츠 준비 요청", exact: true }).click();
    await page.getByText("콘텐츠 상태: 검증된 오늘 수업", { exact: true }).waitFor();
    await page.getByText("격리 브라우저 Runtime 오늘 수업", { exact: true }).waitFor();
    await page.getByText("이 수업은 임시 격리 Runtime에서 반환되어 저장된 학습 콘텐츠입니다.", { exact: true }).waitFor();

    const actionQuestion = "제네릭 타입 보존을 어떻게 이해하면 좋을까요?";
    await page.getByLabel("학습 도움 요청").fill(actionQuestion);
    await page.getByRole("button", { name: "설명 요청", exact: true }).click();
    await page.getByText("로컬 Runtime 응답 저장", { exact: true }).waitFor();
    await page.getByText(`격리 브라우저 Runtime 설명: ${actionQuestion}`, { exact: true }).waitFor();
    await page.reload();
    await page.getByText("격리 브라우저 Runtime 오늘 수업", { exact: true }).waitFor();
    await page.getByText(`격리 브라우저 Runtime 설명: ${actionQuestion}`, { exact: true }).waitFor();

    await page.getByLabel("코딩 테스트 제목").fill("Runtime 평가 문제");
    await page.getByLabel("코딩 테스트 문제").fill("제네릭 identity 함수를 작성하세요.");
    await page.getByLabel("코딩 테스트 언어").fill("typescript");
    await page.getByLabel("예상 시간").fill("10");
    await page.getByRole("button", { name: "문제 저장", exact: true }).click();
    await page.getByRole("button", { name: /Runtime 평가 문제/ }).click();
    await page.getByLabel("코딩 테스트 답변").fill("function identity<T>(value: T): T { return value; }");
    const answerResponsePromise = page.waitForResponse((response) => response.url().includes("/api/user/learning/sessions/") && response.url().endsWith("/answers") && response.request().method() === "POST");
    await page.getByRole("button", { name: "답변 저장", exact: true }).click();
    const answerResponse = await answerResponsePromise;
    const answerBody = await answerResponse.json() as { answer: { id: string; status: string } };
    if (answerBody.answer.status !== "feedback-ready") throw new Error("Learning Runtime browser answer did not complete through the evaluator boundary");
    await page.getByText(/평가 상태: tentative/).waitFor();
    await page.getByText("검증 대기 · 아직 검증되지 않았습니다.", { exact: false }).waitFor();
    const token = await browserSessionToken(page);
    const feedback = await browserApi(baseUrl, token, `/api/user/learning/answers/${encodeURIComponent(answerBody.answer.id)}/feedback`) as { feedback: { status: string; evaluation?: { evaluatorVersion: string; verification: string } } };
    if (feedback.feedback.status !== "tentative" || feedback.feedback.evaluation?.evaluatorVersion !== "isolated-browser-evaluator-v1" || feedback.feedback.evaluation.verification !== "tentative") {
      throw new Error(`Learning Runtime evaluator did not preserve truthful verification: ${JSON.stringify(feedback)}`);
    }
    await page.reload();
    await page.getByText(/평가 상태: tentative/).waitFor();
  } finally {
    await context.close();
  }
}

async function verifyPrivateFriendMessaging(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const body = `두 사용자 메시지 ${Date.now()}`;
  await pageA.goto(`${baseUrl}/app/friends`);
  await pageA.locator("#friend-search").fill("브라우저 B");
  await pageA.getByText("브라우저 B", { exact: true }).waitFor();
  const browserBProfileLink = pageA.getByRole("link", { name: "브라우저 B 프로필 보기", exact: true });
  const browserBProfileHref = await browserBProfileLink.getAttribute("href");
  if (!browserBProfileHref?.includes("/app/profile?userId=")) throw new Error("friend search did not expose an owner-scoped profile link");
  await browserBProfileLink.click();
  await pageA.waitForURL(/\/app\/profile\?userId=/);
  await pageA.getByRole("heading", { name: "사용자 프로필", exact: true }).waitFor();
  await pageA.goto(`${baseUrl}/app/friends`);
  await pageA.locator("#friend-search").fill("브라우저 B");
  await pageA.getByText("브라우저 B", { exact: true }).waitFor();
  await pageA.getByRole("button", { name: "친구 추가", exact: true }).click();
  await pageA.getByText("브라우저 B님에게 친구 요청을 보냈습니다.", { exact: true }).waitFor();

  await pageB.goto(`${baseUrl}/app/friends`);
  await pageB.getByRole("button", { name: /^요청/ }).click();
  await pageB.getByText("브라우저 A", { exact: true }).waitFor();
  await pageB.getByRole("button", { name: "수락", exact: true }).click();

  await pageA.reload();
  await pageA.getByRole("button", { name: /브라우저 B/ }).first().click();
  await pageA.locator("#message-input").fill(body);
  await pageA.getByRole("button", { name: "전송", exact: true }).click();
  await pageA.getByText("메시지를 저장했습니다.", { exact: true }).waitFor();
  await pageA.getByText(body, { exact: true }).waitFor();

  await pageB.reload();
  const directMessageInbox = await browserApi(baseUrl, await browserSessionToken(pageB), "/api/user/notifications");
  const directMessageNotificationRecord = directMessageInbox.notifications.find((item: { source?: { type?: string }; readAt?: string }) => item.source?.type === "direct-message" && !item.readAt);
  if (!directMessageNotificationRecord) throw new Error(`direct message notification was not durably produced: ${JSON.stringify(directMessageInbox)}`);
  await pageB.waitForFunction(() => /^알림 \d+개$/.test(document.querySelector('[data-testid="notification-bell"]')?.getAttribute('aria-label') ?? ''));
  await pageB.getByTestId("notification-bell").click();
  const directMessageNotification = pageB.getByRole("dialog", { name: "알림" });
  await directMessageNotification.getByText("새 친구 메시지", { exact: true }).waitFor();
  await directMessageNotification.getByText("새 친구 메시지", { exact: true }).click();
  await pageB.waitForURL(/\/app\/friends$/);
  await pageB.reload();
  await pageB.getByRole("button", { name: /브라우저 A/ }).first().click();
  await pageB.getByText(body, { exact: true }).waitFor();
  await pageB.reload();
  await pageB.getByRole("button", { name: /브라우저 A/ }).first().click();
  await pageB.getByText(body, { exact: true }).waitFor();
}

async function verifyPublicProfilePrivacyUi(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const me = await browserApi(baseUrl, tokenA, "/api/user/me") as { user?: { id?: string } };
  const ownerId = me.user?.id;
  if (!ownerId) throw new Error("public profile browser journey could not resolve account A identity");

  await pageA.goto(`${baseUrl}/app/settings`);
  await pageA.getByRole("button", { name: "개인정보", exact: true }).click();
  const learningPrivacy = pageA.getByRole("switch", { name: "학습 기록 공개", exact: true });
  if (await learningPrivacy.getAttribute("aria-checked") !== "true") {
    await learningPrivacy.click();
    await pageA.getByText("설정을 저장했습니다.", { exact: true }).waitFor();
  }

  const projectName = `브라우저 공개 프로젝트 ${Date.now()}`;
  const learningSubject = `브라우저 공개 학습 ${Date.now()}`;
  await browserApi(baseUrl, tokenA, "/api/user/projects", {
    method: "POST",
    body: JSON.stringify({ name: projectName, objective: "공개 프로필 요약의 안전한 범위를 확인합니다.", purpose: "rapid-prototype", teamMode: "solo" }),
  });
  await browserApi(baseUrl, tokenA, "/api/user/learning/goals", {
    method: "POST",
    body: JSON.stringify({ subjectText: learningSubject, duration: { days: 7 }, dailyMinutes: 20 }),
  });

  await pageB.goto(`${baseUrl}/app/profile?userId=${encodeURIComponent(ownerId)}`);
  await pageB.getByRole("heading", { name: "사용자 프로필", exact: true }).waitFor();
  const profileCharacter = pageB.getByRole("img", { name: "브라우저 A 개인 캐릭터", exact: true });
  await profileCharacter.waitFor();
  const profileCharacterSrc = await profileCharacter.getAttribute("src");
  if (!profileCharacterSrc?.includes("/app/assets/characters/iseol-user-character-v1.png")) throw new Error(`public profile did not render the project character asset: ${profileCharacterSrc}`);
  await pageB.getByText("성장 정보", { exact: true }).waitFor();
  await pageB.getByText("공개 프로젝트", { exact: true }).waitFor();
  await pageB.getByText(projectName, { exact: true }).waitFor();
  await pageB.getByText("학습 기록", { exact: true }).waitFor();
  await pageB.getByText(learningSubject, { exact: true }).waitFor();
  const visible = await browserApi(baseUrl, tokenB, `/api/user/social/profile?userId=${encodeURIComponent(ownerId)}`) as { profile?: any };
  if (!visible.profile?.publicGrowth || !visible.profile?.publicProjects?.some((item: { name: string }) => item.name === projectName) || !visible.profile?.publicLearning?.goals?.some((item: { subject: string }) => item.subject === learningSubject)) {
    throw new Error(`public profile summaries were not visible after enabling privacy settings: ${JSON.stringify(visible)}`);
  }
  const publicProject = visible.profile.publicProjects.find((item: { name: string }) => item.name === projectName);
  if ("id" in publicProject || "workspaceRoot" in publicProject || "evidenceEventIds" in visible.profile.publicGrowth) throw new Error("public profile exposed internal project or growth evidence fields");

  await pageA.goto(`${baseUrl}/app/settings`);
  await pageA.getByRole("button", { name: "개인정보", exact: true }).click();
  for (const label of ["성장 정보 공개", "프로젝트 목록 공개", "학습 기록 공개"]) {
    const toggle = pageA.getByRole("switch", { name: label, exact: true });
    if (await toggle.getAttribute("aria-checked") === "true") {
      await toggle.click();
      await pageA.getByText("설정을 저장했습니다.", { exact: true }).waitFor();
    }
  }
  await pageB.reload();
  if (await pageB.getByText("성장 정보", { exact: true }).count() !== 0 || await pageB.getByText(projectName, { exact: true }).count() !== 0 || await pageB.getByText(learningSubject, { exact: true }).count() !== 0) {
    throw new Error("public profile continued showing disabled growth, project, or learning summaries");
  }
  const hidden = await browserApi(baseUrl, tokenB, `/api/user/social/profile?userId=${encodeURIComponent(ownerId)}`) as { profile?: any };
  if ("publicGrowth" in (hidden.profile ?? {}) || "publicProjects" in (hidden.profile ?? {}) || "publicLearning" in (hidden.profile ?? {})) throw new Error("public profile API ignored persisted privacy settings");
}

async function verifyPublicProfilePortfolioUi(pageA: Page, pageB: Page, baseUrl: string, publicEntryId: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const me = await browserApi(baseUrl, tokenA, "/api/user/me") as { user?: { id?: string } };
  const ownerId = me.user?.id;
  if (!ownerId) throw new Error("public profile portfolio journey could not resolve account A identity");

  const visible = await browserApi(baseUrl, tokenB, `/api/user/social/profile?userId=${encodeURIComponent(ownerId)}`) as { profile?: { publicPortfolio?: Array<Record<string, unknown>> } };
  const entries = visible.profile?.publicPortfolio ?? [];
  const publicEntry = entries.find((entry) => entry.id === publicEntryId);
  if (!publicEntry || publicEntry.title !== "브라우저 검증 포트폴리오") throw new Error(`public portfolio was not projected into the public profile: ${JSON.stringify(visible)}`);
  for (const entry of entries) {
    if ("evidenceIds" in entry || "userId" in entry || "projectId" in entry) throw new Error("public profile portfolio projection exposed internal provenance fields");
  }

  await pageB.goto(`${baseUrl}/app/profile?userId=${encodeURIComponent(ownerId)}`);
  await pageB.getByRole("heading", { name: "사용자 프로필", exact: true }).waitFor();
  await pageB.getByRole("heading", { name: "공개 포트폴리오", exact: true }).waitFor();
  await pageB.getByText("브라우저 검증 포트폴리오", { exact: true }).waitFor();
  const publicPortfolioLink = pageB.getByRole("link", { name: /공개 보기 →/ });
  const href = await publicPortfolioLink.getAttribute("href");
  if (href !== `/app/portfolio/public/${encodeURIComponent(publicEntryId)}`) throw new Error(`public profile portfolio link escaped its owner-scoped entry route: ${href}`);
  await publicPortfolioLink.click();
  await pageB.waitForURL(new RegExp(`/app/portfolio/public/${publicEntryId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await pageB.getByText("브라우저 검증 포트폴리오", { exact: true }).waitFor();
}

async function verifySocialSafetyUi(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  await pageA.goto(`${baseUrl}/app/friends`);
  await pageA.getByRole('button', { name: /브라우저 B/ }).first().click();
  await pageA.locator('#report-reason').fill('브라우저 격리 안전 검증 신고');
  await pageA.getByRole('button', { name: '신고', exact: true }).click();
  await pageA.getByText('신고가 저장되었습니다.', { exact: true }).waitFor();
  await pageA.getByRole('button', { name: '차단', exact: true }).click();
  await pageA.getByText('브라우저 B님을 차단했습니다.', { exact: true }).waitFor();

  await pageB.goto(`${baseUrl}/app/friends`);
  await pageB.locator('#friend-search').fill('브라우저 A');
  await pageB.waitForTimeout(100);
  if (await pageB.getByText('브라우저 A', { exact: true }).count() !== 0) throw new Error('blocked account remained discoverable in the social UI');

  const reportsA = await browserApi(baseUrl, tokenA, '/api/user/social/reports');
  const reportsB = await browserApi(baseUrl, tokenB, '/api/user/social/reports');
  if (reportsA.reports.length !== 1 || reportsB.reports.length !== 0) throw new Error('social report privacy was not preserved in the browser journey');

  await pageA.goto(`${baseUrl}/app/friends`);
  await pageA.getByRole('button', { name: '차단 해제', exact: true }).click();
  await pageA.getByText('차단을 해제했습니다.', { exact: true }).waitFor();
  await pageA.getByRole('button', { name: /브라우저 B/ }).first().waitFor();
}

async function verifyPrivateMemoryVault(pageA: Page, pageB: Page, baseUrl: string): Promise<void> {
  const tokenA = await browserSessionToken(pageA);
  const tokenB = await browserSessionToken(pageB);
  const initial = `브라우저 기억 ${Date.now()}`;
  const updated = `${initial} 수정됨`;
  await pageA.goto(`${baseUrl}/app/memory`);
  await pageA.getByLabel("기억 종류").fill("브라우저 검증");
  await pageA.getByLabel("기억 내용").fill(initial);
  await pageA.getByLabel("기억 출처").fill("browser-e2e");
  await pageA.getByRole("button", { name: "개인 기억 저장", exact: true }).click();
  await pageA.getByText("개인 기억을 저장했습니다.", { exact: true }).waitFor();
  await pageA.getByText(initial, { exact: true }).waitFor();
  await pageA.reload();
  await pageA.getByText(initial, { exact: true }).waitFor();

  await pageA.locator("article").filter({ hasText: initial }).getByRole("button", { name: "수정", exact: true }).click();
  await pageA.getByLabel("기억 내용").fill(updated);
  await pageA.getByRole("button", { name: "수정 저장", exact: true }).click();
  await pageA.getByText("개인 기억을 수정했습니다.", { exact: true }).waitFor();
  await pageA.getByText(updated, { exact: true }).waitFor();
  await pageA.reload();
  await pageA.getByText(updated, { exact: true }).waitFor();

  pageA.once("dialog", dialog => void dialog.accept());
  await pageA.locator("article").filter({ hasText: updated }).getByRole("button", { name: "삭제", exact: true }).click();
  await pageA.getByText("개인 기억을 삭제했습니다.", { exact: true }).waitFor();
  if (await pageA.getByText(updated, { exact: true }).count() !== 0) throw new Error("deleted private memory remained visible to account A");

  await pageB.goto(`${baseUrl}/app/memory`);
  await pageB.getByText("저장된 개인 기억이 없습니다.", { exact: true }).waitFor();
  if (await pageB.getByText(initial, { exact: true }).count() !== 0 || await pageB.getByText(updated, { exact: true }).count() !== 0) {
    throw new Error("private memory leaked into account B");
  }

  const team = await browserApi(baseUrl, tokenA, "/api/user/teams", { method: "POST", body: JSON.stringify({ name: `브라우저 기억 공유 팀 ${Date.now()}`, description: "개인 기억 공유 범위와 탈퇴 철회 검증용 팀", kind: "study", visibility: "private", capacity: 4 }) });
  const post = await browserApi(baseUrl, tokenA, "/api/user/recruitment", { method: "POST", body: JSON.stringify({ teamId: team.team.id, kind: "study", title: "기억 공유 검증 모집", description: "개인 기억 공유 ACL 검증", roles: ["검증 멤버"], tags: ["memory-sharing-e2e"] }) });
  await browserApi(baseUrl, tokenB, `/api/user/recruitment/${encodeURIComponent(post.post.id)}/applications`, { method: "POST", body: JSON.stringify({ message: "개인 기억 공유 ACL 검증에 합류합니다." }) });
  const recruitment = await browserApi(baseUrl, tokenA, `/api/user/recruitment/${encodeURIComponent(post.post.id)}`);
  const application = recruitment.applications.find((item: { status: string }) => item.status === "pending");
  if (!application) throw new Error("memory sharing team application was not durable");
  await browserApi(baseUrl, tokenA, `/api/user/recruitment/applications/${encodeURIComponent(application.id)}`, { method: "POST", body: JSON.stringify({ action: "accept" }) });

  const sharedContent = `브라우저 팀 공유 기억 ${Date.now()}`;
  await pageA.goto(`${baseUrl}/app/memory`);
  await pageA.getByLabel("기억 종류").fill("팀 공유 설계");
  await pageA.getByLabel("기억 내용").fill(sharedContent);
  await pageA.getByRole("button", { name: "개인 기억 저장", exact: true }).click();
  await pageA.getByText("개인 기억을 저장했습니다.", { exact: true }).waitFor();
  const sharedCard = pageA.locator("article").filter({ hasText: sharedContent });
  await sharedCard.getByLabel(`팀 공유 ${team.team.name}`, { exact: true }).check();
  await sharedCard.getByRole("button", { name: "공유 범위 저장", exact: true }).click();
  await pageA.getByText("기억 공유 범위를 저장했습니다.", { exact: true }).waitFor();
  const sharedView = await browserApi(baseUrl, tokenB, `/api/user/memory/shared?teamId=${encodeURIComponent(team.team.id)}`);
  if (!sharedView.memories.some((memory: { content: string }) => memory.content === sharedContent)) throw new Error("active team member could not read the explicitly shared memory");

  await pageB.goto(`${baseUrl}/app/memory`);
  await pageB.getByRole("heading", { name: /팀에서 공유받은 기억/ }).waitFor();
  await pageB.getByText(sharedContent, { exact: true }).waitFor();
  await browserApi(baseUrl, tokenB, `/api/user/teams/${encodeURIComponent(team.team.id)}/leave`, { method: "POST", body: "{}" });
  await pageB.reload();
  if (await pageB.getByText(sharedContent, { exact: true }).count() !== 0) throw new Error("team-leaving member retained shared memory visibility");
  const revokedView = await browserApi(baseUrl, tokenB, `/api/user/memory/shared?teamId=${encodeURIComponent(team.team.id)}`);
  if (revokedView.memories.length !== 0) throw new Error("team-leaving member retained shared memory API access");
}

async function main(): Promise<void> {
  const server = spawn(process.execPath, ["--import", "tsx", "scripts/iseol-user-ui-isolated-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISEOL_BROWSER_SERVER_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const baseUrl = await waitForServerUrl(server);
  const runtimeServer = spawn(process.execPath, ["--import", "tsx", "scripts/iseol-user-ui-isolated-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISEOL_BROWSER_SERVER_PORT: "0", ISEOL_BROWSER_PROJECT_RUNTIME: "deterministic", ISEOL_BROWSER_AI_RUNTIME: "deterministic", ISEOL_BROWSER_LEARNING_RUNTIME: "deterministic", ISEOL_BROWSER_AI_TEAM_RUNTIME: "deterministic" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const runtimeBaseUrl = await waitForServerUrl(runtimeServer);
  const executionPlanRuntimeServer = spawn(process.execPath, ["--import", "tsx", "scripts/iseol-user-ui-isolated-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISEOL_BROWSER_SERVER_PORT: "0", ISEOL_BROWSER_AI_RUNTIME: "deterministic", ISEOL_BROWSER_AI_EXECUTION_PLAN: "deterministic" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const executionPlanRuntimeBaseUrl = await waitForServerUrl(executionPlanRuntimeServer);
  const localAgentRuntimeServer = spawn(process.execPath, ["--import", "tsx", "scripts/iseol-user-ui-isolated-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISEOL_BROWSER_SERVER_PORT: "0", ISEOL_BROWSER_PROJECT_RUNTIME: "deterministic", ISEOL_BROWSER_PROJECT_RUNTIME_MODE: "real-agent" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const localAgentRuntimeBaseUrl = await waitForServerUrl(localAgentRuntimeServer);
  const failureRuntimeServer = spawn(process.execPath, ["--import", "tsx", "scripts/iseol-user-ui-isolated-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISEOL_BROWSER_SERVER_PORT: "0", ISEOL_BROWSER_PROJECT_RUNTIME: "deterministic", ISEOL_BROWSER_PROJECT_RUNTIME_MODE: "fail-once" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const failureRuntimeBaseUrl = await waitForServerUrl(failureRuntimeServer);
  const pauseRuntimeServer = spawn(process.execPath, ["--import", "tsx", "scripts/iseol-user-ui-isolated-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ISEOL_BROWSER_SERVER_PORT: "0", ISEOL_BROWSER_PROJECT_RUNTIME: "deterministic", ISEOL_BROWSER_PROJECT_RUNTIME_MODE: "pause-gate" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pauseRuntimeBaseUrl = await waitForServerUrl(pauseRuntimeServer);
      const browser: Browser = await chromium.launch({ executablePath, headless: true });
      try {
        const focus = process.env.ISEOL_BROWSER_FOCUS?.trim();
        if (focus === "information-routes") {
          const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(account);
          const page = await account.newPage();
          await verifyInformationRoutesUi(page, baseUrl);
          await account.close();
          console.log(JSON.stringify({ focus, informationRoutesUi: "passed" }));
          return;
        }
        if (focus === "ai-team-execution") {
          await verifyAiTeamProposalExecutionApprovalUi(browser, runtimeBaseUrl);
          console.log(JSON.stringify({ focus, aiTeamProposalExecutionApprovalUi: "passed" }));
          return;
        }
        if (focus === "learning-project-runtime") {
          await verifyLearningProjectRuntimeIntegrationUi(browser, runtimeBaseUrl);
          console.log(JSON.stringify({ focus, learningProjectRuntimeIntegrationUi: "passed" }));
          return;
        }
        if (focus === "growth-notifications") {
          const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(accountA);
          await allowLocalRequests(accountB);
          const pageA = await accountA.newPage();
          const pageB = await accountB.newPage();
          await signUpAndOnboard(pageA, baseUrl, `browser-growth-focus-a-${Date.now()}@local.test`, "브라우저 성장 A");
          await signUpAndOnboard(pageB, baseUrl, `browser-growth-focus-b-${Date.now()}@local.test`, "브라우저 성장 B");
          await verifyGrowthAchievements(pageA, pageB, baseUrl);
          await accountA.close();
          await accountB.close();
          console.log(JSON.stringify({ focus, growthNotifications: "passed" }));
          return;
        }
        if (focus === "project-team-transition") {
          await verifyProjectTeamTransitionUi(browser, baseUrl);
          console.log(JSON.stringify({ focus, projectTeamTransitionUi: "passed" }));
          return;
        }
        if (focus === "project-workspace-mobile") {
          await verifyProjectRuntimeExecutionUi(browser, runtimeBaseUrl);
          console.log(JSON.stringify({ focus, projectWorkspaceMobileTabsUi: "passed" }));
          return;
        }
        if (focus === "project-work-request-cancellation") {
          await verifyProjectQueuedCancellationUi(browser, baseUrl);
          console.log(JSON.stringify({ focus, projectWorkRequestCancellationUi: "passed" }));
          return;
        }
        if (focus === "project-task-dependency") {
          await verifyProjectTaskDependencyUi(browser, baseUrl);
          console.log(JSON.stringify({ focus, projectTaskDependencyUi: "passed" }));
          return;
        }
        if (focus === "project-queue-scheduler") {
          await verifyProjectQueueSchedulerUi(browser, runtimeBaseUrl);
          console.log(JSON.stringify({ focus, projectQueueSchedulerUi: "passed" }));
          return;
        }
        if (focus === "project-runtime-pause") {
          await verifyProjectRuntimePauseUi(browser, pauseRuntimeBaseUrl);
          console.log(JSON.stringify({ focus, projectRuntimePauseUi: "passed" }));
          return;
        }
        if (focus === "community-comment-notification") {
          const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(accountA);
          await allowLocalRequests(accountB);
          const pageA = await accountA.newPage();
          const pageB = await accountB.newPage();
          await signUpAndOnboard(pageA, baseUrl, `browser-community-notification-a-${Date.now()}@local.test`, "브라우저 커뮤니티 A");
          await signUpAndOnboard(pageB, baseUrl, `browser-community-notification-b-${Date.now()}@local.test`, "브라우저 커뮤니티 B");
          await createCommunityPost(pageA);
          await verifyCommunityLikePersistence(pageA, pageB, baseUrl);
          await accountA.close();
          await accountB.close();
          console.log(JSON.stringify({ focus, communityCommentNotificationUi: "passed" }));
          return;
        }
        if (focus === "community-moderation") {
          const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(accountA);
          await allowLocalRequests(accountB);
          const pageA = await accountA.newPage();
          const pageB = await accountB.newPage();
          await signUpAndOnboard(pageA, baseUrl, `browser-community-moderation-a-${Date.now()}@local.test`, "브라우저 신고 A");
          await signUpAndOnboard(pageB, baseUrl, `browser-community-moderation-b-${Date.now()}@local.test`, "브라우저 신고 B");
          await createCommunityPost(pageA);
          await verifyCommunityLikePersistence(pageA, pageB, baseUrl);
          await accountA.close();
          await accountB.close();
          console.log(JSON.stringify({ focus, communityModerationUi: "passed" }));
          return;
        }
        if (focus === "personal-space-navigation") {
              const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(account);
          const page = await account.newPage();
          await signUpAndOnboard(page, baseUrl, `browser-personal-space-${Date.now()}@local.test`, "브라우저 개인 공간");
          await verifyPersonalSpaceNavigationUi(page, baseUrl);
          await account.close();
              console.log(JSON.stringify({ focus, personalSpaceNavigationUi: "passed" }));
              return;
            }
            if (focus === "memory-sharing") {
              const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
              const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
              await allowLocalRequests(accountA);
              await allowLocalRequests(accountB);
              const pageA = await accountA.newPage();
              const pageB = await accountB.newPage();
              await signUpAndOnboard(pageA, baseUrl, `browser-memory-sharing-a-${Date.now()}@local.test`, "브라우저 기억 공유 A");
              await signUpAndOnboard(pageB, baseUrl, `browser-memory-sharing-b-${Date.now()}@local.test`, "브라우저 기억 공유 B");
              await verifyPrivateMemoryVault(pageA, pageB, baseUrl);
              await accountA.close();
              await accountB.close();
              console.log(JSON.stringify({ focus, memorySharingUi: "passed" }));
              return;
            }
            if (focus === "mobile-navigation-accessibility") {
              const account = await browser.newContext({ viewport: { width: 390, height: 900 } });
              await allowLocalRequests(account);
              const page = await account.newPage();
              await signUpAndOnboard(page, baseUrl, `browser-mobile-navigation-${Date.now()}@local.test`, "브라우저 모바일 메뉴");
              await verifyMobileNavigationAccessibilityUi(page, baseUrl);
              await account.close();
              console.log(JSON.stringify({ focus, mobileNavigationAccessibilityUi: "passed" }));
              return;
            }
            if (focus === "character-assets") {
              const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
              await allowLocalRequests(account);
              const page = await account.newPage();
              await signUpAndOnboard(page, baseUrl, `browser-character-assets-${Date.now()}@local.test`, "브라우저 캐릭터 자산");
              await verifyCharacterAssetsUi(page, baseUrl);
              await account.close();
              console.log(JSON.stringify({ focus, characterAssetsUi: "passed", personalWorldEnvironmentAssetUi: "passed" }));
              return;
            }
            if (focus === "character-customization") {
              const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
              await allowLocalRequests(account);
              const page = await account.newPage();
              await signUpAndOnboard(page, baseUrl, `browser-character-customization-${Date.now()}@local.test`, "브라우저 캐릭터 꾸미기");
              await verifyCharacterCustomizationUi(page, baseUrl);
              await account.close();
              console.log(JSON.stringify({ focus, characterCustomizationUi: "passed" }));
              return;
            }
            if (focus === "weekly-digest-availability") {
          const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(account);
          const page = await account.newPage();
          await verifyWeeklyDigestAvailabilityUi(page, baseUrl);
          await account.close();
          console.log(JSON.stringify({ focus, weeklyDigestAvailabilityUi: "passed" }));
          return;
        }
        if (focus === "world-mission") {
          const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(accountA);
          await allowLocalRequests(accountB);
          const pageA = await accountA.newPage();
          const pageB = await accountB.newPage();
          await signUpAndOnboard(pageA, baseUrl, `browser-world-mission-a-${Date.now()}@local.test`, "브라우저 미션 A");
          await signUpAndOnboard(pageB, baseUrl, `browser-world-mission-b-${Date.now()}@local.test`, "브라우저 미션 B");
          await verifyWorldMissionCompletionUi(pageA, pageB, baseUrl);
          await accountA.close();
          await accountB.close();
          console.log(JSON.stringify({ focus, worldMissionCompletionUi: "passed" }));
          return;
        }
        if (focus === "logout-relogin") {
          const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(account);
          const page = await account.newPage();
          const email = `browser-logout-focus-${Date.now()}@local.test`;
          await signUpAndOnboard(page, baseUrl, email, "브라우저 로그아웃");
          await verifyLogoutAndRelogin(page, baseUrl, email, "local-e2e-password", "브라우저 로그아웃");
          await account.close();
          console.log(JSON.stringify({ focus, logoutServerRevocationAndRelogin: "passed" }));
          return;
        }
        if (focus === "password-change") {
          await verifyPasswordChangeUi(browser, baseUrl);
          console.log(JSON.stringify({ focus, passwordChangeUi: "passed" }));
          return;
        }
        if (focus === "learning-report-portfolio") {
          const account = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(account);
          const page = await account.newPage();
          await signUpAndOnboard(page, baseUrl, `browser-learning-report-focus-${Date.now()}@local.test`, "브라우저 학습 보고서");
          await verifyLearningReportUi(page, baseUrl);
          await account.close();
          console.log(JSON.stringify({ focus, learningReportPortfolioDraftUi: "passed" }));
          return;
        }
        if (focus === "ai-chat-attachments") {
          const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(accountA);
          await allowLocalRequests(accountB);
          const pageA = await accountA.newPage();
          const pageB = await accountB.newPage();
          await signUpAndOnboard(pageA, baseUrl, `browser-ai-attachment-focus-a-${Date.now()}@local.test`, "브라우저 첨부 A");
          await signUpAndOnboard(pageB, baseUrl, `browser-ai-attachment-focus-b-${Date.now()}@local.test`, "브라우저 첨부 B");
          await verifyPrivateAiChat(pageA, pageB, baseUrl);
          await accountA.close();
          await accountB.close();
          console.log(JSON.stringify({ focus, aiChatAttachmentsUi: "passed" }));
          return;
        }
        if (focus === "ai-chat-context-selection") {
          const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          await allowLocalRequests(accountA);
          await allowLocalRequests(accountB);
          const pageA = await accountA.newPage();
          const pageB = await accountB.newPage();
          await signUpAndOnboard(pageA, baseUrl, `browser-ai-context-focus-a-${Date.now()}@local.test`, "브라우저 맥락 A");
          await signUpAndOnboard(pageB, baseUrl, `browser-ai-context-focus-b-${Date.now()}@local.test`, "브라우저 맥락 B");
          await verifyPrivateAiChat(pageA, pageB, baseUrl);
          await accountA.close();
          await accountB.close();
          console.log(JSON.stringify({ focus, aiChatContextSelectionUi: "passed" }));
          return;
        }
        if (focus === "ai-chat-execution-plan") {
          await verifyAiChatExecutionPlanUi(browser, executionPlanRuntimeBaseUrl);
          console.log(JSON.stringify({ focus, aiChatExecutionPlanUi: "passed" }));
          return;
        }
        if (focus === "ai-agent-profile") {
          await verifyAiAgentProfileUi(browser, runtimeBaseUrl);
          console.log(JSON.stringify({ focus, aiAgentProfileUi: "passed" }));
          return;
        }
        await verifyUnauthenticatedBoundary(browser, baseUrl);
    const accountA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const accountB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await allowLocalRequests(accountA);
    await allowLocalRequests(accountB);
    const pageA = await accountA.newPage();
    const pageB = await accountB.newPage();

    const accountAEmail = `browser-a-${Date.now()}@local.test`;
    const accountAPassword = "local-e2e-password";
    await verifyInformationRoutesUi(pageA, baseUrl);
    await signUpAndOnboard(pageA, baseUrl, accountAEmail, "브라우저 A");
    await pageA.goto(`${baseUrl}/app/idea-lab`);
    await pageA.getByText("프로젝트 Runtime 연결 대기", { exact: false }).waitFor();
    await pageA.getByText("개인 AI 후보 생성 대기", { exact: true }).waitFor();
    await pageA.goto(`${baseUrl}/app/world`);
    await pageA.getByText("개인 AI 연결 대기", { exact: false }).waitFor();
    await signUpAndOnboard(pageB, baseUrl, `browser-b-${Date.now()}@local.test`, "브라우저 B");
    await pageA.getByRole("button", { name: "오늘의 미션" }).click();
    await pageA.getByText("다음 행동", { exact: true }).first().waitFor();
    if (await pageB.locator("main").getByText("브라우저 A", { exact: true }).count() !== 0) {
      throw new Error("isolated browser context leaked account A world into account B");
    }
    await verifyPersonalSpaceNavigationUi(pageA, baseUrl);
    await verifyMobileNavigationAccessibilityUi(pageA, baseUrl);
    await pageA.setViewportSize({ width: 1440, height: 900 });
    await verifyPrivateTeamAcl(pageA, pageB, baseUrl);
    await verifyProjectTeamTransitionOnPages(pageA, pageB, baseUrl);
    await verifyAiTeamMemberControls(pageA, pageB, baseUrl);
    await verifyStudyWorkspacePersistence(pageA, pageB, baseUrl);
    await pageA.goto(`${baseUrl}/app/world`);
    await pageA.getByRole("button", { name: "오늘의 미션" }).click();
    await pageA.getByText("저장된 기록", { exact: true }).first().waitFor();
    await pageA.goto(`${baseUrl}/app/integrations`);
    await pageA.getByText("Runtime 미연결", { exact: true }).waitFor();
    await pageA.getByText("Agent 미연결", { exact: true }).waitFor();
    await pageA.getByText("개인 AI 미연결", { exact: true }).waitFor();
    await pageA.getByText("AI 팀 미연결", { exact: true }).waitFor();
    await pageA.getByText("학습 AI 미연결", { exact: true }).waitFor();
    await pageA.getByText("연동 API 미연결", { exact: true }).first().waitFor();
    if (await pageA.getByText("해제", { exact: true }).count() !== 0) throw new Error("unavailable integration exposed a non-functional disconnect action");
    await verifyIntegrationConsentIsolation(pageA, pageB, baseUrl);
    await pageA.goto(`${baseUrl}/app/world`);
    await pageA.locator('[aria-label="AI Runtime 연결 대기"]').waitFor();

        await verifyPrivateAiChat(pageA, pageB, baseUrl);
        await verifyCharacterAssetsUi(pageA, baseUrl);
        await verifyCharacterCustomizationUi(pageA, baseUrl);
        await verifyWorldMissionCompletionUi(pageA, pageB, baseUrl);
    await verifyActivityExport(pageA, baseUrl);
    await verifySettingsPermissionIsolation(pageA, pageB, baseUrl);
    await verifyGrowthAchievements(pageA, pageB, baseUrl);
      await verifyProjectApprovalWaiting(pageA, pageB, baseUrl);
      await verifyProjectRuntimeApprovalUi(browser, runtimeBaseUrl);
      await verifyProjectRuntimeExecutionUi(browser, runtimeBaseUrl);
      await verifyProjectQueuedCancellationUi(browser, baseUrl);
      await verifyProjectTaskDependencyUi(browser, baseUrl);
      await verifyProjectQueueSchedulerUi(browser, runtimeBaseUrl);
      await verifyProjectLocalAgentRuntimeUi(browser, localAgentRuntimeBaseUrl);
      await verifyProjectRuntimeFailureRecoveryUi(browser, failureRuntimeBaseUrl);
      await verifyProjectRuntimePauseUi(browser, pauseRuntimeBaseUrl);
      await verifyLearningProjectRuntimeIntegrationUi(browser, runtimeBaseUrl);
      await verifyAiChatRuntimeResponse(browser, runtimeBaseUrl);
      await verifyAiChatExecutionPlanUi(browser, executionPlanRuntimeBaseUrl);
      await verifyLearningRuntimeResponse(browser, runtimeBaseUrl);
      await verifyAiTeamProposalRuntimeUi(browser, runtimeBaseUrl);
      await verifyAiTeamProposalExecutionApprovalUi(browser, runtimeBaseUrl);
      await verifyAiTeamDiscussionRuntimeUi(browser, runtimeBaseUrl);
    await verifyPrivateFriendMessaging(pageA, pageB, baseUrl);
    await verifyPublicProfilePrivacyUi(pageA, pageB, baseUrl);
    await verifySocialSafetyUi(pageA, pageB, baseUrl);
    await verifyPrivateMemoryVault(pageA, pageB, baseUrl);

    await createCommunityPost(pageA);
  await pageB.goto(`${baseUrl}/app/community`);
  await pageB.getByRole("heading", { name: "로컬 브라우저 검증 기록", exact: true }).waitFor();
  const authorProfileLink = pageB.getByRole("link", { name: "브라우저 A 프로필 보기", exact: true });
  const authorProfileHref = await authorProfileLink.getAttribute("href");
  if (!authorProfileHref?.includes("/app/profile?userId=")) throw new Error("community post did not expose an owner-scoped author profile link");
  await authorProfileLink.click();
  await pageB.waitForURL(/\/app\/profile\?userId=/);
  await pageB.getByRole("heading", { name: "사용자 프로필", exact: true }).waitFor();
  await pageB.goto(`${baseUrl}/app/community`);
  await pageB.getByRole("heading", { name: "로컬 브라우저 검증 기록", exact: true }).waitFor();
  await verifyCommunityLikePersistence(pageA, pageB, baseUrl);
    const publicEntryId = await createAndVerifyPublicPortfolio(pageA, baseUrl);
    await verifyPublicProfilePortfolioUi(pageA, pageB, baseUrl, publicEntryId);
    await verifyLearningProjectApplicationUi(pageA, baseUrl);
      await verifyLearningReportUi(pageA, baseUrl);
      await verifyPasswordChangeUi(browser, baseUrl);
      await pageB.goto(`${baseUrl}/app/portfolio/public/${encodeURIComponent(publicEntryId)}`);
    await pageB.getByText("브라우저 검증 포트폴리오", { exact: true }).waitFor();
    await pageB.goto(`${baseUrl}/app/portfolio/public/${encodeURIComponent("missing-entry")}`);
    await pageB.getByText("공개 포트폴리오를 찾을 수 없습니다.").waitFor();

    await verifyLogoutAndRelogin(pageA, baseUrl, accountAEmail, accountAPassword, "브라우저 A");

    await assertResponsive(pageA, baseUrl);
    console.log(JSON.stringify({
      baseUrl,
      browser: executablePath,
      isolatedAccounts: "2",
      unauthenticatedRouteGuard: "passed",
      truthfulWorldAndIntegrationStates: "passed",
      ideaLabRuntimeStatus: "passed",
      runtimeStatusSurface: "passed",
      privateAiChatPersistenceIsolation: "passed",
      aiChatAttachmentsUi: "passed",
      aiChatContextSelectionUi: "passed",
      aiChatExecutionPlanUi: "passed",
      characterAssetsUi: "passed",
      personalWorldEnvironmentAssetUi: "passed",
      characterCustomizationUi: "passed",
      projectWorkspaceMobileTabsUi: "passed",
      projectWorkRequestCancellationUi: "passed",
      projectTaskDependencyUi: "passed",
      personalSpaceNavigationUi: "passed",
      mobileNavigationAccessibilityUi: "passed",
      worldMissionCompletionUi: "passed",
      activityExportDownload: "passed",
      integrationConsentPersistenceIsolation: "passed",
      settingsPermissionPersistenceIsolation: "passed",
      weeklyDigestAvailabilityUi: "passed",
      growthAchievementsPersistenceIsolation: "passed",
      projectApprovalWaiting: "passed",
      projectRuntimeApprovalUi: "passed",
      projectRuntimeExecutionUi: "passed",
      projectRuntimeLocalAgentUi: "passed",
      projectRuntimeGrowthPortfolioUi: "passed",
      projectHistoryUi: "passed",
      activityTimelineUi: "passed",
      projectRuntimeFailureRecoveryUi: "passed",
      projectRuntimePauseUi: "passed",
      learningProjectRuntimeIntegrationUi: "passed",
      privateAiChatRuntimeResponse: "passed",
      aiDoneNotifications: "passed",
      learningRuntimeResponse: "passed",
      privateFriendMessagingPersistence: "passed",
      publicProfilePrivacy: "passed",
      publicProfilePortfolio: "passed",
      directMessageNotifications: "passed",
      teamInviteNotifications: "passed",
      achievementNotifications: "passed",
      liveUserNotificationStream: "passed",
      socialSafetyBlockReportUi: "passed",
      privateMemoryCrudIsolation: "passed",
      privateTeamAcl: "passed",
      projectTeamTransitionUi: "passed",
      teamLeaveAccessRevocation: "passed",
      teamChatMembership: "passed",
      teamMessageNotifications: "passed",
      aiTeamMemberPermissions: "passed",
      aiTeamProposalRuntimeUi: "passed",
      aiTeamProposalExecutionApprovalUi: "passed",
      aiTeamDiscussionRuntimeUi: "passed",
      studyWorkspacePersistencePrivacy: "passed",
      recruitmentApplicationReviewUi: "passed",
      publicCommunityPersistence: "passed",
      publicCommunityLikePersistence: "passed",
      publicCommunityCommentPersistence: "passed",
      communityCommentNotificationUi: "passed",
      communityModerationUi: "passed",
      publicPortfolioRouteAndJsonExport: "passed",
      publicPortfolioShareControl: "passed",
      informationRoutesUi: "passed",
      learningProjectApplicationUi: "passed",
      learningReportUi: "passed",
      learningGoalDraftPersistence: "passed",
      learningPlanPreviewPersistence: "passed",
      learningPlanAdjustment: "passed",
      learningGoalDaySession: "passed",
      learningGoalContentRequest: "passed",
      learningActionWaiting: "passed",
      learningProgressEvidence: "passed",
      learningTodayState: "passed",
      codingExercisePersistence: "passed",
      learningLocalSyntaxVerifierUi: "passed",
      learningAnswerEvaluationPending: "passed",
      learningFeedbackDispute: "passed",
      learningSessionCompletion: "passed",
      learningReviewScheduling: "passed",
      learningEvidenceProjection: "passed",
      logoutServerRevocationAndRelogin: "passed",
      passwordChangeUi: "passed",
      worldIsolation: "passed",
      responsiveViewports: [390, 768, 1024, 1440],
      responsiveRoutes: 13,
    }));
    await accountA.close();
    await accountB.close();
  } finally {
    await browser.close();
    await stopServer(runtimeServer);
    await stopServer(executionPlanRuntimeServer);
    await stopServer(localAgentRuntimeServer);
    await stopServer(failureRuntimeServer);
    await stopServer(pauseRuntimeServer);
    await stopServer(server);
  }
}

await main();
