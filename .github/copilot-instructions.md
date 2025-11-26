# Copilot Instructions for atom-jobs

## Project Overview

atom-jobs is a simple Node.js job scheduler with database storage. It provides a way to schedule and manage background tasks/jobs with persistence.

## Technology Stack

- **Language**: TypeScript
- **Build System**: TypeScript compiler (`tsc`)
- **Testing Framework**: Jasmine with jasmine-ts
- **Coverage**: nyc (Istanbul)
- **Package Manager**: Yarn (preferred) or npm
- **Database**: MySQL support (Knex and Objection.js are dev dependencies for testing)
- **Linting**: ESLint with Airbnb base configuration

## Project Structure

```
src/                    # Source TypeScript files
  AtomDBAdapter.ts      # Database adapter interface
  AtomEvent.ts          # Event handling
  AtomJob.ts            # Job definition and status
  AtomScheduler.ts      # Main scheduler logic
  AtomSchedulerError.ts # Error handling
  DBAdapters/           # Database adapter implementations
  main.ts               # Main entry point and exports
spec/                   # Test files
  unit/                 # Unit tests
  integration/          # Integration tests
  config/               # Test configuration
dist/                   # Compiled JavaScript output
types/                  # TypeScript declaration files
```

## Development Commands

- **Build**: `yarn build` or `npm run build`
- **Test**: `yarn test` or `npm run test`
- **Clean**: `yarn cleanup` or `npm run cleanup`
- **Documentation**: `yarn docs` or `npm run docs`
- **Release**: `yarn release` or `npm run release`

## Workflow Guidelines

When working on tasks in this repository:

1. Always run `yarn install` first to ensure dependencies are up to date
2. Run `yarn build` to verify the code compiles before making changes
3. Run `yarn test` before and after making changes to catch regressions
4. Make small, focused commits with clear messages
5. Follow existing code patterns and conventions

## Coding Conventions

- Use TypeScript for all source files
- Follow ESLint with Airbnb base rules
- Use ES6+ features (TypeScript target is ES6, with ES2015/ESNext/DOM libs)
- Export interfaces and classes from `main.ts`
- Place tests in the `spec/` directory with `.spec.ts` extension
- Use Jasmine for testing

### Import Style

Use relative imports for local modules:

```typescript
import { AtomSchedulerError } from "./AtomSchedulerError";
import { AtomJob, AtomJobStatus } from "./AtomJob";
```

Use `require` for CommonJS modules without type definitions:

```typescript
var chrono = require('chrono-node');
```

### Error Handling

Use the `AtomSchedulerError` class for all scheduler-related errors:

```typescript
import { AtomSchedulerError } from "./AtomSchedulerError";

// Throwing errors
throw new AtomSchedulerError('Description of what went wrong');

// In promises
reject(new AtomSchedulerError("Job " + this.name + " error message"));
```

### Class Patterns

Follow the existing class structure with:
- Public properties declared at class level
- Constructor for initialization
- Static factory methods when needed (e.g., `AtomJob.create()`)
- Async methods returning `Promise<any>` for operations

## Testing Guidelines

- Unit tests go in `spec/unit/`
- Integration tests go in `spec/integration/`
- Test files should follow the naming pattern `*.spec.ts`
- Run tests with `yarn test` before submitting changes

### Test File Structure

```typescript
import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
import { AtomSchedulerError } from "../../src/AtomSchedulerError";
require('../common');

describe("FeatureName", () => {
    let instance: ClassName;
    
    beforeEach(function () {
        // Setup test fixtures
        instance = new ClassName("param", "value");
    });

    it("should describe expected behavior", () => {
        expect(instance).toBeDefined();
        expect(instance.property).toEqual("expectedValue");
    });

    it("should handle async operations", async (done) => {
        await instance.asyncMethod().then((result) => {
            expect(result).toBeTruthy();
            done();
        });
    });
});
```

## Database Setup for Testing

Integration tests require a MySQL database. The schema is located at:
`src/DBAdapters/schema/MySQL.sql`

## Adding New Features

When adding new features:

1. Create the TypeScript source file in `src/`
2. Export the new class/interface from `src/main.ts`
3. Add unit tests in `spec/unit/`
4. Update documentation if needed
5. Ensure all tests pass with `yarn test`
