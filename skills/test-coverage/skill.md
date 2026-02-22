---
name: test-coverage
description: Generate comprehensive tests for code - unit tests, edge cases, error conditions. Targets 70%+ coverage using Vitest.
metadata:
  emoji: "🧪"
  category: development
  tags:
    - testing
    - vitest
    - coverage
    - quality
---

# Test Coverage Skill

Generate tests following existing codebase patterns with Vitest.

## Quick Start

Generate tests for current file:
```
/test-coverage
```

Generate tests for specific function:
```
/test-coverage parseSshTarget
```

Check coverage report:
```
/test-coverage --report
```

## Test Generation Process

### 1. Analyze Target Code

Before generating tests:
- Read the source file to understand function signatures
- Identify input/output types
- Map dependencies that need mocking
- Check existing test patterns in the codebase

### 2. Test Structure

Follow EndiorBot conventions:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { functionToTest } from './module.js';

describe('functionToTest', () => {
  beforeEach(() => {
    // Reset state if needed
  });

  it('handles normal input correctly', () => {
    expect(functionToTest('valid')).toBe(expected);
  });

  it('handles edge cases', () => {
    expect(functionToTest('')).toBeNull();
    expect(functionToTest(null)).toBeNull();
  });

  it('throws on invalid input', () => {
    expect(() => functionToTest(invalid)).toThrow();
  });
});
```

### 3. Test Categories

**Happy Path Tests:**
- Normal expected inputs
- Typical use cases
- Standard data formats

**Edge Case Tests:**
- Empty strings, arrays, objects
- Null/undefined values
- Boundary values (0, -1, max int)
- Single character/element
- Very long inputs

**Error Condition Tests:**
- Invalid input types
- Missing required fields
- Malformed data
- Network/IO failures

**Security Tests (when applicable):**
- Injection attempts
- Boundary violations
- Unauthorized access

## Coverage Targets

| Metric | Target | Priority |
|--------|--------|----------|
| Lines | 70% | Required |
| Branches | 70% | Required |
| Functions | 70% | Required |
| Statements | 70% | Required |

## Commands

Run all tests:
```bash
pnpm test
```

Run tests with coverage:
```bash
pnpm test:coverage
```

Run specific test file:
```bash
pnpm test src/path/to/file.test.ts
```

Watch mode:
```bash
pnpm test --watch
```

## Test Naming Conventions

| Pattern | Use Case |
|---------|----------|
| `*.test.ts` | Unit tests (colocated) |
| `*.e2e.test.ts` | End-to-end tests |
| `*.integration.test.ts` | Integration tests |

## Mocking Patterns

### Mock Functions
```typescript
import { vi } from 'vitest';

const mockFn = vi.fn().mockReturnValue('mocked');
const mockAsync = vi.fn().mockResolvedValue('async result');
```

### Mock Modules
```typescript
vi.mock('./dependency', () => ({
  someFunction: vi.fn().mockReturnValue('mocked'),
}));
```

### Spy on Methods
```typescript
const spy = vi.spyOn(object, 'method');
expect(spy).toHaveBeenCalledWith(expected);
```

## SDLC Integration

For EndiorBot SDLC compliance:
- **G2 Gate**: Test strategy documented
- **G3 Gate**: 70%+ coverage required
- **G4 Gate**: All tests passing, no regressions

### Vibecoding Index Impact

Test coverage is one of 6 signals in the Vibecoding Index:
- Target: 80% coverage
- Weight: 25% of total score
- Zone impact: Low coverage → Yellow/Orange zone

## EndiorBot-Specific Testing

### Test Utilities
Located in `src/test/` - use existing utilities when available.

### Async Testing
```typescript
it('handles async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Environment Variables
```typescript
beforeEach(() => {
  vi.stubEnv('API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});
```

### SDLC Module Testing
```typescript
import { GateEngine } from '../sdlc/gates/gate-engine.js';
import { VibecodingCalculator } from '../sdlc/vibecoding/vibecoding-index.js';

describe('GateEngine', () => {
  it('evaluates G2 gate correctly', async () => {
    const engine = new GateEngine({ projectPath: '/tmp/test' });
    const result = await engine.evaluate('G2', 'feature-123', 'STANDARD');
    expect(result.result).toBeDefined();
  });
});
```
