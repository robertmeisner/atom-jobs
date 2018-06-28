import "jasmine";
import { AtomDBAdapter } from "../../src/AtomDBAdapter";
import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
import { AtomScheduler } from "../../src/AtomScheduler";
import { notDeepEqual } from "assert";

const JOBS: Map<string, AtomJob> = new Map();
let DBMock: AtomDBAdapter = {

    saveJob(job: AtomJob): Promise<AtomJob> {
        JOBS.set(job.name, job);
        return Promise.resolve(job);
    },
    getJob(name: string): Promise<AtomJob> {
        return Promise.resolve(JOBS.get(name));
    },
    getNextJob(schedulerID: string): Promise<AtomJob> {
        return null;
    },
    getAllJobs(): Promise<AtomJob[]> {
        return null;//JOBS.values().;
    }
};;
let JobMock: AtomJob = AtomJob.create({
    name: "JobMock",
    started: new Date(), status: AtomJobStatus.Waiting, plannedOn: new Date(),
    plannedString: "sunday night", timeElapsed: 0, timeout: 1111111111111
});


describe("Scheduler", () => {
    let scheduler: AtomScheduler = null;
    let scheduler2: AtomScheduler = null;
    beforeEach(function () {

        spyOn(DBMock, "saveJob").and.callThrough();
        scheduler = new AtomScheduler(DBMock);
        scheduler2 = new AtomScheduler(DBMock);

    });

    it("should instantiate", () => {
        expect(scheduler).not.toBeNull();
        expect(scheduler).toBeTruthy();
    });
    it("should have unique id", () => {
        expect(scheduler.ID).not.toEqual(scheduler2.ID);
    });
    it("should create new job", async () => {
        let job = await scheduler.createJob("JonBame", "sunday night");
        expect(job).toBeTruthy();
        expect(job.name).toEqual("JonBame");
        expect(DBMock.saveJob).toHaveBeenCalled();

    });
    it("should define new job", async (done) => {
        let job: AtomJob = await scheduler.defineJob("JonBame",
            (job2: AtomJob, data?: any, cancelTocken?: { cancel: Function }): Promise<boolean> => {
                return Promise.resolve(true);
            }
            , { a: "test" });
        expect(job).toBeTruthy();
        expect(job.name).toEqual("JonBame");
        expect(scheduler.jobDefinitions.has("JonBame"))
        done(); 
        //expect(DBMock.saveJob).toHaveBeenCalled();

    });
}); 