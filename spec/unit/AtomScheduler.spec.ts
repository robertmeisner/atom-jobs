import "jasmine";
import { AtomDBAdapter } from "../../src/AtomDBAdapter";
import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
import { AtomScheduler } from "../../src/AtomScheduler";
require('../common');

let JOBS: Map<string, AtomJob>;
let DBMock: AtomDBAdapter = {

    deleteJob(jobName: string, force?: boolean): Promise<boolean> {
        return Promise.resolve(false);
    },
    saveJob(job: AtomJob): Promise<AtomJob> {
        JOBS.set(job.name, job);
        return Promise.resolve(job);
    },
    updateJob(job: AtomJob | any): Promise<AtomJob> {
        return Promise.resolve(Object.assign(JOBS.get(job.name), job));
    },
    getJob(name: string): Promise<AtomJob> {
        return Promise.resolve(JOBS.get(name));
    },
    getAllJobs(): Promise<AtomJob[]> {
        return Promise.resolve(Array.from(JOBS.values()));//JOBS.values().;
    }
};;
let JobMock: AtomJob = AtomJob.create({
    name: "JobMock",
    started: new Date(), status: AtomJobStatus.Waiting, plannedOn: new Date(),
    plannedString: "sunday night", timeElapsed: 0, timeout: 1111111111111
});

const job1Name = "job1Name";
const job2Name = "job2Name";

describe("Scheduler", () => {
    let scheduler: AtomScheduler = null;
    let scheduler2: AtomScheduler = null;
    let saveJobSpy;
    beforeEach(function () {
        JOBS = new Map();
        saveJobSpy = spyOn(DBMock, "saveJob").and.callThrough();
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
    it("should define new job", async () => {
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
        expect(DBMock.saveJob).toHaveBeenCalled();
    });
    it("should be able to block and unblock", async () => {
        let job1 = await scheduler.createJob(job1Name, 'tomorrow');
        let job2 = await scheduler.createJob(job2Name, 'tomorrow');
        expect(await scheduler.isJobLocked(job1Name)).toBeFalsy();
        await scheduler.lockJob(job1Name);
        expect((await scheduler.getJob(job1Name)).schedulerID).toEqual(scheduler.ID);
        expect((await scheduler.isJobLocked(job1Name))).toBeTruthy();
        await scheduler.unlockJob(job1Name);
        expect((await scheduler.isJobLocked(job1Name))).toBeFalsy();
    });
    it("should list all jobs", async () => {
        let job = await scheduler.createJob("L1", "sunday night");
        let job2 = await scheduler.createJob("L2", "sunday night");
        let job3 = await scheduler.createJob("L3", "sunday night");
        let job4 = await scheduler.createJob("L4", "sunday night");
        expect((await scheduler.getAllJobs()).length).toBe(4);
    });
    it("should not persist transient job state by default", async () => {
        let updateJobSpy = spyOn(DBMock, "updateJob").and.callFake((job) => Promise.resolve(job));
        let job = new AtomJob("TransientStateJob", "tomorrow");
        job.schedulerID = scheduler.ID;
        job.status = AtomJobStatus.Pending;
        job.started = new Date();
        job.finished = new Date();
        job.timeElapsed = 100;

        await scheduler.updateJob(job);

        let persistedJob = updateJobSpy.calls.mostRecent().args[0];
        expect(persistedJob).not.toBe(job);
        expect(persistedJob.schedulerID).toBeUndefined();
        expect(persistedJob.status).toBeUndefined();
        expect(persistedJob.started).toBeUndefined();
        expect(persistedJob.finished).toBeUndefined();
        expect(persistedJob.timeElapsed).toBeUndefined();
        expect(job.schedulerID).toBe(scheduler.ID);
    });
    it("should getNextJob", async () => {
        let job = await scheduler.createJob("L1", "sunday night",{});
        let job2 = await scheduler.createJob("L2", "sunday night",{});
        let job3 = await scheduler.createJob("L3", "yesterday",{});
        await scheduler.defineJob("L3",job=>Promise.resolve(true),{});
        let job4 = await scheduler.createJob("L4", "sunday night");
        let nextJob = await scheduler.getNextJob();
        expect(nextJob.name).toBe(job3.name);
    });
    it("should do active job", () => {
    });

    describe("Verbose logging", () => {
        let verboseScheduler: AtomScheduler;
        let consoleSpy: jasmine.Spy;

        beforeEach(function () {
            JOBS = new Map();
            consoleSpy = spyOn(console, "log");
            verboseScheduler = new AtomScheduler(DBMock, true);
        });

        afterEach(async function () {
            if (verboseScheduler && verboseScheduler.hasStarted()) {
                await verboseScheduler.stop();
            }
        });

        it("should log when verbose is enabled", async () => {
            verboseScheduler.start();
            expect(consoleSpy).toHaveBeenCalledWith(jasmine.stringMatching(/\[AtomScheduler.*\] Scheduler started/));
            await verboseScheduler.stop();
        });

        it("should not log when verbose is disabled", async () => {
            let nonVerboseScheduler = new AtomScheduler(DBMock, false);
            nonVerboseScheduler.start();
            expect(consoleSpy).not.toHaveBeenCalled();
            await nonVerboseScheduler.stop();
        });

        it("should default to non-verbose when verbose parameter is not provided", async () => {
            let defaultScheduler = new AtomScheduler(DBMock);
            defaultScheduler.start();
            expect(consoleSpy).not.toHaveBeenCalled();
            await defaultScheduler.stop();
        });

        it("should include job information in verbose logs", async () => {
            let job = await verboseScheduler.createJob("TestJob", "yesterday");
            await verboseScheduler.defineJob("TestJob", () => Promise.resolve(true), {});
            
            // Trigger the verbose log manually
            (verboseScheduler as any).verboseLog("Test message", job);
            
            expect(consoleSpy).toHaveBeenCalledWith(jasmine.stringMatching(/\[AtomScheduler.*\]\s*\[Job: TestJob\] Test message/));
        });
    });

}); 