---
description: Check SDLC gate status and requirements
argument-hint: gate-id (G0, G0.1, G1, G2, G3, G4)
allowed-tools: ["Bash"]
model: sonnet
---

# Check SDLC Gate Status

**THIN CLIENT**: This command calls EndiorBot core. NO business logic here.

```bash
! ./endiorbot.mjs gate check $ARGUMENTS
```

The output includes:
- Gate ID and status (PASS/FAIL/PENDING)
- Checklist items (✅/❌)
- Evidence collected
- Vibecoding index
- Recommendation

All logic is in `src/sdlc/gates/gate-engine.ts` (SSOT).
