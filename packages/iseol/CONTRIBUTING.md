# Contributing to NPC

Thanks for helping improve NPC. Please open an issue before a large change so
the scope and user impact are clear.

## Development

```bash
npm ci
npm run build
npm run user-ui:build
npm test
```

Changes should be made on a feature branch. Add or update tests first, keep
external integrations disabled in local tests, and describe verification in
the pull request. Do not commit `.env`, tokens, browser profiles, `data/`, or
generated runtime directories.

## Pull requests

- Explain the user-visible behavior and security impact.
- Include focused tests and the relevant full-suite command.
- Keep unrelated refactors out of the change.
- Do not add or restore AI Broadcast Room/방송실 functionality.
