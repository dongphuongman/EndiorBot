# Bug Tracking

**Stage:** 05-TEST
**Purpose:** Bug documentation and tracking
**Format:** Individual markdown files per bug

---

## Bug Lifecycle

```
DISCOVERED → TRIAGED → IN PROGRESS → RESOLVED → VERIFIED
```

---

## Bug Template

Each bug file should include:

1. **Header:** Bug ID, status, severity, component
2. **Summary:** One-sentence description
3. **Reproduction:** Step-by-step reproduction
4. **Root Cause:** Technical analysis
5. **Impact:** User and system impact
6. **Solution:** Code changes made
7. **Verification:** Test evidence
8. **Lessons Learned:** What we learned
9. **Recommendations:** Future improvements

---

## Severity Levels

| Level | Description | SLA |
|-------|-------------|-----|
| **P0** | Critical - Blocks core functionality | Fix within 24h |
| **P1** | High - Major feature broken | Fix within 1 week |
| **P2** | Medium - Feature degraded | Fix within 2 weeks |
| **P3** | Low - Cosmetic/minor issue | Backlog |

---

## Bug Index

| ID | Title | Severity | Status | Sprint |
|----|-------|----------|--------|--------|
| [BUG-003](./BUG-003-active-json-not-persisted.md) | active.json not persisted | P1 | ✅ RESOLVED | 62 |
| [BUG-004](./BUG-004-rgprovider-file-type-error.md) | RgProvider file type error | P0 | ✅ RESOLVED | 63-64 |

---

## Related Documentation

- [Test Reports](../test-reports/)
- [Manual Test Plan](../manual-test-plan.md)
- [Technical Specs](../../02-design/14-Technical-Specs/)

---

**SDLC Framework v6.1.1 | Stage 05-TEST**
