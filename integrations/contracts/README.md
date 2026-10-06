# Cross-runtime contracts

These JSON Schemas are the stable boundary between the Python EEEE service, the TypeScript ISEOL runtime, and the local ClaimLatch adapter.

Every message is revision-bound and carries a schema version. Unknown versions, missing identifiers, and stale project revisions must be rejected rather than silently coerced.
