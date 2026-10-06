import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { google } from "googleapis";
import "dotenv/config";

const envPath = new URL("../.env", import.meta.url);
const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || "http://127.0.0.1:53682/oauth2/callback";

if (!clientId || !clientSecret) {
  throw new Error("GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 .env에 먼저 설정해주세요.");
}

const redirect = new URL(redirectUri);
if (redirect.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(redirect.hostname)) {
  throw new Error("GOOGLE_REDIRECT_URI는 로컬 OAuth용 http://127.0.0.1:<port>/... 형식을 사용해주세요.");
}

async function setEnvValue(key: string, value: string): Promise<void> {
  const current = await readFile(envPath, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(current) ? current.replace(pattern, line) : `${current.trimEnd()}\n${line}\n`;
  await writeFile(envPath, next, "utf8");
}
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const scope = "https://www.googleapis.com/auth/calendar";
const authUrl = oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [scope] });

console.log("브라우저에서 Google Calendar 권한을 승인합니다.");
if (process.platform === "win32") exec(`start "" "${authUrl.replace(/"/g, "")}"`);
else if (process.platform === "darwin") exec(`open "${authUrl.replace(/"/g, "")}"`);
else exec(`xdg-open "${authUrl.replace(/"/g, "")}"`);

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", redirectUri);
  if (requestUrl.pathname !== redirect.pathname) {
    res.writeHead(404).end("not found");
    return;
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("authorization code missing");
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) throw new Error("refresh token이 발급되지 않았습니다. Google 계정 권한을 해제한 뒤 다시 시도해주세요.");
    await setEnvValue("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
    await setEnvValue("GOOGLE_REDIRECT_URI", redirectUri);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Google Calendar 인증 완료. 이 창을 닫아도 됩니다.");
    console.log("Google Calendar refresh token을 .env에 저장했습니다.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google OAuth 처리 실패";
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
    console.error(message);
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port), redirect.hostname, () => {
  console.log(`OAuth callback 대기 중: ${redirectUri}`);
  console.log("브라우저가 자동으로 열리지 않으면 아래 URL을 직접 여세요:");
  console.log(authUrl);
});
