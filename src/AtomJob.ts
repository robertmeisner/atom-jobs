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
    public finished: Date;
    public timeElapsed: number;
    public previousStatus?: AtomJobStatus;
    public previouslyStarted?: Date;
    public previousTimeElapsed?: number;
    public lastErrorJSON?: string;
    public schedulerID?: string;
    public timeout: number = 10 * 60 * 1000; 
    public isRecurring = true;
    public metadata:string;





    constructor(name: string, when: string, isRecurring: boolean = true) {
        this.name = name;
        this.plannedString = when;
        this.refreshPlannedOn();
        this.isRecurring = isRecurring;
        this.status = AtomJobStatus.Waiting;
    }
    private refreshPlannedOn() {
        this.plannedOn = chrono.parseDate(this.plannedString, this.started);
    }
    async perform(func: (job: AtomJob, data?: object, cancelTocken?: { cancel: Function }) => Promise<boolean>, data: object, cancelToken: { cancel: Function }): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (this.couldRun()) {
                this.status = AtomJobStatus.Pending;
                this.started = new Date();
                this.timeElapsed = 0;
                var startTime = new Date();
                let doIt = promiseTimeout(this.timeout, func(this, data, cancelToken))
                    .then(response => {// Wait for the promise to get resolved
                        this.status = AtomJobStatus.Finished;
                        resolve(response);
                    })
                    .catch((error: Error) => {
                        if (error.message.startsWith("Timed")) {
                            this.status = AtomJobStatus.Timeout;
                        } else if (error.message.startsWith("Stopped")) {
                            this.status = AtomJobStatus.Stopped;
                        } else {
                            this.status = AtomJobStatus.Failed;
                        }
                        this.lastErrorJSON = JSON.stringify(error);
                        reject(error);
                    }).finally(() => {
                        this.finished = new Date();
                        this.refreshPlannedOn();
                        this.timeElapsed = this.finished.getTime() - this.started.getTime();
                    });
            } else {
                reject(new AtomSchedulerError("Job " + this.name + " shouldn't run. It's status is: " + this.status+" and plannedOn: "+this.plannedOn));
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
    public canBeNext() {
        return (this.couldRun() && !this.schedulerID);
    }
    public couldRun() {
        return [AtomJobStatus.Failed, AtomJobStatus.Finished, AtomJobStatus.Stopped, AtomJobStatus.Timeout, AtomJobStatus.Waiting].includes(this.status) && this.plannedOn <= new Date();
    }
    public get metadataObject() : object {
        return JSON.parse(this.metadata);
    }
    
    public set metadataObject(v : object){
        this.metadata = JSON.stringify(v);
    }
}