# Cross-runtime contracts

These JSON Schemas are the stable boundary between the Python EEEE service, the TypeScript ISEOL runtime, and the local ClaimLatch adapter.

Every message is revision-bound and carries a schema version. Unknown versions, missing identifiers, and stale project revisions must be rejected rather than silently coerced.

`qa-report.v1.schema.json` is the ISEOL-owned independent QA result. It is embedded in a project outcome report and is eligible for EEEE memory ingestion only when its status is `PASS`.

The Project Runtime is the shared identity boundary: `projectId` and `projectRevision`
must be carried by ISEOL task results, GitHub CI/code-review evidence, Notion document
events, deterministic QA, ClaimLatch envelopes, and memory candidates. Notion is the
project documentation system of record; GitHub is the source/review system of record.
Discord project spaces are intentionally outside the core runtime.

Connector states are truthful: `ready` means local capability is available,
`awaiting_configuration` means a provider credential or adapter is missing, `planned`
means the action has not run yet, and `completed` requires a provider acknowledgement.
No adapter may infer completion from a plan alone.
