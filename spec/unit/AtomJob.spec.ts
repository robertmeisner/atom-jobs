import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
import { AtomSchedulerError } from "../../src/AtomSchedulerError";
require('../common');

describe("Job", () => {
    let job: AtomJob;
    let job2: AtomJob;
    beforeEach(function () {
        job = new AtomJob("TestJob", "tomorrow morning");
        job2 = new AtomJob("TestJob", 'yesterday');

        // spyOn(foo, 'setBar').and.callThrough();
    });

    it("should instantiate", () => {
        expect(job).toBeDefined();
        expect(job).toBeTruthy();
    });
    it("should calculate plannedDate", () => {
        expect(job.plannedString).toEqual("tomorrow morning");
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        expect(job.plannedOn.getHours()).toBe(tomorrow.getHours());
        expect(job.plannedOn.getMinutes()).toBe(tomorrow.getMinutes());
        expect(job.plannedOn.getDate()).toBe(tomorrow.getDate());
    });
    it("should perform job", () => {
        job2.perform((job, data, cancelToken): Promise<boolean> => {
            return Promise.resolve(true);
        }, {}, { cancel: null });
    });
    it("shouldn't perform future job", async(done) => {
        job.perform((job, data, cancelToken): Promise<boolean> => {
            return Promise.resolve(true);
        }, {}, { cancel: null }).catch((error) => {
            expect(error).toBeTruthy();
            done();
        });
    });
    it("should check for timeout", async (done) => {
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

            done();
        });
        expect(job2.status).toEqual(AtomJobStatus.Timeout);
        expect(job2.timeElapsed).toBeLessThan(jobTime);

    })
    it("should be cancelable", async (done) => {
        let token = { cancel: null };
        let p = job2.perform(((job, data, cancelToken): Promise<boolean> => {
            return new Promise((resolve, rej) => {
                let id = setTimeout(() => {
                    clearTimeout(id);
                    resolve(true);
                }, 200);
                cancelToken.cancel = () => {
                    clearTimeout(id);
                    rej(new AtomSchedulerError("Stopped by user."));
                }
            });
        }), {}, token)
            .then(val => { expect("should").toBe("not run"); })
            .catch((err) => {
                expect(job2.status).toBe(AtomJobStatus.Stopped);
                expect(job2.timeElapsed).toBeLessThan(200);
                expect(job2.timeElapsed).toBeGreaterThan(0);
                done();
            });
        token.cancel();

    })
});