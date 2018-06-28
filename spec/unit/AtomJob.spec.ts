import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
import { AtomSchedulerError } from "../../src/AtomSchedulerError";

describe("Job", () => {
    let job: AtomJob;
    beforeEach(function () {
        job = new AtomJob("TestJob", "tomorrow morning", true);

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
        job.perform((job, data, cancelToken): Promise<boolean> => {
            return Promise.resolve(true);
        }, {}, { cancel: null });

    })
    it("should check for timeout", async (done) => {
        job.timeout = 20;
        let jobTime = 500;
        let p = await job.perform(((job, data, cancelToken): Promise<boolean> => {
            return new Promise((resolve, reject) => {
                let id = setTimeout(() => {
                    clearTimeout(id);
                    resolve(true);
                }, jobTime);
            });
        }), {}, { cancel: null }).catch((err) => {

            done();
        });
        expect(job.status).toEqual(AtomJobStatus.Timeout);
        expect(job.timeElapsed).toBeLessThan(jobTime);

    })
    it("should be cancelable",  async (done) => {
        let token = { cancel: null };
        let p = job.perform(((job, data, cancelToken): Promise<boolean> => {

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
                expect(job.status).toBe(AtomJobStatus.Stopped);
                expect(job.timeElapsed).toBeLessThan(200);
                done();
            });  
        token.cancel();

    })
});