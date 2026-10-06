# ISEOL local-preview mode

`local-preview` is an explicit Idea Lab deployment mode for isolated local
verification. It does not reinterpret existing Vercel records and it never
calls Vercel. The default mode remains `vercel` when the Idea Lab runtime is
enabled and no deployment mode is supplied.

## Configuration

Set `ISEOL_IDEA_LAB_DEPLOYMENT_MODE=local-preview` and provide the existing
Idea Lab repository, sandbox, test, and agent settings plus:

```text
ISEOL_IDEA_LAB_PREVIEW_EXECUTABLE=<trusted absolute executable path>
ISEOL_IDEA_LAB_PREVIEW_ARGS_JSON=["..."]
ISEOL_IDEA_LAB_PREVIEW_HOST=127.0.0.1
ISEOL_IDEA_LAB_PREVIEW_PORT=<isolated loopback port, 1024-65535>
ISEOL_IDEA_LAB_PREVIEW_TIMEOUT_MS=30000
ISEOL_IDEA_LAB_EXTERNAL_REQUEST_BUDGET=<explicit positive integer>
```

Preview arguments are trusted operator configuration. They may contain
`{port}` and `{workspace}` placeholders; AI output is never used as an
executable, argument list, URL, or port. The workspace must be inside the
configured Idea Lab sandbox and the listener must be loopback-only.

## Evidence and acceptance

The local adapter starts one owned child process after the Run reaches the
deployment stage. It records a `provider: "local-preview"` receipt only after
the child exposes a PID and the configured URL returns a successful HTTP
response. Verification re-checks the owned process, commit identity, host,
and port. Exit, timeout, port collision, identity mismatch, and failed HTTP
checks fail closed and do not create a verified receipt. Runtime disposal
terminates only processes owned by that adapter.

The following are separate facts:

1. code was applied to the isolated workspace;
2. tests and build completed successfully;
3. the local preview process is ready;
4. browser acceptance is verified.

HTTP readiness never marks browser acceptance complete. A future acceptance
record is stored through the authenticated
`POST /api/prototypes/:prototypeId/browser-acceptance` route and remains
`unverified` until a real browser checks add, edit,
complete/uncomplete, delete, refresh persistence, empty state, empty-input
validation, and responsive mobile/desktop behavior. Existing Runs without an
acceptance record remain unchanged, and local-preview promotion is rejected
until every required check is `pass`.

## External request budget

Every ChatGPT Web submission reserves a durable request identity in the
shared WebWorker-root budget before submission. Proposal, stage, correction,
recovery, and retry submissions therefore consume one common limit while
remaining bound to their campaign or Run identity. Reservations are
serialized, duplicate identities are rejected, and the limit covers
reserved, consumed, and unknown requests. If a submission has been sent but
its outcome cannot be established, it is recorded as `unknown` and the
executor blocks automatic resubmission. The limit is separate from
`productionConcurrency` and the historical proposal-attempt limit.

## Live operator boundary

Before a real campaign, the operator must provide an isolated repository and
sandbox, trusted test/build/preview commands, an explicit request budget, an
isolated browser profile, and a separate Desktop Agent. The first campaign
and production must be bounded independently from the request budget. The
operator must approve the external ChatGPT Web request and Desktop file
changes separately. Vercel credentials are not needed in local-preview mode;
local results must not be described as an external deployment.
