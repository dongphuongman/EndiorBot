---
description: Calculate vibecoding index for code quality
argument-hint: path (optional, defaults to src/)
allowed-tools: ["Bash"]
model: sonnet
---

# Calculate Vibecoding Index

**THIN CLIENT**: Calls EndiorBot core. NO business logic here.

```bash
! ./endiorbot.mjs vibecoding $ARGUMENTS
```

Output includes:
- Overall score (0-100, lower is better)
- Zone (green/yellow/orange/red)
- 6 metrics breakdown:
  - Complexity (cyclomatic)
  - Test Coverage
  - Lint Errors
  - Security Issues
  - Doc Coverage
  - TODO Count

## Thresholds
- <= 30: Green (excellent) - Ship with confidence
- 31-60: Yellow (acceptable) - Review recommended
- 61-80: Orange (warning) - Significant review required
- 81-100: Red (critical) - Block until fixed
