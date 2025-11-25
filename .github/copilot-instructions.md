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

## Coding Conventions

- Use TypeScript for all source files
- Follow ESLint with Airbnb base rules
- Use ES6+ features (TypeScript target is ES6, with ES2015/ESNext/DOM libs)
- Export interfaces and classes from `main.ts`
- Place tests in the `spec/` directory with `.spec.ts` extension
- Use Jasmine for testing

## Testing Guidelines

- Unit tests go in `spec/unit/`
- Integration tests go in `spec/integration/`
- Test files should follow the naming pattern `*.spec.ts`
- Run tests with `yarn test` before submitting changes

## Database Setup for Testing

Integration tests require a MySQL database. The schema is located at:
`src/DBAdapters/schema/MySQL.sql`
