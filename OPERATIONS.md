# Operations guide

This guide covers the behavior that matters when running \`atom-jobs\` in an application. The public API reference remains in the [README](README.md) and the generated TypeScript declarations.

## Start and stop the scheduler

Register job handlers before starting the scheduler. \`start()\` enables the polling interval and triggers an initial tick. Calling \`start()\` again while the scheduler is running has no effect.

\`\`\`typescript
const scheduler = new AtomScheduler(adapter, { tickTime: 1000 });

await scheduler.scheduleJob("report:daily", "in 2 seconds", { tenant: "acme" });
await scheduler.registerJob("report:daily", async (job, data, cancelToken) => {
  await runReport(data, cancelToken);
});

scheduler.start();
\`\`\`

Stop the scheduler during application shutdown and await the returned promise before closing the storage connection:

\`\`\`typescript
process.once("SIGTERM", async () => {
  await scheduler.stop();
  await closeDatabaseConnection();
});
\`\`\`

When stopping, the scheduler clears its polling timer. If a pending job is active, it requests cancellation, waits for the handler and job finalization, and then releases the job lock. Handlers should cooperate with the cancellation token when their work supports cancellation.

## Job lifecycle

The documented lifecycle is:

\`\`\`text
Waiting -> Pending -> Finished | Failed | Timeout | Stopped
\`\`\`

Jobs are recurring by default. Set \`isRecurring: false\` in the job options for one-shot work; a completed non-recurring job remains finished and is not scheduled again.

Use the scheduler events for application-level observability:

\`\`\`typescript
const unsubscribe = scheduler.jobFinished.on((job) => {
  console.log(\`\${job.name} finished with status \${job.status}\`);
});

// Call unsubscribe when the observer is no longer needed.
\`\`\`

Available events are \`jobStarted\`, \`jobFinished\`, and \`ticked\`. The \`on\` method returns an unsubscribe function.

## Failure diagnostics

Failed jobs retain structured details in \`lastErrorJSON\`, including the error name, message, stack, and enumerable fields when available. Treat job metadata and error fields as potentially sensitive: do not write credentials or personal data into payloads, and redact sensitive values before forwarding diagnostics to logs or telemetry.

## Bounded retries

Retries are opt-in through the job options:

\`\`\`typescript
await scheduler.scheduleJob("report:daily", "in 5 minutes", {}, {
  retry: { maxAttempts: 3, backoff: 1000 }
});
\`\`\`

\`maxAttempts\` is the total number of attempts, including the initial execution. \`backoff\` is a linear delay in milliseconds before each retry. The default is one attempt, so existing jobs keep their current behavior. Only ordinary failures retry; timeouts and cancellations finish with their existing status. The maximum is 100 total attempts and a 1-hour delay per retry. The latest run's count is available as \`job.attempts\`, and an exhausted job retains its final error in \`lastErrorJSON\`.

Keep retries finite and use backoff values appropriate for the dependency being called. A retry does not make a handler idempotent; protect external side effects from duplication.

## MySQL deployments

1. Create the target database.
2. Apply [\`src/DBAdapters/schema/MySQL.sql\`](src/DBAdapters/schema/MySQL.sql), changing the \`USE test;\` line to the target database.
3. Configure \`AtomMySQLAdapter\` with the connection details required by the application.
4. Start the scheduler only after the adapter and all job handlers are ready.
5. Stop the scheduler before closing the MySQL connection.

Keep connection credentials in environment variables or a secret manager. Do not commit them to the repository or include them in job metadata.

## Integration tests

The default test command does not require MySQL. To run the integration specs against a local database:

\`\`\`sh
cross-env RUN_INTEGRATION_TESTS=true npm test
\`\`\`

The expected local setup is MySQL at \`127.0.0.1:3306\`, a database named \`test\` unless the test configuration is changed, and the schema applied before the test run. If the integration tests cannot connect, check the server, port, credentials, database permissions, and schema before investigating scheduler behavior.

## Troubleshooting checklist

- No job runs: confirm the job was created, the handler was registered with the same name, and \`scheduler.start()\` was called.
- A job is not registered: \`registerJob\` requires the persisted job to exist first; schedule or create it before registering the handler.
- A one-shot job repeats: check that \`isRecurring\` is explicitly set to \`false\` in its options.
- Shutdown hangs: check whether the active handler honors cancellation and whether it is waiting on an external operation.
- Failure lacks context: inspect \`lastErrorJSON\` and the \`jobFinished\` event before retrying the work manually.

For broader architecture and future improvements, see the [Project Wiki](https://github.com/robertmeisner/atom-jobs/wiki) and the [open Issues](https://github.com/robertmeisner/atom-jobs/issues).
