import { AtomDBAdapter, AtomJobCondition } from '../AtomDBAdapter';
import { AtomJob } from '../AtomJob';
import { AtomSchedulerError } from '../AtomSchedulerError';
import { Model } from 'objection';
// run the following command to install:
// npm install objection knex sqlite3
// import Knex from 'knex'
const Knex = require('knex');


// Person model.
class AtomJobModel extends Model {
    static get tableName() {
        return 'atom_jobs';
    }
}

export class AtomMySQLAdapter implements AtomDBAdapter {
    private knex: any;

    constructor(connection: object) {
        this.knex = Knex(connection);
        Model.knex(this.knex);
    }

    private mapToJob(data: any): AtomJob {
        const normalized = data && typeof data.toJSON === "function"
            ? data.toJSON()
            : Object.assign({}, data);

        if (normalized.retry && typeof normalized.retry === "string") {
            try {
                normalized.retry = JSON.parse(normalized.retry);
            } catch (error) {
                throw new AtomSchedulerError("Job " + normalized.name + " has invalid retry JSON.");
            }
        }

        return AtomJob.create(normalized);
    }

    private toPersistence(job: AtomJob | any): any {
        const persistedJob = AtomJob.create(job);
        const data: any = persistedJob.toJSON();
        data.retry = persistedJob.retry ? JSON.stringify(persistedJob.retry) : null;
        return data;
    }

    private toPatch(job: AtomJob | any): any {
        const patch = Object.assign({}, job);
        if (patch.retry !== undefined && patch.retry !== null && typeof patch.retry !== "string") {
            patch.retry = JSON.stringify(patch.retry);
        }
        return patch;
    }

    async saveJob(job: AtomJob | any): Promise<AtomJob> {
        const persistedJob = this.toPersistence(job);
        const results = await AtomJobModel.query().insert(persistedJob as Partial<AtomJobModel>);
        if (!results) {
            throw new AtomSchedulerError("Error saving job: " + persistedJob.name);
        }

        const storedJob = await this.getJob(persistedJob.name);
        if (!storedJob) {
            throw new AtomSchedulerError("Error saving job: " + persistedJob.name);
        }
        return storedJob;
    }

    async updateJob(job: AtomJob | any): Promise<AtomJob> {
        if (!job || !job.name) {
            throw new AtomSchedulerError("You can update only existing job. Missing job name.");
        }
        const existingJob = await this.getJob(job.name);
        if (!existingJob) {
            throw new AtomSchedulerError("You can update only existing job. " + job.name + " doesn't exist.");
        }

        const patch = this.toPatch(job);
        const numUpdated = await AtomJobModel.query().patch(patch as Partial<AtomJobModel>).where('name', job.name).limit(1);
        if (!numUpdated) {
            throw new AtomSchedulerError("Error updating job: " + job.name);
        }

        const updatedJob = await this.getJob(job.name);
        if (!updatedJob) {
            throw new AtomSchedulerError("Error updating job: " + job.name);
        }
        return updatedJob;
    }

    async deleteJob(jobName: string, force?: boolean): Promise<boolean> {
        const jobExists = await this.getJob(jobName);
        if (!jobExists) {
            return Promise.resolve(false);
        }

        if (!force) {
            return Promise.resolve(Boolean(await AtomJobModel.query().delete().whereNull('schedulerID').where('name', jobName).limit(1)));
        }
        return Promise.resolve(Boolean(await AtomJobModel.query().delete().where('name', jobName).limit(1)));
    }

    async getJob(jobName: string): Promise<AtomJob | undefined> {
        const result = await AtomJobModel.query().where('name', jobName).limit(1).first();
        if (!result) {
            return undefined;
        }
        return this.mapToJob(result);
    }

    async getAllJobs(conditions?: AtomJobCondition[]): Promise<AtomJob[]> {
        return AtomJobModel.query()
            .where((builder) => {
                if (conditions) {
                    conditions.forEach(condition => {
                        if (condition.operator) {
                            builder = builder.where(condition.field, condition.operator, condition.value);
                        } else {
                            builder = builder.where(condition.field, condition.value);
                        }
                    });
                }
                return builder;
            })
            .then((results) => {
                return Promise.resolve(results.map((value) => this.mapToJob(value)));
            })
            .catch((err) => {
                throw err;
            });
    }

}