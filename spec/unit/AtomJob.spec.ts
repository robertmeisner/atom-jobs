import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
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
        console.log(job.plannedOn);
        console.log(job.plannedOn.getUTCHours());
        console.log(tomorrow.getUTCHours());
        console.log(tomorrow);
       expect(job.plannedOn.getUTCHours()).toBe(tomorrow.getUTCHours());
        expect(job.plannedOn.getUTCMinutes()).toBe(tomorrow.getUTCMinutes());
        expect(job.plannedOn.getUTCDate()).toBe(tomorrow.getUTCDate());
    });
    it("should perform job", () => {
        job2.perform((job, data, cancelToken): Promise<boolean> => {
            return Promise.resolve(true);
        }, {}, { cancel: null });
    });
    it("shouldn't perform future job", async (done) => {
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
                done();
            });
        await new Promise(resolve=>{
            setTimeout(resolve,50)
        });
        token.cancel();

    })
});