import { AtomJob, AtomJobDateMode, AtomJobStatus } from "../../src/AtomJob";
import { AtomSchedulerError } from "../../src/AtomSchedulerError";
require('../common');

describe("Job", () => {
    let job: AtomJob;
    let job2: AtomJob;
    beforeEach(function () {
        job = new AtomJob("TestJob", "tomorrow at 4:00am");
        job2 = new AtomJob("TestJob", 'yesterday');

        // spyOn(foo, 'setBar').and.callThrough();
    });

    it("should instantiate", () => {
        expect(job).toBeDefined();
        expect(job).toBeTruthy();
    });
    it("should calculate plannedDate", () => {
        expect(job.plannedString).toEqual("tomorrow at 4:00am");
        var tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setHours(4, 0, 0, 0);
        expect(job.plannedOn.getUTCHours()).toBe(tomorrow.getUTCHours());
        expect(job.plannedOn.getUTCMinutes()).toBe(tomorrow.getUTCMinutes());
        expect(job.plannedOn.getUTCDate()).toBe(tomorrow.getUTCDate());
    });
    it("should perform job", () => {
        job2.perform((job, data, cancelToken): Promise<boolean> => {
            return Promise.resolve(true);
        }, {}, { cancel: null });
    });
    it("should retain an explicitly disabled recurrence setting", () => {
        let nonRecurringJob = new AtomJob("OneTimeJob", "tomorrow", {}, { isRecurring: false });

        expect(nonRecurringJob.isRecurring).toBeFalsy();
    });
    it("should not rerun a completed non-recurring job", () => {
        let nonRecurringJob = new AtomJob("OneTimeJob", "yesterday", {}, { isRecurring: false });
        nonRecurringJob.status = AtomJobStatus.Finished;
        nonRecurringJob.plannedOn = new Date(Date.now() - 1);

        expect(nonRecurringJob.couldRun()).toBeFalsy();
    });
    it("should use the completion time for after-finished schedules", () => {
        let afterFinishedJob = new AtomJob("AfterFinishedJob", "in 1 day", {}, { dateMode: AtomJobDateMode.AfterFinished });
        afterFinishedJob.started = new Date("2020-01-01T00:00:00.000Z");
        afterFinishedJob.finished = new Date("2020-01-03T00:00:00.000Z");
        (afterFinishedJob as any).refreshPlannedOn();

        expect(afterFinishedJob.plannedOn.getTime()).toBe(new Date("2020-01-04T00:00:00.000Z").getTime());
    });
    it("should finalize synchronous job errors", async () => {
        let error = new Error("Unexpected failure");

        await job2.perform(() => {
            throw error;
        }, {}, { cancel: null }).catch((caughtError) => {
            expect(caughtError).toBe(error);
        });

        expect(job2.status).toBe(AtomJobStatus.Failed);
        expect(job2.finished).toBeDefined();
        expect(job2.timeElapsed).toBeGreaterThanOrEqual(0);
    });
    it("should persist structured error details", async () => {
        const error: any = new Error("Unexpected failure");
        error.code = "E_TEST";

        await job2.perform(() => {
            throw error;
        }, {}, { cancel: null }).catch(() => undefined);

        const persistedError = JSON.parse(job2.lastErrorJSON);
        expect(persistedError.name).toBe("Error");
        expect(persistedError.message).toBe("Unexpected failure");
        expect(persistedError.stack).toContain("Error: Unexpected failure");
        expect(persistedError.code).toBe("E_TEST");
    });

    it("should serialize circular error details without masking the failure", async () => {
        const error: any = new Error("Circular failure");
        error.context = error;

        await job2.perform(() => Promise.reject(error), {}, { cancel: null }).catch(() => undefined);

        const persistedError = JSON.parse(job2.lastErrorJSON);
        expect(persistedError.name).toBe("Error");
        expect(persistedError.message).toBe("Circular failure");
    });

    it("should persist primitive rejection values", async () => {
        await job2.perform(() => Promise.reject("bad input"), {}, { cancel: null }).catch(() => undefined);

        expect(JSON.parse(job2.lastErrorJSON)).toBe("bad input");
    });

    it("should not classify ordinary errors by message prefix", async () => {
        const messages = ["Timed out in 20ms.", "Stopped by user."];

        for (let index = 0; index < messages.length; index++) {
            let attempts = 0;
            const messageJob = new AtomJob("MessageJob" + index, "yesterday", {}, {
                retry: { maxAttempts: 2 }
            });

            await messageJob.perform(() => {
                attempts++;
                throw new Error(messages[index]);
            }).catch(() => undefined);

            expect(attempts).toBe(2);
            expect(messageJob.status).toBe(AtomJobStatus.Failed);
        }
    });
    it("should retry ordinary failures with a bounded backoff", async () => {
        let attempts = 0;
        const retryingJob = new AtomJob("RetryingJob", "yesterday", {}, {
            retry: { maxAttempts: 3, backoff: 1 }
        });

        const result = await retryingJob.perform(() => {
            attempts++;
            if (attempts < 3) {
                throw new Error("Temporary failure");
            }
            return Promise.resolve("ok");
        });

        expect(result).toBe("ok");
        expect(attempts).toBe(3);
        expect(retryingJob.attempts).toBe(3);
        expect(retryingJob.status).toBe(AtomJobStatus.Finished);
    });

    it("should retain the final failure after retry exhaustion", async () => {
        let attempts = 0;
        const retryingJob = new AtomJob("ExhaustedJob", "yesterday", {}, {
            retry: { maxAttempts: 3, backoff: 1 }
        });

        await retryingJob.perform(() => {
            attempts++;
            throw new Error("Failure " + attempts);
        }).catch(() => undefined);

        expect(attempts).toBe(3);
        expect(retryingJob.attempts).toBe(3);
        expect(retryingJob.status).toBe(AtomJobStatus.Failed);
        expect(JSON.parse(retryingJob.lastErrorJSON).message).toBe("Failure 3");
    });

    it("should cancel a retry backoff", async () => {
        const token = { cancel: () => undefined };
        const retryingJob = new AtomJob("CancellableRetryJob", "yesterday", {}, {
            retry: { maxAttempts: 3, backoff: 100 }
        });

        const result = retryingJob.perform(() => Promise.reject(new Error("Temporary failure")), {}, token)
            .catch(() => undefined);

        await new Promise(resolve => setTimeout(resolve, 10));
        token.cancel();
        await result;

        expect(retryingJob.attempts).toBe(1);
        expect(retryingJob.status).toBe(AtomJobStatus.Stopped);
    });

    it("shouldn't perform future job", async () => {
        await job.perform((job, data, cancelToken): Promise<boolean> => {
            return Promise.resolve(true);
        }, {}, { cancel: null }).catch((error) => {
            expect(error).toBeTruthy();
        });
    });
    it("should check for timeout", async () => {
        job2.timeout = 20;
        let jobTime = 500;
        let p = await job2.perform(((job, data, cancelToken): Promise<boolean> => {
            return new Promise((resolve, reject) => {
                let id = setTimeout(() => {
                    clearTimeout(id);
                    resolve(true);
                }, jobTime);
            });
        }), {}, { cancel: null }).catch((err) => {
        });
        expect(job2.status).toEqual(AtomJobStatus.Timeout);
        expect(job2.timeElapsed).toBeLessThan(jobTime);

    })
    it("should request cancellation when a handler times out", async () => {
        const timedJob = new AtomJob("TimedJob", "yesterday");
        timedJob.timeout = 20;
        let cancelCalls = 0;
        const token: any = {
            cancel: () => {
                cancelCalls++;
            }
        };

        await timedJob.perform(() => new Promise(() => undefined), {}, token)
            .catch((error) => {
                expect(error.message).toContain("Timed out in 20ms.");
            });

        expect(cancelCalls).toBe(1);
        expect(timedJob.status).toBe(AtomJobStatus.Timeout);
    });

    it("should preserve timeout when cancellation fails", async () => {
        const timedJob = new AtomJob("FailedCancellationTimedJob", "yesterday");
        timedJob.timeout = 20;
        const token: any = {
            cancel: () => {
                throw new Error("cancel failed");
            }
        };

        await timedJob.perform(() => new Promise(() => undefined), {}, token)
            .catch((error) => {
                expect(error.message).toContain("Timed out in 20ms.");
            });

        expect(timedJob.status).toBe(AtomJobStatus.Timeout);
    });
    it("should be cancelable", async () => {
        let token = { cancel: null };
        let p = job2.perform(((job, data, cancelToken): Promise<boolean> => {
            return new Promise((resolve, rej) => {
                let id = setTimeout(() => {
                    clearTimeout(id);
                    resolve(true);
                }, 300);
                cancelToken.cancel = () => {
                    clearTimeout(id);
                    rej(new AtomSchedulerError("Stopped by user."));
                }
            });
        }), {}, token)
            .then(val => { expect("should").toBe("not run"); })
            .catch((err) => {
                expect(job2.status).toBe(AtomJobStatus.Stopped);
                expect(job2.timeElapsed).toBeLessThan(300);
                expect(job2.timeElapsed).toBeGreaterThan(0);
            });
        await new Promise(resolve => {
            setTimeout(resolve, 50)
        });
        token.cancel();
        await p;
    })
});