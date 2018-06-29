import { AtomScheduler } from "../../src/AtomScheduler";
import { AtomMySQLAdapter } from "../../src/DBAdapters/AtomMySQLAdapter";
import { AtomJob } from "../../src/AtomJob";
require('../common');
describe("MySQLAdapter", () => {
    let adapter = new AtomMySQLAdapter(require('../config/'+process.env.NODE_ENV+'.js'));

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
        expect(await adapter.jobExists(job1Name)).toBeTruthy();
        done();
    });
    it("should delete job", async (done) => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(await adapter.jobExists(job1Name)).toBeTruthy();
        expect(await adapter.jobExists(job2Name)).toBeTruthy();
        await adapter.deleteJob(job1Name);
        await adapter.deleteJob(job2Name);
        expect(await adapter.jobExists(job1Name)).toBeFalsy();
        expect(await adapter.jobExists(job2Name)).toBeFalsy();
        done();
    });
    it("should be able to block and unblock", async (done) => {
        let job1 = await adapter.saveJob(new AtomJob(job1Name, 'tomorrow'));
        let job2 = await adapter.saveJob(new AtomJob(job2Name, 'tomorrow'));
        expect(await adapter.isJobLocked(job1Name)).toBeFalsy();
        let schedulerID = "sassddsf-as--A SasA-asAS";
        await adapter.lockJob(job1Name, schedulerID);
        expect((await adapter.getJob(job1Name)).schedulerID).toEqual(schedulerID);
        expect((await adapter.isJobLocked(job1Name))).toBeTruthy();
        await adapter.unlockJob(job1Name);
        expect((await adapter.isJobLocked(job1Name))).toBeFalsy();
        done();
    });
});
