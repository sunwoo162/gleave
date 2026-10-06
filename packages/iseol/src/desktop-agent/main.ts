import { resolveDesktopAgentClientConfig, runPersistentDesktopAgent } from "./agent-service.js";

const config = resolveDesktopAgentClientConfig(process.env);
const controller = new AbortController();
let stopping = false;

async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`Iseol Desktop Agent stopping (${signal})`);
  controller.abort();
}

process.once("SIGINT", () => { void stop("SIGINT"); });
process.once("SIGTERM", () => { void stop("SIGTERM"); });

console.log(`Iseol Desktop Agent starting: ${config.agentId} -> ${config.url}`);
await runPersistentDesktopAgent(config, { signal: controller.signal });
