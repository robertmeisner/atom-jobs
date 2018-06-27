import { AtomDBAdapter } from "./AtomDBAdapter";
import { AtomSchedulerError } from "./AtomSchedulerError";
//import { date } from "date.js"; 
var date = require("date.js");
export enum AtomJobStatus {
    Stopped = "Stopped",
    Finished = "Finished",
    Failed = "Failed",
    Pending = "Pending",
    Queued = "Queued",
    Waiting = "Waiting",
    Timeout = "Timeout"
}
const promiseTimeout = function (ms, promise): Promise<any> {

    // Create a promise that rejects in <ms> milliseconds
    // Returns a race between our timeout and the passed in promise
    return Promise.race([
        promise,
        (() => {
            return new Promise((resolve, reject) => {
                let id = setTimeout(() => {
                    clearTimeout(id);
                    reject(new AtomSchedulerError('Timed out in ' + ms + 'ms.'))
                }, ms)
            })
        })()
    ]);
}

export class AtomJob {
    public name: string;
    public status: AtomJobStatus;
    public plannedOn: Date;
    public plannedString: string;
    public started: Date;
    public timeElapsed: number;
    public previousStatus?: AtomJobStatus;
    public previouslyStarted?: Date;
    public previousTimeElapsed?: number;
    public lastErrorJSON?: string;
    public schedulerID?: string;
    public timeout: number = 10 * 60 * 1000;
    public isRecurring = true;
    private dBAdapter: AtomDBAdapter;


    constructor(name: string, when: string, isRecurring: boolean = true) {
        this.name = name;
        this.plannedString = when;
        this.plannedOn = date(this.plannedString);
        this.isRecurring = isRecurring;
        this.status = AtomJobStatus.Waiting;
    }
    async perform(func: (job: AtomJob, data?: object, cancelTocken?: { cancel: Function }) => Promise<boolean>, data: object, cancelToken: { cancel: Function }): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (this.shouldRun()) {
                this.status = AtomJobStatus.Pending;
                this.started = new Date();
                this.timeElapsed = 0;
                var startTime = Date.now();
                let doIt = promiseTimeout(this.timeout, func(this, data, cancelToken))
                    .then(response => {// Wait for the promise to get resolved
                        this.timeElapsed = Date.now() - startTime;
                        this.status = AtomJobStatus.Finished;
                        resolve(response);
                    })
                    .catch((error: Error) => {
                        this.timeElapsed = Date.now() - startTime;
                        if (error.message.startsWith("Timed")) {
                            this.status = AtomJobStatus.Timeout;
                        } else if (error.message.startsWith("Stopped")) {
                            this.status = AtomJobStatus.Stopped;
                        } else {
                            this.status = AtomJobStatus.Failed;
                        }
                        this.lastErrorJSON = JSON.stringify(error);
                        reject(error);
                    });
            } else {
                reject(new AtomSchedulerError("Job " + this.name + " shouldn't run. It's status is: " + this.status));
            }
        });

    }


    public static create(data: object): AtomJob {

        let job = new AtomJob(data['name'], data['planString']);
        for (var key in data) {
            // skip loop if the property is from prototype
            if (!data.hasOwnProperty(key)) continue;
            job[key] = data[key];
        }
        return job;

    }


    private shouldRun() {
        if (this.status === AtomJobStatus.Waiting || this.status === AtomJobStatus.Finished) {
            return true;
        } else {
            return false;
        }
    }
}