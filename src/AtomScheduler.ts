import { AtomDBAdapter } from "./AtomDBAdapter";
import { AtomJob } from "./AtomJob";
import date = require('date.js');
import { AtomSchedulerError } from "./AtomSchedulerError";
var crypto = require('crypto');
export class AtomScheduler {
    constructor(db: AtomDBAdapter) {
        this.dBAdapter = db;
        this.ID = (() => {
            // let array=(new Uint32Array(8)); node 9+
            let array = Buffer.from([, 1, 2, 3, 4, 5, 6, 7]);
            crypto.randomFillSync(array);
            let str = '';
            for (let i = 0; i < array.length; i++) {
                str += (i < 2 || i > 5 ? '' : '-') + array[i].toString(16).slice(-4)
            }
            return str;
        })();
    }
    public ID;
    private dBAdapter: AtomDBAdapter;
    public jobDefinitions: Map<string, { func: (job: AtomJob, data?: any) => Promise<boolean>, data: object, cancelToken: { cancel: Function } }> = new Map();
    private activeJob: AtomJob;
    private started = false;
    private timer;
    /**
     * Defines job
     * @param jobName 
     * @param func 
     */
    async createJob(jobName, when: string, func?: (job: AtomJob, data?: {}) => Promise<boolean>, data?: object) {
        let job: AtomJob = await this.dBAdapter.getJob(jobName);
        if (!job) {
            job = new AtomJob(jobName, when);
            job = await this.dBAdapter.saveJob(job);
        }
        if (func)
            job = await this.defineJob(jobName, func, data);
        return job;
    }
    async defineJob(jobName: string, func?: (job: AtomJob, data?: any, cancelTocken?: { cancel: Function }) => Promise<boolean>, data?: object): Promise<AtomJob> {
        let job: AtomJob = await this.dBAdapter.getJob(jobName);
        if (!job) {
            throw new AtomSchedulerError("No job " + jobName + " created. Create the job first.")
        }
        let cancelToken: { cancel: Function } = { cancel: null };
        this.jobDefinitions.set(jobName, { func: func, data: data, cancelToken: cancelToken })
        return job;
    }
    private processJobs() {
        this.timer = setTimeout(async () => {
            if (this.started) {
                let jobName;
                if (!this.activeJob) {
                    this.activeJob = await this.dBAdapter.getNextJob(this.ID);
                }
                jobName = this.activeJob.name;
                if (this.activeJob) {
                    let jobDone: boolean = false;
                    this.doJob(this.activeJob).then((value: boolean) => {
                        console.log("Job " + jobName + " finished result: ", value);
                    }).catch(reason => {
                        console.log("Job " + jobName + " failed: ", reason);
                    }).finally(() => {
                        this.activeJob.schedulerID = null;
                        this.dBAdapter.saveJob(this.activeJob);
                        this.activeJob = null;
                    });
                }
            }
        }, 60 * 1000);
    }
    start() {
        if (!this.started) {
            this.started = true;
            this.processJobs();
        }
    }
    private async doJob(job: AtomJob): Promise<boolean> {
        return this.activeJob.perform(this.jobDefinitions.get(job.name).func, this.jobDefinitions.get(job.name).data, this.jobDefinitions.get(job.name).cancelToken);
    }
    hasStarted(): boolean {
        return this.started;
    }
    stop() {
        this.started = false;
        clearTimeout(this.timer);
    }
}