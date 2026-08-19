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