import "jasmine";
import { AtomDBAdapter } from "../../src/AtomDBAdapter";
import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
import { AtomScheduler } from "../../src/AtomScheduler";
require('../common');

let JOBS: Map<string, AtomJob>;
let DBMock: AtomDBAdapter = {

    deleteJob(jobName: string, force?: boolean): Promise<boolean> {
        return null;
    },
    saveJob(job: AtomJob): Promise<AtomJob> {
        JOBS.set(job.name, job);
        return Promise.resolve(job);
    },
    updateJob(job: AtomJob | any): Promise<AtomJob> {
        return null;
    },
    getJob(name: string): Promise<AtomJob> {
        return Promise.resolve(JOBS.get(name));
    },
    getNextJob(schedulerID: string): Promise<AtomJob> {
        return null;
    },
    getAllJobs(): Promise<AtomJob[]> {
        return Promise.resolve(Array.from(JOBS.values()));//JOBS.values().;
    },
    isJobLocked(jobName: string): Promise<boolean> {
        return null;
    },
    unlockJob(jobName: string): Promise<boolean> {
        return null;
    },
    lockJob(jobName: string): Promise<boolean> {
        return null;
    },
    jobExists(jobName: string): Promise<boolean> {
        return null;
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
        JOBS = new Map();
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
        try {
            await scheduler.defineJob(
                "A1",
                (job2: AtomJob, data?: any, cancelTocken?: { cancel: Function }): Promise<boolean> => { return Promise.resolve(true); },
                { a: "test" }
            );
        } catch (error) {
            expect(error.message).toBe("Job A1 could not be defined. Create the job first.");
        }


        let job: AtomJob = await scheduler.createJob("A1", "tomorrow");
        job = await scheduler.defineJob("A1",
            (job2: AtomJob, data?: any, cancelTocken?: { cancel: Function }): Promise<boolean> => {
                return Promise.resolve(true);
            }
            , { a: "test" });
        expect(job).toBeTruthy();
        expect(job.name).toEqual("A1");
        expect(scheduler.jobDefinitions.has("A1"))
        done();
        //expect(DBMock.saveJob).toHaveBeenCalled();

    });
    xit("should list all jobs", async (done) => {
        let job = await scheduler.createJob("L1", "sunday night");
        let job2 = await scheduler.createJob("L2", "sunday night");
        let job3 = await scheduler.createJob("L3", "sunday night");
        let job4 = await scheduler.createJob("L4", "sunday night");
        done();
    });
}); 