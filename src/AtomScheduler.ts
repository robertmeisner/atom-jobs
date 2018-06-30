import { AtomDBAdapter } from "./AtomDBAdapter";
import { AtomJob } from "./AtomJob";
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
     * //TODO pobieranie i nadpisywanie zablokowanych???????
     * 
     * @param jobName 
     * @param func 
     */
    async createJob(jobName, when: string, func?: (job: AtomJob, data?: {}, cancelTocken?: { cancel: Function }) => Promise<boolean>, data?: object) {
        let job: AtomJob = new AtomJob(jobName, when);
        job = await this.dBAdapter.saveJob(job);
        if (func || data)
            job = await this.defineJob(jobName, func, data);
        return job;
    }
    async defineJob(jobName: string, func?: (job: AtomJob, data?: any, cancelTocken?: { cancel: Function }) => Promise<boolean>, data?: object): Promise<AtomJob> {
        let job: AtomJob = await this.dBAdapter.getJob(jobName);
        if (!job) {
            throw new AtomSchedulerError("Job " + jobName + " could not be defined. Create the job first.")
        }
        let cancelToken: { cancel: Function } = {
            cancel: () => {
                throw new AtomSchedulerError("Stopped Job " + job.name);
            }
        };
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
    async isJobLocked(jobName: string): Promise<boolean> {
        return this.dBAdapter.getJob(jobName)
            .then((job) => {
                return Boolean(job.schedulerID);
            })
            .catch((err) => {
                throw err;
            });
    }
    async unlockJob(jobName: string): Promise<boolean> {
        return await this.dBAdapter.updateJob({ name: jobName, schedulerID: null })
            .then((job) => {
                return Promise.resolve(Boolean(job));
            })
            .catch((err) => {
                throw err;
            });

    }
    async lockJob(jobName: string, schedulerID: string): Promise<boolean> {
        console.log(this.dBAdapter.updateJob({ name: jobName, schedulerID: schedulerID }));
        return this.dBAdapter.updateJob({ name: jobName, schedulerID: schedulerID })
            .then((job) => {
                return Promise.resolve(Boolean(job));
            })
            .catch((err) => {
                throw err;
            });
    }
    async jobExists(jobName: string): Promise<boolean> {
        return (this.dBAdapter.getJob(jobName))
            .then((job) => {
                return Promise.resolve(Boolean(job));
            })
            .catch((err) => {
                throw err;
            });
    }
    async getJob(jobName: string): Promise<AtomJob> {
        return this.dBAdapter.getJob(jobName);
    }
    async getAllJobs(): Promise<AtomJob[]> {
        return this.dBAdapter.getAllJobs();
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