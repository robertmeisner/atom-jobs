import { AtomMySQLAdapter } from "../../src/DBAdapters/AtomMySQLAdapter";
import { AtomJob } from "../../src/AtomJob";
require('../common');
describe("MySQLAdapter", () => {
    let adapter = new AtomMySQLAdapter(require('../config/' + process.env.NODE_ENV + '.js'));

    const job1Name = "job1Name";
    const job2Name = "job2Name";
    beforeEach(async (done) => {
        await adapter.deleteJob(job1Name, true);
        await adapter.deleteJob(job2Name, true);
        done();
    });
    afterEach(() => {

    });
    it("should create job", async (done) => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(job1).toBeTruthy();
        expect(job2).toBeTruthy();
        expect(await adapter.getJob(job1Name)).toBeTruthy();
        done();
    });
    it("should update", async (done) => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(await adapter.updateJob({ name: job1Name, timeout: 300 })).toBeTruthy();
        expect(await adapter.updateJob({ name: job2Name, timeout: 400 })).toBeTruthy();
        expect((await adapter.getJob(job1Name)).timeout).toBe(300);
        expect((await adapter.getJob(job2Name)).timeout).toBe(400);
        done();
    });
    it("should delete job", async (done) => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(await adapter.getJob(job1Name)).toBeTruthy();
        expect(await adapter.getJob(job2Name)).toBeTruthy();
        await adapter.deleteJob(job1Name);
        await adapter.deleteJob(job2Name);
        expect(await adapter.getJob(job1Name)).toBeFalsy();
        expect(await adapter.getJob(job2Name)).toBeFalsy();
        done();
    });

    it("should list all jobs", async (done) => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect((await adapter.getAllJobs()).length).toBe(2);
        done();
    });
});
