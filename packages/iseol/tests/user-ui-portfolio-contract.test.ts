import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const portfolioSource = resolve(process.cwd(), "user-ui/src/pages/PortfolioScreen.tsx");

test("portfolio UI exposes public viewing only for non-private entries", async () => {
  const source = await readFile(portfolioSource, "utf8");

  assert.match(source, /const publicUrl = \(entry: PortfolioEntry\): string => .*\/app\/portfolio\/public\//);
  assert.match(source, /entry\.visibility !== 'private' && <><button[\s\S]*aria-label="공개 링크 복사"[\s\S]*<a href=\{publicUrl\(entry\)\} aria-label="공개 포트폴리오 열기"/);
  assert.match(source, /<option value="private">비공개<\/option>/);
});

test("portfolio link sharing does not claim clipboard success when the browser API is unavailable", async () => {
  const source = await readFile(portfolioSource, "utf8");

  assert.match(source, /if \(!navigator\.clipboard\?\.writeText\) throw new Error\('clipboard-unavailable'\)/);
  assert.match(source, /catch \{ setStatus\(`공개 포트폴리오 링크: \$\{url\}`\); \}/);
});

test("portfolio evidence provides owner-scoped provenance links", async () => {
  const [api, source] = await Promise.all([
    readFile(resolve(process.cwd(), "user-ui/src/api/userApi.ts"), "utf8"),
    readFile(portfolioSource, "utf8"),
  ]);

  assert.match(api, /export type PortfolioEvidence = \{[\s\S]*projectId\?: string/);
  assert.match(source, /item\.projectId/);
  assert.match(source, /\/projects\/\$\{encodeURIComponent\(item\.projectId\)\}/);
  assert.match(source, /\/activity\?event=\$\{encodeURIComponent\(item\.sourceId\)\}/);
  assert.match(source, /원 프로젝트 보기/);
  assert.match(source, /활동 원장 보기/);
  assert.match(source, /id=\{`activity-\$\{event\.id\}`\}/);
});

test("activity timeline counts learning-report evidence separately", async () => {
  const source = await readFile(portfolioSource, "utf8");

  assert.match(source, /\['학습 보고서', evidence\.filter\(\(item\) => item\.sourceType === 'learning-report'\)\.length/);
  assert.match(source, /md:grid-cols-5/);
});

test("portfolio entries expose a stable edit control for public conversion", async () => {
  const source = await readFile(portfolioSource, "utf8");

  assert.match(source, /aria-label=\{`포트폴리오 \$\{entry\.title\} 편집`\}/);
});

test("portfolio surfaces translate provenance actors instead of exposing raw actor codes", async () => {
  const [source, publicSource] = await Promise.all([
    readFile(portfolioSource, "utf8"),
    readFile(resolve(process.cwd(), "user-ui/src/pages/PublicPortfolio.tsx"), "utf8"),
  ]);

  assert.match(source, /actorLabel/);
  assert.match(source, /기여 주체 \{actorLabel\(item\.actorType\)\}/);
  assert.match(source, /행위자 \{actorLabel\(event\.actorType\)\}/);
  assert.match(publicSource, /actorLabel/);
  assert.match(publicSource, /기여 주체 \{actorLabel\(item\.actorType\)\}/);
});
