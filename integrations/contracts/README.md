# Cross-runtime contracts

These JSON Schemas are the stable boundary between the Python EEEE service, the TypeScript ISEOL runtime, and the local ClaimLatch adapter.

Every message is revision-bound and carries a schema version. Unknown versions, missing identifiers, and stale project revisions must be rejected rather than silently coerced.

`qa-report.v1.schema.json` is the ISEOL-owned independent QA result. It is embedded in a project outcome report and is eligible for EEEE memory ingestion only when its status is `PASS`.
