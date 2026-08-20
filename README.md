# atom-jobs

Lean persistent job scheduler for Node.js projects.

## Why this library

- Lightweight scheduler loop with explicit `start`/`stop`
- Natural language scheduling (`"in 5 minutes"`, `"tomorrow 09:00"`)
- Pluggable storage adapters
- Built-in in-memory adapter for local apps and tests
- MySQL adapter for persisted distributed workloads

## Installation

```sh
npm install atom-jobs
```

## Quick start (in-memory)

```typescript
import {
  AtomInMemoryAdapter,
  AtomScheduler
} from "atom-jobs";

const adapter = new AtomInMemoryAdapter();
const scheduler = new AtomScheduler(adapter, { tickTime: 1000 });

await scheduler.scheduleJob("report:daily", "in 2 seconds", { tenant: "acme" });

await scheduler.registerJob("report:daily", async (job) => {
  console.log("Running", job.name, job.metadataObject);
}, {});

scheduler.start();
```

## Persistent MySQL adapter

```typescript
import { AtomMySQLAdapter, AtomScheduler } from "atom-jobs";

const adapter = new AtomMySQLAdapter({
  client: "mysql",
  connection: {
    host: "127.0.0.1",
    user: "root",
    password: "",
    database: "test"
  }
});

const scheduler = new AtomScheduler(adapter, { tickTime: 2000 });
```

Schema: `src/DBAdapters/schema/MySQL.sql`

## Core API

### Scheduler

- `scheduleJob(name, when, metadata?, options?)`
- `registerJob(name, handler, data?)`
- `start()` / `stop()`
- `tick()` for manual processing
- `listJobs()` / `getJob(name)` / `removeJob(name, force?)`

### Job lifecycle

`Waiting -> Pending -> Finished | Failed | Timeout | Stopped`

Non-recurring jobs (`isRecurring: false`) run once and stay finished.

Failed jobs retain structured diagnostic details in `lastErrorJSON`, including the error name, message, stack, and enumerable fields when available.

Jobs may opt into bounded retries with `retry: { maxAttempts, backoff }`. `maxAttempts` is the total number of attempts, `backoff` is a linear delay in milliseconds, and `attempts` reports the attempts used by the latest run. The default remains one attempt; timeouts and cancellations are not retried.

## Events

- `scheduler.jobStarted.on(handler)`
- `scheduler.jobFinished.on(handler)`
- `scheduler.ticked.on(handler)`

`on` returns an unsubscribe function.

## Integration specs

Integration specs are tests in `spec/integration/` that run against a real MySQL database.  
They verify the storage adapter behavior end-to-end (insert/update/delete/query).

Local setup:

1. Start MySQL on `127.0.0.1:3306`
2. Create database `test`
3. Apply `src/DBAdapters/schema/MySQL.sql`
4. Run `cross-env RUN_INTEGRATION_TESTS=true npm test`

By default, `npm test` runs unit specs and skips integration specs unless `RUN_INTEGRATION_TESTS=true`.

## Documentation

- [Operations guide](OPERATIONS.md) - lifecycle, shutdown, diagnostics, and MySQL troubleshooting
- [Project Wiki](https://github.com/robertmeisner/atom-jobs/wiki) - architecture and maintained project guidance
- [Open development issues](https://github.com/robertmeisner/atom-jobs/issues) - planned work and priorities

## Development

```sh
npm run build
npx jasmine-ts "./spec/unit/**/*.spec.ts"
```
