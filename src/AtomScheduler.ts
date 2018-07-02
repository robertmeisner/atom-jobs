import { AtomDBAdapter } from "./AtomDBAdapter";
import { AtomJob, AtomJobStatus } from "./AtomJob";
import { AtomSchedulerError } from "./AtomSchedulerError";
var crypto = require('crypto');
export class AtomScheduler {
    constructor(db: AtomDBAdapter) {
        this.dBAdapter = db;
        this.ID = (() => {
            let array;
            if (process && (+process.version.substr(0,process.version.indexOf('.')).substr(1)>=9)) {
                array = (new Uint32Array(8)); //node 9+
            } else {
                array = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
            }
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
    public activeJob: AtomJob;
    public activeJobDoPromise: Promise<boolean>;
    private started = false;
    private timer;

    /**
    * Creates new job and persists it with DBAdapter.
    * @param jobName 
    * @param when 
    * @param func 
    * @param data 
    */
    async createJob(jobName, when: string, func?: (job: AtomJob, data?: {}, cancelTocken?: { cancel: Function }) => Promise<boolean>, data?: object) {
        let job: AtomJob = new AtomJob(jobName, when);
        job = await this.dBAdapter.saveJob(job);
        if (func || data)
            job = await this.defineJob(jobName, func, data);
        return job;
    }
    async defineJob(jobName: string, func?: (job: AtomJob, data?: any, cancelTocken?: { cancel: Function }) => Promise<boolean>, data?: object): Promise<AtomJob> {
        return this.dBAdapter.getJob(jobName)
            .then((job) => {
                if (!job) {
                    throw new AtomSchedulerError("Job " + jobName + " could not be defined. Create the job first.")
                }
                let cancelToken: { cancel: Function } = {
                    cancel: () => {
                        throw new AtomSchedulerError("Stopped Job " + job.name);
                    }
                };
                this.jobDefinitions.set(jobName, { func: func, data: data, cancelToken: cancelToken })
                return Promise.resolve((job));
            })
            .catch((err) => {
                throw err;
            });
    }
    private processJobs() {
        this.timer = setTimeout(async () => {
            if (this.started) {
                let jobName;
                if (!this.activeJob) {
                    this.activeJob = await this.getNextJob();
                }
                if (this.activeJob) {
                    jobName = this.activeJob.name;
                    let jobDone: boolean = false;
                    this.activeJobDoPromise = this.doJob(this.activeJob);
                    this.activeJobDoPromise.then((value: boolean) => {
                        console.log("Job " + jobName + " finished result: ", value);
                    }).catch(reason => {
                        console.log("Job " + jobName + " failed: ", reason);
                    }).finally(() => {
                        this.stop();
                    });
                }
            }
        }, 60 * 1000);

    }
    async isJobLocked(jobName: string): Promise<boolean> {
        return this.dBAdapter.getJob(jobName)
            .then((job) => {
                return Promise.resolve(Boolean(job.schedulerID));
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
    async lockJob(jobName: string): Promise<boolean> {
        return this.dBAdapter.updateJob({ name: jobName, schedulerID: this.ID })
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
    async getNextJob(): Promise<AtomJob> {
        let jobs: AtomJob[] = await this.getAllJobs();
        for (let index = 0; index < jobs.length; index++) {
            let job = jobs[index];
            if (job.canBeNext() && this.jobDefinitions.has(job.name)) {
                await this.lockJob(job.name);
                return this.getJob(job.name)
                    .then((job) => {
                        if (job.schedulerID == this.ID) {
                            return Promise.resolve((job));
                        } else {
                            Promise.resolve(undefined);
                        }
                    })
                    .catch((err) => {
                        throw err;
                    });
            }else{
               // skip
            }
        }
        return Promise.resolve(undefined);
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
    async stop() {
        clearTimeout(this.timer);
        if (this.activeJob.status === AtomJobStatus.Pending) {
            await this.jobDefinitions.get(this.activeJob.name).cancelToken.cancel();
        }
        this.started = false;
        this.activeJob.schedulerID = null;
        this.dBAdapter.saveJob(this.activeJob);
        await this.unlockJob(this.activeJob.name);
        this.activeJob = null;
    }
    private async doJob(job: AtomJob): Promise<boolean> {
        return this.activeJob.perform(this.jobDefinitions.get(job.name).func, this.jobDefinitions.get(job.name).data, this.jobDefinitions.get(job.name).cancelToken);
    }
    hasStarted(): boolean {
        return this.started;
    }

}
