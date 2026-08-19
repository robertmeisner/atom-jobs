import { AtomInMemoryAdapter } from "../../src/DBAdapters/AtomInMemoryAdapter";
import { AtomJob, AtomJobStatus } from "../../src/AtomJob";
import { AtomScheduler } from "../../src/AtomScheduler";
require("../common");

describe("InMemoryAdapter", () => {
    it("should persist and query jobs", async () => {
        const adapter = new AtomInMemoryAdapter();
        await adapter.saveJob(new AtomJob("A:1", "yesterday"));
        await adapter.saveJob(new AtomJob("A:2", "tomorrow"));

        const allJobs = await adapter.getAllJobs();
        const filteredJobs = await adapter.getAllJobs([{ field: "name", operator: "like", value: "A:%" }]);

        expect(allJobs.length).toBe(2);
        expect(filteredJobs.length).toBe(2);
    });

    it("should refuse deleting locked jobs without force", async () => {
        const adapter = new AtomInMemoryAdapter();
        const job = new AtomJob("LockedJob", "yesterday");
        job.schedulerID = "scheduler-x";
        await adapter.saveJob(job);

        const removedWithoutForce = await adapter.deleteJob("LockedJob");
        const removedWithForce = await adapter.deleteJob("LockedJob", true);

        expect(removedWithoutForce).toBeFalsy();
        expect(removedWithForce).toBeTruthy();
    });
});

describe("Scheduler modern API", () => {
    it("should schedule and run a registered job", async () => {
        const adapter = new AtomInMemoryAdapter();
        const scheduler = new AtomScheduler(adapter, { tickTime: 5 });
        let executed = false;

        await scheduler.scheduleJob("RunNow", "yesterday", { source: "unit" });
        await scheduler.registerJob("RunNow", async (job) => {
            executed = true;
            expect(job.metadataObject["source"]).toBe("unit");
            return true;
        }, {});

        scheduler.start();
        await new Promise((resolve) => setTimeout(resolve, 20));
        await scheduler.stop();

        const finishedJob = await scheduler.getJob("RunNow");
        expect(executed).toBeTruthy();
        expect(finishedJob.status).toBe(AtomJobStatus.Finished);
    });
});
