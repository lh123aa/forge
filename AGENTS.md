# AGENTS.md — Forge Code Agent

This file provides coding guidelines and commands for AI agents operating in this repository.

## Project Overview

- **Type**: Node.js/TypeScript MCP (Model Context Protocol) plugin
- **Name**: Forge
- **Runtime**: Node.js 18+, ES2022, ESNext modules
- **Package Manager**: npm
- **CLI Command**: `fg`
- **Structure**: Monorepo with `src/` (TypeScript) and `tests/` directories

---

## Build Commands

```bash
# Install dependencies
npm install

# Development (watch mode for TypeScript)
npm run dev

# Build (TypeScript compilation)
npm run build

# Lint (ESLint)
npm run lint

# Lint with auto-fix
npm run lint:fix

# Format (Prettier)
npm run format

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run a single test file
npm test -- workflow-executor.test.ts

# Run tests matching a pattern
npm test -- --testPathPattern=skill
```

---

## TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with `bundler` module resolution
- **Strict mode**: Enabled
- **Path aliases**: `@/*` → `src/*` (use in imports)
- **Source maps**: Enabled
- **Declarations**: Generated alongside source

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## Code Style

### Formatting (Prettier)

| Option          | Value      |
| --------------- | ---------- |
| Semi            | `true`     |
| Single quotes   | `true`     |
| Tab width       | `2` spaces |
| Print width     | 100 chars  |
| Trailing comma  | `es5`      |
| Arrow parens    | `always`   |
| End of line     | `lf`       |
| Bracket spacing | `true`     |

### ESLint Rules

- `@typescript-eslint/no-explicit-any`: `warn` (allowed for dev debugging)
- `@typescript-eslint/no-unused-vars`: `warn` (prefix with `_` to ignore)
- `prefer-const`: `warn`
- `no-console`: `off`
- `@typescript-eslint/interface-name-prefix`: `off`
- `@typescript-eslint/ban-ts-comment`: `off`

---

## Import Conventions

### ESM with `.js` Extensions

Always include `.js` extensions in imports (required for bundler module resolution):

```typescript
// ✅ Correct
import { SkillRegistry } from '../src/skill-engine/registry.js';
import type { SkillInput } from '../src/types/index.js';
import { createLogger } from '@/utils/logger.js';

// ❌ Incorrect
import { SkillRegistry } from '../src/skill-engine/registry';
```

### Type-Only Imports

Use `import type` for type-only imports to enable tree-shaking:

```typescript
import type { SkillInput, SkillOutput, Workflow } from '../src/types/index.js';
```

---

## Naming Conventions

| Element     | Convention  | Example                                    |
| ----------- | ----------- | ------------------------------------------ |
| Files       | kebab-case  | `skill-registry.ts`, `error-handler.ts`    |
| Classes     | PascalCase  | `SkillRegistry`, `ErrorHandler`            |
| Interfaces  | PascalCase  | `SkillInput`, `WorkflowStep`               |
| Functions   | camelCase   | `createLogger`, `handleError`              |
| Variables   | camelCase   | `errorHandler`, `skillRegistry`            |
| Constants   | UPPER_SNAKE | `MAX_RETRIES`, `DEFAULT_TIMEOUT`           |
| Enums       | PascalCase  | `ErrorCode`, `ErrorSeverity`               |
| Enum values | UPPER_SNAKE | `ErrorCode.UNKNOWN`, `ErrorSeverity.ERROR` |

---

## Type Definitions

### Error Types

All errors use the `SCAError` class hierarchy from `src/types/errors.ts`:

```typescript
import { SCAError, ErrorCode, ErrorSeverity, ErrorRecoverable } from '../types/errors.js';

// Error codes are categorized:
// 1000-1999: General
// 2000-2999: Skill
// 3000-3999: Workflow
// 4000-4999: Storage
// 5000-5999: MCP
// 6000-6999: Knowledge base
```

### Skill Base Class

All skills extend `BaseSkill` from `src/skills/base.skill.ts`:

```typescript
import { BaseSkill } from '../skills/base.skill.js';
import type { SkillInput, SkillOutput } from '../types/index.js';

export class MySkill extends BaseSkill {
  readonly meta = {
    name: 'my-skill',
    description: 'Does something useful',
    category: 'utility' as const,
    version: '1.0.0',
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    return this.success({ result: 'done' });
  }
}
```

### SkillOutput Status Codes

| Code  | Meaning         | When to use               |
| ----- | --------------- | ------------------------- |
| `200` | Success         | Normal completion         |
| `300` | Needs input     | Requires user interaction |
| `400` | Retryable error | Can be retried            |
| `500` | Fatal error     | Cannot be retried         |

---

## Error Handling

### SCAError Structure

```typescript
const error = new SCAError(message, {
  code: ErrorCode.SKILL_EXECUTION_FAILED,
  severity: ErrorSeverity.ERROR,
  recoverable: ErrorRecoverable.MANUAL,
  context: {
    module: 'SkillEngine',
    operation: 'execute',
    relatedId: 'my-skill',
  },
  suggestions: [{ action: 'Check skill config', details: 'Verify skill is registered' }],
  cause: originalError,
});
```

---

## File Structure

```
src/
├── index.ts              # Main export
├── plugin.ts             # Plugin entry
├── bin/cli.ts            # CLI interface
├── types/                # Type definitions
│   ├── index.ts          # Main types (SkillInput, SkillOutput, Workflow, etc.)
│   └── errors.ts         # Error types (SCAError, ErrorCode, etc.)
├── skill-engine/         # Skill execution engine
├── skills/               # Built-in skills
│   ├── base.skill.ts     # BaseSkill abstract class
│   ├── atoms/            # Atomic skills
│   │   ├── generate/     # Code generation skills
│   │   ├── search/       # Search skills
│   │   └── utility/      # Utility skills
│   └── workflows/        # Workflow skills
├── storage/              # Storage layer
├── knowledge/            # Knowledge base
├── observer/             # Observer pattern
├── mcp/                  # MCP server
└── utils/                # Utilities
    ├── error-handler.ts  # Error handling
    ├── logger.ts         # Logging
    ├── retry-strategy.ts # Retry logic
    └── template-manager.ts # Templates
```

---

## Testing

### Test Structure

- Location: `tests/` directory
- Pattern: `**/*.test.ts` or `**/__tests__/**/*.ts`
- Framework: Jest with `ts-jest` preset
- Timeout: 30 seconds default

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MyClass } from '../src/my-class.js';

describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  it('should do something', () => {
    expect(instance.doSomething()).toBe('expected');
  });
});
```

### Test Imports

Use relative imports with `.js` extension:

```typescript
import { SkillRegistry } from '../src/skill-engine/registry.js';
import type { SkillInput } from '../src/types/index.js';
```

---

## Git & GitHub Conventions

### Commit Message Format

```
<type>(<scope>): <subject>

Types: feat, fix, docs, style, refactor, test, chore
Scope: skill, storage, mcp, workflow, etc.
```

Examples:

- `feat(skill): add new code generation skill`
- `fix(storage): handle permission errors`
- `docs(mcp): update tool descriptions`

### Branch Naming

```
feature/<name>     # New features
bugfix/<name>      # Bug fixes
hotfix/<name>      # urgent fixes
refactor/<name>    # Code refactoring
```

### GitHub Workflow

#### Pull Request Process

1. **Create branch** from `main`:

   ```bash
   git checkout main && git pull
   git checkout -b feature/my-feature
   ```

2. **Make changes** and commit:

   ```bash
   git add .
   git commit -m 'feat(scope): describe change'
   ```

3. **Push and create PR**:

   ```bash
   git push -u origin feature/my-feature
   ```

4. **PR Requirements**:
   - Link related issue: `Closes #123` or `Fixes #456`
   - Fill PR template completely
   - Pass all CI checks (lint, test, build)
   - Get at least 1 review approval

#### Pull Request Template

```markdown
## Summary

<!-- 1-3 sentence description of changes -->

## Type

- [ ] feat (new feature)
- [ ] fix (bug fix)
- [ ] docs (documentation only)
- [ ] refactor (code restructuring without behavior change)
- [ ] test (adding/updating tests)
- [ ] chore (maintenance tasks)

## Testing

<!-- How was this tested? -->

## Checklist

- [ ] Code follows project style guidelines
- [ ] Lint passes
- [ ] Tests pass
- [ ] Types are correct
```

#### Issue Templates

When creating issues, use these types:

| Type          | Label           | Use for                  |
| ------------- | --------------- | ------------------------ |
| `bug`         | Bug report      | Something not working    |
| `feature`     | Feature request | New functionality        |
| `enhancement` | Enhancement     | Improve existing feature |
| `question`    | Question        | Help understanding       |
| `docs`        | Documentation   | Doc improvements         |

#### Release Process

1. Update version in `package.json`
2. Create release commit:
   ```bash
   git commit -m 'chore(release): bump to v1.2.0'
   ```
3. Tag release:
   ```bash
   git tag -a v1.2.0 -m 'Release v1.2.0'
   git push origin main --tags
   ```
4. GitHub Actions publishes to npm (if configured)

---

## Path Aliases

Use `@/` prefix for imports from `src/`:

```typescript
// ✅ Recommended
import { createLogger } from '@/utils/logger.js';
import { SkillRegistry } from '@/skill-engine/registry.js';

// ✅ Also acceptable
import { createLogger } from '../src/utils/logger.js';
```

---

## Important Notes

1. **ESM Modules**: This project uses ES modules (`"type": "module"`). Always use `import/export` syntax with `.js` extensions in imports.

2. **Strict TypeScript**: `strict: true` is enabled. Avoid `any` type; if needed for debugging, use `// eslint-disable-next-line @typescript-eslint/no-explicit-any`.

3. **Error Recovery**: Always provide `RecoverySuggestion` array in SCAError for user-facing errors.

4. **Skill Metadata**: Every skill must define `meta` property with `name`, `description`, `category`, and `version`.

5. **Test Files**: Test files are excluded from TypeScript compilation (`tsconfig.json`). They run via ts-jest transform.
