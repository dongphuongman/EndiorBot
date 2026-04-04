# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x-beta | Yes |
| < 0.1.0 | No |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@minhtamsolution.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

## Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledge receipt | 48 hours |
| Initial assessment | 5 business days |
| Critical fix | 7-14 days |
| Non-critical fix | Next release cycle |

## Security Measures

EndiorBot implements the following security controls:

- **Input Sanitization** — All gateway ingress paths sanitized (Sprint 116)
- **Command Injection Prevention** — All template-interpolated `execSync` calls converted to `execFileSync` with argument arrays (Sprint 116/118). Remaining safe hardcoded calls documented in [EXEC_ALLOWLIST.md](docs/08-collaborate/EXEC_ALLOWLIST.md)
- **Security Headers** — CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy on all HTTP responses (Sprint 117)
- **Rate Limiting** — 100 req/min per IP on non-health endpoints (Sprint 117)
- **CORS** — Configurable origins, no wildcard (Sprint 116)
- **Output Scrubbing** — Sensitive data redacted from responses

## Third-party “Claude Code” research trees (local workspace)

Some developers keep **unofficial** clones (e.g. source-map recoveries, community ports) for study. Those trees **must not** be linked from production code, published packages, or public repos without separate legal review. Governance: [ADR-039](docs/02-design/01-ADRs/ADR-039-Claude-Code-Research-Artifacts-Governance.md).

## Scope

This policy applies to the EndiorBot npm package (`endiorbot`) and its official Docker image.

Third-party integrations and plugins are not covered by this policy.
