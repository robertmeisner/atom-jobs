import { AtomMySQLAdapter } from "../../src/DBAdapters/AtomMySQLAdapter";
import { AtomJob } from "../../src/AtomJob";
require('../common');

const integrationDescribe = process.env.RUN_INTEGRATION_TESTS === "true" ? describe : xdescribe;

integrationDescribe("MySQLAdapter", () => {
    let adapter = new AtomMySQLAdapter(require('../config/' + process.env.NODE_ENV + '.js'));

    const job1Name = "job1Name";
    const job2Name = "job2Name";
    let clean = (async () => {
        await adapter.deleteJob(job1Name, true);
        await adapter.deleteJob(job2Name, true);
        await adapter.deleteJob('CRAWLER:' + job1Name, true);
        await adapter.deleteJob('CRAWLER:' + job2Name, true);
    });
    afterAll(async () => {
        await adapter.close();
        await adapter.close();
    });
    beforeEach(async () => {
        await clean();
    });
    afterEach(async () => {
        await clean();
    });
    it("should create job", async () => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(job1).toBeTruthy();
        expect(job2).toBeTruthy();
        expect(await adapter.getJob(job1Name)).toBeTruthy();
    });
    it("should update", async () => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(await adapter.updateJob({ name: job1Name, timeout: 300 })).toBeTruthy();
        expect(await adapter.updateJob({ name: job2Name, timeout: 400 })).toBeTruthy();
        expect((await adapter.getJob(job1Name)).timeout).toBe(300);
        expect((await adapter.getJob(job2Name)).timeout).toBe(400);
    });
    it("should delete job", async () => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(await adapter.getJob(job1Name)).toBeTruthy();
        expect(await adapter.getJob(job2Name)).toBeTruthy();
        await adapter.deleteJob(job1Name);
        await adapter.deleteJob(job2Name);
        expect(await adapter.getJob(job1Name)).toBeFalsy();
        expect(await adapter.getJob(job2Name)).toBeFalsy();
    });

    it("should list all jobs", async () => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect((await adapter.getAllJobs()).length).toBe(2);
    });
    it("should list jobs by flag", async () => {
        let job1 = await adapter.saveJob(new AtomJob('CRAWLER:' + job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob('CRAWLER:' + job2Name, 'tomorrow'));
        expect((await adapter.getAllJobs([{ field: 'name', operator: 'like', value: 'CRAWLER:%' }])).length).toBe(2);
    });

    it("should persist retry settings and attempts", async () => {
        const retryingJob = await adapter.saveJob(new AtomJob(job1Name, "tomorrow", {}, {
            retry: { maxAttempts: 3, backoff: 250 }
        }));

        await adapter.updateJob({ name: job1Name, attempts: 2 });
        const loadedJob = await adapter.getJob(job1Name);

        expect(loadedJob.retry.maxAttempts).toBe(3);
        expect(loadedJob.retry.backoff).toBe(250);
        expect(loadedJob.attempts).toBe(2);
    });

});
