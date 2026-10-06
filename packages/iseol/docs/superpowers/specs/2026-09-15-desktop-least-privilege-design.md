# Desktop Agent Least-Privilege Hardening Design

## Goal
Keep Iseol's required file, test, build, Git, and HTTP workflows while removing authority that is unrelated to the active workspace.

## Security boundary
The Desktop Agent must run as a dedicated non-administrator OS account. Startup fails closed unless the actual OS username matches the configured execution user. That account receives write access only to configured workspace roots and read/execute access only to the agent source/policy roots required to operate.

Project test/build code is considered untrusted. A workspace test may mutate its workspace, but it must not inherit the interactive user's profile access, AppData access, Desktop/Documents access, or unrelated secrets.

## Process capabilities
The Agent no longer advertises a generic `process` capability. It advertises typed `test` and `build` capabilities alongside existing `files`, `git`, and `http` capabilities.

`RUN_PROCESS` remains an internal transport operation for compatibility, but every such operation carries a required `purpose` of `test` or `build`. Runtime policy validates the executable and arguments against that purpose before spawning.

Allowed test/build commands are bounded by tool semantics: package-manager test/build scripts, Node's built-in test runner, and standard build/test verbs for supported toolchains. Install, exec, arbitrary Node scripts, inline evaluation, shells, and destructive Git remain rejected.
## Child process environment
Test/build children receive a sanitized environment instead of the Agent's complete environment. Only OS/toolchain variables needed to start approved tools are inherited. Credential-shaped application variables such as Discord, GitHub, Vercel, OpenAI, and Desktop Agent tokens are not inherited.

For every process job, `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP`, package-manager caches, Gradle home, and .NET CLI home are redirected to a deterministic job-owned directory under `<workspace>/.iseol/jobs/<digest>`.

Recursive cleanup is permitted only for that computed job-owned directory after verifying it remains beneath `<workspace>/.iseol/jobs`. No cleanup helper accepts an arbitrary caller-supplied absolute path.

## Windows account and ACL setup
A Windows setup script creates or reuses a standard local `IseolRunner` account without adding it to Administrators. The script grants only traversal on parent directories as necessary, Modify on explicit workspace roots, and Read/Execute on explicit agent/policy roots.

The launcher prompts for the runner credential at launch time and does not persist its password. Agent-specific environment configuration contains only `ISEOL_DESKTOP_AGENT_*` values; unrelated application secrets are not copied into the runner environment.

Git credentials, when required for publish, must belong to the runner account and be repository-scoped. The interactive user's credential store is intentionally unavailable to the runner.

## Compatibility
Existing typed file, patch, Git, and HTTP operations remain unchanged. Web reasoning keeps `RUN_TEST` and `RUN_BUILD`; their compiler marks the internal process purpose so runtime enforcement cannot confuse test/build with a generic process request.
## Verification requirements
Automated tests must prove that arbitrary process purposes and install/exec-style commands are rejected, approved test/build commands still run, secrets are absent from child environments, redirected profile/cache paths stay inside the workspace, and cleanup cannot escape the owned job temp root.

Agent bootstrap tests must prove that the configured execution user is mandatory, a mismatched real OS identity blocks connection before task handling, and advertised capabilities omit generic `process` while including typed `test`/`build`.

Compiler tests must prove `RUN_TEST` and `RUN_BUILD` carry the correct purpose. Existing stale-generation, workspace-guard, Git safety, and HTTP tests must remain green.

The Windows setup script is verified structurally in automated tests and must fail if not elevated. Actual account creation/ACL application is an operator setup step because the current ChatGPT-controlled process is intentionally not elevated.

## Non-goals
This change does not attempt to sandbox network access, virtualize the entire Windows desktop, or grant the runner access to the interactive user's credential stores. It does not disable test/build/Git functionality that is required by Iseol.