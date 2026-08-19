import { AtomDBAdapter, AtomJobCondition } from "../AtomDBAdapter";
import { AtomJob } from "../AtomJob";
import { AtomSchedulerError } from "../AtomSchedulerError";

const toComparableValue = (value: any): any => {
    if (value instanceof Date) {
        return value.getTime();
    }
    return value;
};

const conditionMatches = (job: AtomJob, condition: AtomJobCondition): boolean => {
    const left = toComparableValue(job[condition.field]);
    const right = toComparableValue(condition.value);
    const operator = (condition.operator || "=").toLowerCase();

    if (operator === "=" || operator === "==") {
        return left === right;
    }
    if (operator === "!=" || operator === "<>") {
        return left !== right;
    }
    if (operator === ">") {
        return left > right;
    }
    if (operator === ">=") {
        return left >= right;
    }
    if (operator === "<") {
        return left < right;
    }
    if (operator === "<=") {
        return left <= right;
    }
    if (operator === "like") {
        const pattern = String(condition.value)
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/%/g, ".*")
            .replace(/_/g, ".");
        const matcher = new RegExp("^" + pattern + "$");
        return matcher.test(String(job[condition.field]));
    }

    throw new AtomSchedulerError("Unsupported condition operator: " + condition.operator);
};

export class AtomInMemoryAdapter implements AtomDBAdapter {
    private jobs: Map<string, AtomJob> = new Map();

    async saveJob(job: AtomJob | any): Promise<AtomJob> {
        const nextJob = AtomJob.create(job);
        if (this.jobs.has(nextJob.name)) {
            throw new AtomSchedulerError("Error saving job: " + nextJob.name + " already exists.");
        }

        this.jobs.set(nextJob.name, AtomJob.create(nextJob));
        const savedJob = await this.getJob(nextJob.name);
        if (!savedJob) {
            throw new AtomSchedulerError("Error saving job: " + nextJob.name);
        }
        return savedJob;
    }

    async updateJob(job: AtomJob | any): Promise<AtomJob> {
        if (!job || !job.name) {
            throw new AtomSchedulerError("You can update only existing job. Missing job name.");
        }

        const currentJob = await this.getJob(job.name);
        if (!currentJob) {
            throw new AtomSchedulerError("You can update only existing job. " + job.name + " doesn't exist.");
        }

        const updatedJob = AtomJob.create(Object.assign({}, currentJob.toJSON(), job));
        this.jobs.set(updatedJob.name, updatedJob);
        const persistedJob = await this.getJob(updatedJob.name);
        if (!persistedJob) {
            throw new AtomSchedulerError("Error updating job: " + updatedJob.name);
        }
        return persistedJob;
    }

    async deleteJob(jobName: string, force?: boolean): Promise<boolean> {
        const currentJob = await this.getJob(jobName);
        if (!currentJob) {
            return false;
        }

        if (!force && currentJob.schedulerID) {
            return false;
        }

        return this.jobs.delete(jobName);
    }

    async getJob(jobName: string): Promise<AtomJob | undefined> {
        if (!this.jobs.has(jobName)) {
            return undefined;
        }

        return AtomJob.create(this.jobs.get(jobName).toJSON());
    }

    async getAllJobs(conditions?: AtomJobCondition[]): Promise<AtomJob[]> {
        let jobs = Array.from(this.jobs.values()).map((job) => AtomJob.create(job.toJSON()));
        if (!conditions || conditions.length === 0) {
            return jobs;
        }

        jobs = jobs.filter((job) => {
            for (let index = 0; index < conditions.length; index++) {
                if (!conditionMatches(job, conditions[index])) {
                    return false;
                }
            }
            return true;
        });

        return jobs;
    }
}
