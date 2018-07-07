import { AtomDBAdapter } from "./AtomDBAdapter";
import { AtomJob, AtomJobStatus } from "./AtomJob";
import { AtomSchedulerError } from "./AtomSchedulerError";
var crypto = require('crypto');
export class AtomScheduler {
    constructor(db: AtomDBAdapter) {
        this.dBAdapter = db;
        this.ID = (() => {
            let array;
            if (process && (+process.version.substr(0, process.version.indexOf('.')).substr(1) >= 9)) {
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
    private jobRunning = false;
    private timer;
    private static instance: AtomScheduler;

    async createJob(job: AtomJob | object);
    async createJob(jobName: string, when?: string, metadata?: object): Promise<AtomJob>;
    async createJob(jobName: string | AtomJob | object, when?: string, metadata?: object): Promise<AtomJob> {
        let job: AtomJob;
        if (typeof jobName !== 'string') {
            job = <AtomJob>jobName;
        } else {
            job = new AtomJob(<string>jobName, when);
        }
        if (!await this.jobExists(job.name))
            job = await this.dBAdapter.saveJob(job);
        return this.getJob(job.name);
    }
    /**
     * Updates job using DBAdapter.
     * Properties 'schedulerID', 'status','started','finished','timeElapsed' are not saved by default.
     * Use forceProperties to save them.
     * @param {Object} job - Job data. AtomJob or POJsO.
     * @param {boolean} forceProperties - Forces update to include all properties. 
     */
    async updateJob(job: AtomJob | object, forceProperties?: boolean) {
        let skipFields = ['schedulerID', 'status', 'started', 'finished', 'timeElapsed'];
        for (const prop in skipFields) {
            if (!forceProperties && prop in job)
                delete job[prop];
        }
        return this.dBAdapter.updateJob(job);
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
            } else {
                // skip
            }
        }
        return Promise.resolve(undefined);
    }
    async getAllJobs(jobConditions?: string): Promise<AtomJob[]>;
    async getAllJobs(jobConditions?: { field: string, operator?: string, value: string }[]): Promise<AtomJob[]>;
    async getAllJobs(jobConditions?: string | { field: string, operator?: string, value: string }[]): Promise<AtomJob[]> {
        let conditions: { field: string, operator?: string, value: string }[] = [];
        if (typeof jobConditions === 'string') {
            conditions.push({ field: 'name', operator: 'like', value: jobConditions });
        } else {
            conditions = jobConditions;
        }
        return this.dBAdapter.getAllJobs(conditions);
    }
    private processJobs() {
        this.timer = setTimeout(async () => {
            if (this.started && !this.activeJob) {
                let jobName;
                this.activeJob = await this.getNextJob();
                if (this.activeJob) {
                    jobName = this.activeJob.name;
                    this.activeJobDoPromise = this.doJob(this.activeJob);
                    this.activeJobDoPromise.then((value: boolean) => {
                        console.log("Job " + jobName + " finished result: ", value);
                    }).catch(reason => {
                        console.log("Job " + jobName + " failed: ", reason);
                    }).finally(() => {
                        this.jobFinished();
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
    async jobFinished() {
        this.jobRunning = false;
        this.updateJob(this.activeJob, true);
        await this.unlockJob(this.activeJob.name);
        this.activeJob = null;
    }
    async stop() {
        clearTimeout(this.timer);
        if (this.activeJob.status === AtomJobStatus.Pending) {
            await this.jobDefinitions.get(this.activeJob.name).cancelToken.cancel();
        }
        this.started = false;
        this.jobFinished();
    }
    private async doJob(job: AtomJob): Promise<boolean> {
        return this.activeJob.perform(this.jobDefinitions.get(job.name).func, this.jobDefinitions.get(job.name).data, this.jobDefinitions.get(job.name).cancelToken);
    }
    hasStarted(): boolean {
        return this.started;
    }
    static getInstance(db?: AtomDBAdapter) {
        if (!AtomScheduler.instance) {
            if (!db) {
                throw new AtomSchedulerError("Initialize scheduler with storage config data first.");
            }
            AtomScheduler.instance = new AtomScheduler(db);
            // ... any one time initialization goes here ...
        }
        return AtomScheduler.instance;
    }

}
