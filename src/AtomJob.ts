import { AtomSchedulerError } from "./AtomSchedulerError";
var chrono = require("chrono-node");

const serializeError = (error: any): string => {
    if (error instanceof Error) {
        const serialized: any = {
            name: error.name,
            message: error.message,
            stack: error.stack
        };
        Object.keys(error).forEach((key) => {
            serialized[key] = error[key];
        });
        try {
            return JSON.stringify(serialized);
        } catch (serializationError) {
            return JSON.stringify({ name: error.name, message: error.message });
        }
    }

    try {
        const serialized = JSON.stringify(error);
        return serialized === undefined ? JSON.stringify(String(error)) : serialized;
    } catch (serializationError) {
        return JSON.stringify({ name: "Error", message: String(error) });
    }
};

const MAX_RETRY_ATTEMPTS = 100;
const MAX_RETRY_BACKOFF = 60 * 60 * 1000;

export interface AtomJobRetryOptions {
    maxAttempts?: number;
    backoff?: number;
}

const normalizeRetryOptions = (retry?: AtomJobRetryOptions): AtomJobRetryOptions | undefined => {
    if (!retry) {
        return undefined;
    }

    const maxAttempts = retry.maxAttempts === undefined ? 1 : retry.maxAttempts;
    const backoff = retry.backoff === undefined ? 0 : retry.backoff;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_RETRY_ATTEMPTS) {
        throw new AtomSchedulerError("Retry maxAttempts must be an integer between 1 and " + MAX_RETRY_ATTEMPTS + ".");
    }
    if (typeof backoff !== "number" || !isFinite(backoff) || backoff < 0 || backoff > MAX_RETRY_BACKOFF) {
        throw new AtomSchedulerError("Retry backoff must be between 0 and " + MAX_RETRY_BACKOFF + " milliseconds.");
    }

    return { maxAttempts, backoff };
};

const waitForRetry = (ms: number, cancelToken: AtomJobCancellationToken): Promise<void> => {
    if (ms <= 0) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
        let timer: any;
        let cancel: () => void;
        const previousCancel = cancelToken.cancel;
        const restore = () => {
            if (cancelToken.cancel === cancel) {
                cancelToken.cancel = previousCancel;
            }
        };

        cancel = () => {
            clearTimeout(timer);
            restore();
            reject(new AtomSchedulerError("Stopped by user."));
        };
        cancelToken.cancel = cancel;
        timer = setTimeout(() => {
            restore();
            resolve();
        }, ms);
    });
};

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
    retry?: AtomJobRetryOptions;
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
};

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
    public retry?: AtomJobRetryOptions;
    public attempts = 0;
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
        this.retry = normalizeRetryOptions(options.retry);
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

        const maxAttempts = this.retry ? this.retry.maxAttempts : 1;
        this.started = new Date();
        this.timeElapsed = 0;
        this.attempts = 0;

        try {
            while (this.attempts < maxAttempts) {
                this.attempts++;
                this.status = AtomJobStatus.Pending;

                try {
                    const response = await promiseTimeout(this.timeout, Promise.resolve().then(() => func(this, data, cancelToken)));
                    this.status = AtomJobStatus.Finished;
                    return response;
                } catch (error) {
                    const message = error && error.message ? error.message : String(error);
                    if (message.startsWith("Timed")) {
                        try {
                            cancelToken.cancel();
                        } catch (cancelError) {
                            // Preserve the timeout when cooperative cancellation fails.
                        }
                        this.status = AtomJobStatus.Timeout;
                    } else if (message.startsWith("Stopped")) {
                        this.status = AtomJobStatus.Stopped;
                    } else {
                        this.status = AtomJobStatus.Failed;
                    }
                    this.lastErrorJSON = serializeError(error);

                    if (this.status !== AtomJobStatus.Failed || this.attempts >= maxAttempts) {
                        throw error;
                    }

                    this.status = AtomJobStatus.Pending;
                    try {
                        await waitForRetry(this.retry.backoff * this.attempts, cancelToken);
                    } catch (retryError) {
                        this.status = AtomJobStatus.Stopped;
                        this.lastErrorJSON = serializeError(retryError);
                        throw retryError;
                    }
                }
            }
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
            timeout: data.timeout,
            retry: data.retry
        });

        Object.keys(data).forEach((key) => {
            job[key] = data[key];
        });

        if (job.retry) {
            job.retry = normalizeRetryOptions(job.retry);
        }
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
            metadata: this.metadata,
            retry: this.retry,
            attempts: this.attempts
        };
    }
}