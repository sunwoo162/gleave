# Security Policy

## Supported versions

Only the latest tagged release and the default branch receive security fixes.
This project is self-hosted, so operators must also secure the host, mounted
workspaces, SQLite files, network exposure, and API credentials.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through the repository's
GitHub Security Advisories page. Do not open a public issue containing secrets,
working exploit details, or private user data. Include the affected version,
the smallest reproduction, impact, and any suggested mitigation.

We will acknowledge a report when maintainers have access to it, investigate,
and coordinate a fix or mitigation before public disclosure where practical.

## Runtime boundaries

The application defaults to demo mode. Keep it behind an appropriate local or
authenticated network boundary when enabling GitHub, LLM, or workspace
execution integrations. Never commit `.env`, tokens, generated reports, or
workspace contents.
