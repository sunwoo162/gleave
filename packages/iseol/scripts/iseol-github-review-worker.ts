import { syncStandaloneGitHubReviews } from "../src/services/standalone-github-review-worker.js";

const githubToken = process.env.GITHUB_TOKEN?.trim();
const eeeeBridgeUrl = process.env.EEEE_BRIDGE_URL?.trim();
if (!githubToken || !eeeeBridgeUrl) {
  throw new Error("GITHUB_TOKEN and EEEE_BRIDGE_URL are required for standalone ISEOL review worker");
}

const result = await syncStandaloneGitHubReviews({
  githubToken,
  eeeeBridgeUrl,
  eeeeBridgeToken: process.env.EEEE_BRIDGE_TOKEN?.trim(),
});
console.log(`Standalone ISEOL review worker complete: scanned=${result.scanned} reviewed=${result.reviewed} delivered=${result.delivered}`);
