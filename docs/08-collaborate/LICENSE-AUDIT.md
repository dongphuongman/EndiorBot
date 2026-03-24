# License Audit Report

**Date:** 2026-03-23
**Sprint:** 118 — Beta Stabilization
**Tool:** `npx license-checker --production --summary`
**Project License:** MIT

## Summary

All production dependencies use permissive licenses compatible with MIT.

| License | Count |
|---------|-------|
| MIT | 80 |
| ISC | 10 |
| Apache-2.0 | 4 |
| BSD-2-Clause | 2 |
| BSD-3-Clause | 1 |
| (MIT OR WTFPL) | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 |
| Unlicense | 1 |
| **AGPL** | **0** |
| **GPL** | **0** |

## Verification Command

```bash
npx license-checker --production --failOn "AGPL-1.0;AGPL-3.0;GPL-2.0;GPL-3.0"
# Exit code: 0 (PASS)
```

## Notes

- `@composio/core` (v0.6.3): package.json declares ISC, LICENSE file is MIT (Sampark Inc., 2025). Both are permissive — no conflict.
- `@composio/client` (v0.1.0-alpha.56): Apache-2.0. Compatible with MIT.

## Verdict

**PASS** — No copyleft licenses found in production dependency tree.
