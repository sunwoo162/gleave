import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function createSelfHostedConfig({
  projectRoot = process.cwd(),
  dataRoot = join(projectRoot, "data"),
  envExamplePath = join(projectRoot, ".env.example"),
  envPath = join(projectRoot, ".env"),
  runtimeConfigPath = join(projectRoot, "iseol-runtime.json"),
  force = false,
} = {}) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedDataRoot = resolve(resolvedProjectRoot, dataRoot);
  const resolvedEnvExamplePath = resolve(resolvedProjectRoot, envExamplePath);
  const resolvedEnvPath = resolve(resolvedProjectRoot, envPath);
  const resolvedRuntimeConfigPath = resolve(resolvedProjectRoot, runtimeConfigPath);
  if (!existsSync(resolvedEnvExamplePath)) throw new Error(`self-hosted setup requires ${resolvedEnvExamplePath}`);
  const existing = [resolvedEnvPath, resolvedRuntimeConfigPath].filter((path) => existsSync(path));
  if (existing.length > 0 && !force) throw new Error(`self-hosted setup refused because ${existing.join(", ")} already exists; use --force to overwrite`);

  const roots = {
    dataRoot: resolvedDataRoot,
    modelRoot: join(resolvedDataRoot, "iseol"),
    runRoot: join(resolvedDataRoot, "runs"),
    webWorkerRoot: join(resolvedDataRoot, "web-workers"),
    browserProfileRoot: join(resolvedDataRoot, "browser-profile"),
    lockPath: join(resolvedDataRoot, "runtime", "iseol-runtime.lock"),
  };
  await Promise.all(Object.values(roots).filter((path) => !path.endsWith(".lock")).map((path) => mkdir(path, { recursive: true })));
  await mkdir(dirname(roots.lockPath), { recursive: true });
  await writeFile(resolvedEnvPath, await readFile(resolvedEnvExamplePath), { mode: 0o600 });
  await writeFile(resolvedRuntimeConfigPath, `${JSON.stringify({ version: 1, ...roots }, null, 2)}\n`, { mode: 0o600 });
  return { envPath: resolvedEnvPath, runtimeConfigPath: resolvedRuntimeConfigPath, ...roots };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") options.force = true;
    else if (arg === "--data-root") options.dataRoot = args[++index];
    else throw new Error(`unknown self-hosted setup option: ${arg}`);
  }
  if (options.dataRoot && !isAbsolute(options.dataRoot)) options.dataRoot = resolve(process.cwd(), options.dataRoot);
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createSelfHostedConfig(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(`self-hosted setup complete: ${result.runtimeConfigPath}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
