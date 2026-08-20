import { AtomDBAdapter, AtomJobCondition } from "./AtomDBAdapter";
import { AtomJob, AtomJobCancellationToken, AtomJobOptions, AtomJobStatus } from "./AtomJob";
import { AtomSchedulerError } from "./AtomSchedulerError";
import { AtomSchedulerEvent } from "./AtomEvent";

var crypto = require('crypto');

export interface AtomSchedulerOptions {
    verbose?: boolean;
    tickTime?: number;
    id?: string;
}

export type AtomJobHandler = (job: AtomJob, data?: any, cancelToken?: AtomJobCancellationToken) => Promise<any>;

interface AtomJobDefinition {
    func: AtomJobHandler;
    data: object;
    cancelToken: AtomJobCancellationToken;
}

export class AtomScheduler {
    constructor(db: AtomDBAdapter, verboseOrOptions?: boolean | AtomSchedulerOptions) {
        this.dBAdapter = db;
        let options: AtomSchedulerOptions = {};
        if (typeof verboseOrOptions === "boolean") {
            options.verbose = verboseOrOptions;
        } else {
            options = verboseOrOptions || {};
        }

        this.verbose = options.verbose || false;
        this.tickTime = options.tickTime || this.tickTime;
        this.ID = options.id || AtomScheduler.createID();
    }
    private static createID(): string {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }

        const buffer = new Uint8Array(16);
        crypto.randomFillSync(buffer);
        return Array.from(buffer).map((value: number) => value.toString(16).padStart(2, "0")).join("");
    }

    public ID: string;
    public jobDefinitions: Map<string, AtomJobDefinition> = new Map();
    public activeJob?: AtomJob;
    public activeJobDoPromise?: Promise<any>;
    public tickTime = 10 * 1000;
    private verbose: boolean;
    private dBAdapter: AtomDBAdapter;
    private started = false;
    private timer: any;
    private processingTick = false;
    private activeJobFinalization?: Promise<void>;
    private static instance: AtomScheduler;

    /// EVENTS
    private _jobFinished = new AtomSchedulerEvent<AtomJob>();
    public get jobFinished(): AtomSchedulerEvent<AtomJob> {
        return this._jobFinished;
    }
    private _jobStarted = new AtomSchedulerEvent<AtomJob>();
    public get jobStarted(): AtomSchedulerEvent<AtomJob> {
        return this._jobStarted;
    }
    private _ticked = new AtomSchedulerEvent<void>();
    public get ticked(): AtomSchedulerEvent<void> {
        return this._ticked;
    }

    private verboseLog(message: string, job?: AtomJob): void {
        if (this.verbose) {
            const timestamp = new Date().toISOString();
            const jobInfo = job ? ` [Job: ${job.name}]` : '';
            console.log(`[AtomScheduler ${timestamp}]${jobInfo} ${message}`);
        }
    }

    /**
     * Creates and persists job if it doesn't exist
     * @param job 
     */
    async createJob(job: AtomJob | object);
    /**
     * Creates and persists job if it doesn't exist
     * @param jobName
     * @param when
     * @param metadata
     */
    async createJob(jobName: string, when?: string, metadata?: object): Promise<AtomJob>;
    async createJob(jobName: string, when?: string, metadata?: object, options?: AtomJobOptions): Promise<AtomJob>;
    /**
     * Creates and persists job if it doesn't exist
     * @param jobName
     * @param when
     * @param metadata
     */
    async createJob(jobName: string | AtomJob | object, when?: string, metadata?: object, options?: AtomJobOptions): Promise<AtomJob> {
        let job: AtomJob;
        if (typeof jobName === "string") {
            if (!when) {
                throw new AtomSchedulerError("When value is required for job " + jobName + ".");
            }
            job = new AtomJob(jobName, when, metadata || {}, options);
        } else if (jobName instanceof AtomJob) {
            job = jobName;
        } else {
            job = AtomJob.create(jobName);
        }

        if (!await this.jobExists(job.name)) {
            job = await this.dBAdapter.saveJob(job);
        }
        const storedJob = await this.getJob(job.name);
        if (!storedJob) {
            throw new AtomSchedulerError("Job " + job.name + " could not be loaded after creation.");
        }
        return storedJob;
    }

    async scheduleJob(jobName: string, when: string, metadata?: object, options?: AtomJobOptions): Promise<AtomJob> {
        return this.createJob(jobName, when, metadata, options);
    }

    /**
     * Updates job using DBAdapter.
     * Properties 'schedulerID', 'status','started','finished','timeElapsed' are not saved by default.
     * Use forceProperties to save them.
     * @param {Object} job - Job data. AtomJob or POJsO.
     * @param {boolean} forceProperties - Forces update to include all properties. 
     */
    async updateJob(job: AtomJob | object, forceProperties?: boolean) {
        const skipFields = ['schedulerID', 'status', 'started', 'finished', 'timeElapsed'];
        const jobToUpdate = Object.assign({}, job);
        if (!forceProperties) {
            skipFields.forEach((field) => {
                delete jobToUpdate[field];
            });
        }
        return this.dBAdapter.updateJob(jobToUpdate);
    }

    async defineJob(jobName: string, func?: AtomJobHandler, data?: object): Promise<AtomJob> {
        return this.registerJob(jobName, func, data);
    }

    async registerJob(jobName: string, func?: AtomJobHandler, data?: object): Promise<AtomJob> {
        if (!func) {
            throw new AtomSchedulerError("Job " + jobName + " could not be defined. Missing handler.");
        }

        return this.dBAdapter.getJob(jobName)
            .then((job) => {
                if (!job) {
                    throw new AtomSchedulerError("Job " + jobName + " could not be defined. Create the job first.");
                }

                const cancelToken: AtomJobCancellationToken = {
                    cancel: () => undefined
                };
                this.jobDefinitions.set(jobName, { func, data: data || {}, cancelToken });
                return Promise.resolve(job);
            })
            .catch((err) => {
                throw err;
            });
    }

    hasDefinition(jobName: string): boolean {
        return this.jobDefinitions.has(jobName);
    }

    async isJobLocked(jobName: string): Promise<boolean> {
        return this.dBAdapter.getJob(jobName)
            .then((job) => {
                return Promise.resolve(Boolean(job && job.schedulerID));
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
    async getJob(jobName: string): Promise<AtomJob | undefined> {
        return this.dBAdapter.getJob(jobName);
    }

    async getNextJob(): Promise<AtomJob | undefined> {
        const jobs = (await this.getAllJobs()).sort((jobA, jobB) => {
            const dateA = jobA.plannedOn ? new Date(jobA.plannedOn).getTime() : 0;
            const dateB = jobB.plannedOn ? new Date(jobB.plannedOn).getTime() : 0;
            return dateA - dateB;
        });

        for (let index = 0; index < jobs.length; index++) {
            const job = jobs[index];
            if (job.canBeNext() && this.jobDefinitions.has(job.name)) {
                await this.lockJob(job.name);
                return this.getJob(job.name)
                    .then((lockedJob) => {
                        if (lockedJob && lockedJob.schedulerID === this.ID) {
                            return Promise.resolve(lockedJob);
                        }
                        return Promise.resolve(undefined);
                    })
                    .catch((err) => {
                        throw err;
                    });
            }
        }
        return Promise.resolve(undefined);
    }
    async getAllJobs(flag?: string): Promise<AtomJob[]>;
    async getAllJobs(jobConditions?: AtomJobCondition[]): Promise<AtomJob[]>;
    async getAllJobs(jobConditions?: string | AtomJobCondition[]): Promise<AtomJob[]> {
        let conditions: AtomJobCondition[] = [];
        if (typeof jobConditions === 'string') {
            conditions.push({ field: 'name', operator: 'like', value: jobConditions + ':%' });
        } else {
            conditions = jobConditions;
        }
        return this.dBAdapter.getAllJobs(conditions);
    }

    async listJobs(jobConditions?: string | AtomJobCondition[]): Promise<AtomJob[]> {
        if (typeof jobConditions === "string") {
            return this.getAllJobs(jobConditions);
        }
        return this.getAllJobs(jobConditions || []);
    }

    async removeJob(jobName: string, force?: boolean): Promise<boolean> {
        return this.dBAdapter.deleteJob(jobName, force);
    }

    private processJobs() {
        this.timer = setInterval(() => {
            this.tick().catch((error) => {
                this.verboseLog("Tick failed: " + error);
            });
        }, this.tickTime);

    }

    async tick(): Promise<void> {
        if (!this.started || this.activeJob || this.processingTick) {
            return;
        }

        this.processingTick = true;
        this.ticked.trigger();
        this.verboseLog("Looking for jobs to run (scheduler tick)");

        try {
            const nextJob = await this.getNextJob();
            if (!this.started) {
                if (nextJob && nextJob.schedulerID === this.ID) {
                    await this.unlockJob(nextJob.name);
                }
                return;
            }
            if (!nextJob) {
                return;
            }

            this.activeJob = nextJob;
            this.verboseLog("Starting job", this.activeJob);
            this.jobStarted.trigger(this.activeJob);
            this.activeJobDoPromise = this.doJob(this.activeJob);

            try {
                await this.activeJobDoPromise;
                this.verboseLog("Job completed successfully", this.activeJob);
            } catch (error) {
                this.verboseLog("Job failed with error: " + error, this.activeJob);
            } finally {
                this.activeJobFinalization = this.afterJobFinished();
                await this.activeJobFinalization;
                this.activeJobFinalization = undefined;
            }
        } finally {
            this.processingTick = false;
        }
    }

    start() {
        if (this.started) {
            return;
        }
        this.started = true;
        this.verboseLog("Scheduler started");
        this.processJobs();
        this.tick().catch((error) => {
            this.verboseLog("Initial tick failed: " + error);
        });
    }

    async afterJobFinished() {
        const job = this.activeJob;
        this.verboseLog("Job finished", job);
        this.activeJob = undefined;
        this.activeJobDoPromise = undefined;
        if (!job) {
            return;
        }

        this.jobFinished.trigger(job);
        await this.updateJob(job, true);
        await this.unlockJob(job.name);
    }

    async stop() {
        if (!this.started) {
            return;
        }

        this.verboseLog("Scheduler stopping");
        this.started = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }

        if (this.activeJob && this.activeJob.status === AtomJobStatus.Pending && this.jobDefinitions.has(this.activeJob.name)) {
            try {
                this.jobDefinitions.get(this.activeJob.name).cancelToken.cancel();
            } catch (error) {
                this.verboseLog("Cancel handler threw during stop for " + this.activeJob.name + ": " + error, this.activeJob);
            }
        }

        if (this.activeJobDoPromise) {
            try {
                await this.activeJobDoPromise;
            } catch (error) {
                this.verboseLog("Active job completed with error during stop: " + error);
            }
        }

        if (this.activeJobFinalization) {
            await this.activeJobFinalization;
            this.activeJobFinalization = undefined;
        }

        if (this.activeJob) {
            return this.afterJobFinished();
        }
    }

    private async doJob(job: AtomJob): Promise<any> {
        if (!this.jobDefinitions.has(job.name)) {
            throw new AtomSchedulerError("Job " + job.name + " has no definition.");
        }

        const definition = this.jobDefinitions.get(job.name);
        return job.perform(definition.func, definition.data, definition.cancelToken);
    }

    hasStarted(): boolean {
        return this.started;
    }

    static getInstance(db?: AtomDBAdapter, verboseOrOptions?: boolean | AtomSchedulerOptions) {
        if (!AtomScheduler.instance) {
            if (!db) {
                throw new AtomSchedulerError("Initialize scheduler with storage config data first.");
            }
            AtomScheduler.instance = new AtomScheduler(db, verboseOrOptions);
        }
        return AtomScheduler.instance;
    }

}
