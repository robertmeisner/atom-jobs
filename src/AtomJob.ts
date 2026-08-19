import { AtomSchedulerError } from "./AtomSchedulerError";
//import { date } from "date.js"; 
var chrono = require('chrono-node');

export enum AtomJobStatus {
    Stopped = "Stopped",
    Finished = "Finished",
    Failed = "Failed",
    Pending = "Pending",
    Queued = "Queued",
    Waiting = "Waiting",
    Timeout = "Timeout"
}
export enum AtomJobDateMode {
    AfterStarted = "AfterStarted",
    AfterFinished = "AfterFinished"
}

export interface AtomJobOptions {
    isRecurring?: boolean;
    dateMode?: AtomJobDateMode;
    timeout?: number;
}

export interface AtomJobCancellationToken {
    cancel: () => void;
}

const promiseTimeout = function (ms: number, promise: Promise<any>): Promise<any> {
    if (!ms || ms <= 0) {
        return promise;
    }
    let timeoutId;
    const timeout = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new AtomSchedulerError('Timed out in ' + ms + 'ms.'));
        }, ms);
    });

    return Promise.race([promise, timeout]).then(
        (result) => {
            clearTimeout(timeoutId);
            return result;
        },
        (error) => {
            clearTimeout(timeoutId);
            throw error;
        }
    );
}

export class AtomJob {
    public name: string;
    public status: AtomJobStatus;
    public plannedOn: Date;
    public plannedString: string;
    public started?: Date;
    public finished?: Date;
    public timeElapsed: number;
    public previousStatus?: AtomJobStatus;
    public previouslyStarted?: Date;
    public previousTimeElapsed?: number;
    public lastErrorJSON?: string;
    public schedulerID?: string;
    public timeout: number = 10 * 60 * 1000;
    public isRecurring = true;
    public dateMode: AtomJobDateMode;
    public metadata = "{}";
    /**
     * AtomJob objects hold information about Scheduled Job state.
     * @param name 
     * @param when 
     * @param metadataObject 
     * @param options 
     */
    constructor(name: string, when: string, metadataObject: object = {}, options: AtomJobOptions = {}) {
        this.name = name;
        this.plannedString = when;
        this.status = AtomJobStatus.Waiting;
        this.dateMode = options.dateMode || AtomJobDateMode.AfterStarted;
        this.isRecurring = options.isRecurring === undefined ? true : options.isRecurring;
        this.timeout = options.timeout === undefined ? this.timeout : options.timeout;
        this.metadataObject = metadataObject;
        this.refreshPlannedOn();
    }

    public refreshPlannedOn(referenceDate?: Date): Date {
        const baseDate = referenceDate || (this.dateMode === AtomJobDateMode.AfterFinished ? this.finished : this.started) || new Date();
        const parsedDate = chrono.parseDate(this.plannedString, baseDate, { forwardDate: true });
        if (!parsedDate) {
            throw new AtomSchedulerError("Unable to parse planned date '" + this.plannedString + "' for job " + this.name + ".");
        }
        this.plannedOn = parsedDate;
        return this.plannedOn;
    }

    async perform(func: (job: AtomJob, data?: object, cancelToken?: AtomJobCancellationToken) => Promise<any>, data: object = {}, cancelToken: AtomJobCancellationToken = { cancel: () => undefined }): Promise<any> {
        if (!this.couldRun()) {
            throw new AtomSchedulerError("Job " + this.name + " shouldn't run. It's status is: " + this.status + " and plannedOn: " + this.plannedOn);
        }

        this.status = AtomJobStatus.Pending;
        this.started = new Date();
        this.timeElapsed = 0;

        try {
            const response = await promiseTimeout(this.timeout, Promise.resolve().then(() => func(this, data, cancelToken)));
            this.status = AtomJobStatus.Finished;
            return response;
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            if (message.startsWith("Timed")) {
                this.status = AtomJobStatus.Timeout;
            } else if (message.startsWith("Stopped")) {
                this.status = AtomJobStatus.Stopped;
            } else {
                this.status = AtomJobStatus.Failed;
            }
            this.lastErrorJSON = JSON.stringify(error);
            throw error;
        } finally {
            this.finished = new Date();
            if (this.isRecurring) {
                this.refreshPlannedOn();
            }
            this.timeElapsed = this.finished.getTime() - this.started.getTime();
        }
    }

    public static create(data: any): AtomJob {
        const plannedString = data.plannedString || data.planString || "now";
        const job = new AtomJob(data.name, plannedString, {}, {
            isRecurring: data.isRecurring,
            dateMode: data.dateMode,
            timeout: data.timeout
        });

        Object.keys(data).forEach((key) => {
            job[key] = data[key];
        });

        if (job.started && !(job.started instanceof Date)) {
            job.started = new Date(job.started);
        }
        if (job.finished && !(job.finished instanceof Date)) {
            job.finished = new Date(job.finished);
        }
        if (job.plannedOn && !(job.plannedOn instanceof Date)) {
            job.plannedOn = new Date(job.plannedOn);
        }
        if (!job.plannedOn) {
            job.refreshPlannedOn();
        }
        return job;
    }

    public canBeNext() {
        return (this.couldRun() && !this.schedulerID);
    }

    public couldRun() {
        const runnableStatuses = [AtomJobStatus.Failed, AtomJobStatus.Stopped, AtomJobStatus.Timeout, AtomJobStatus.Waiting];
        if (this.isRecurring) {
            runnableStatuses.push(AtomJobStatus.Finished);
        }
        return runnableStatuses.includes(this.status) && this.plannedOn <= new Date();
    }
    public get metadataObject(): object {
        if (!this.metadata) {
            return {};
        }
        try {
            return JSON.parse(this.metadata);
        } catch (error) {
            throw new AtomSchedulerError("Job " + this.name + " has invalid metadata JSON.");
        }
    }

    public set metadataObject(v: object) {
        this.metadata = JSON.stringify(v || {});
    }

    public toJSON(): object {
        return {
            name: this.name,
            status: this.status,
            plannedOn: this.plannedOn,
            plannedString: this.plannedString,
            started: this.started,
            finished: this.finished,
            timeElapsed: this.timeElapsed,
            previousStatus: this.previousStatus,
            previouslyStarted: this.previouslyStarted,
            previousTimeElapsed: this.previousTimeElapsed,
            lastErrorJSON: this.lastErrorJSON,
            schedulerID: this.schedulerID,
            timeout: this.timeout,
            isRecurring: this.isRecurring,
            dateMode: this.dateMode,
            metadata: this.metadata
        };
    }
}