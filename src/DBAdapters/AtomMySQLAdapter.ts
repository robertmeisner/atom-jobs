import { AtomDBAdapter } from '../AtomDBAdapter';
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
    private pool;
    constructor(connection: object) {
        // Initialize knex.
        const knex = Knex(connection);

        // Give the knex object to objection.
        Model.knex(knex);
    }
    async saveJob(job: AtomJob | any): Promise<AtomJob> {

        let jobExists: AtomJob = await this.getJob(job.name);
        if (jobExists) {
            throw new AtomSchedulerError("You can't save job if it exists. " + job.name + " already exists.");
        }
        let results = await AtomJobModel.query().insert(job as Partial<AtomJobModel>);
        if (results)
            return this.getJob(results['name']);
        throw new AtomSchedulerError("Error saving job: " + job.name);

    }

    async updateJob(job: AtomJob | any): Promise<AtomJob> {
        if (!await this.getJob(job.name)) {
            throw new AtomSchedulerError("You can update only existing job. " + job.name + " doesn't exist.");
        }
        return AtomJobModel.query().patch(job as Partial<AtomJobModel>).where('name', job.name).skipUndefined().limit(1)
            .then((numUpdated) => {
                if (numUpdated)
                    return this.getJob(job.name)
                else
                    throw new AtomSchedulerError("Error updating job: " + job.name);
            })
            .catch((err) => {
                throw err;
            });

    }
    async deleteJob(jobName: string, force?: boolean): Promise<boolean> {
        let jobExists: AtomJob = await this.getJob(jobName);
        if (!jobExists) {
            return Promise.resolve(false);
        } else {
            if (!force) {
                //should be able to delete only unlocked
                return Promise.resolve(Boolean(await AtomJobModel.query().delete().whereNull('schedulerId').where('name', jobName).limit(1)));
            } else {
                return Promise.resolve(Boolean(await AtomJobModel.query().delete().where('name', jobName).limit(1)));
            }

        }
    }

    async getJob(jobName: string): Promise<AtomJob> {
        return AtomJobModel.query().where('name', jobName).limit(1).first()
            .then((job) => {
                if (job)
                    return Promise.resolve(AtomJob.create(job));
                else
                    return Promise.resolve(undefined);
            })
            .catch((err) => {
                throw err;
            });

    }

    async getAllJobs(conditions?: { field: string, operator?: string, value: string }[]): Promise<AtomJob[]> {
        return AtomJobModel.query()
            .where(function (builder) {
                if (conditions)
                    conditions.forEach(condition => {
                        if (condition.operator) {
                            builder = builder.where(condition.field, condition.operator, condition.value);
                        } else {
                            builder = builder.where(condition.field, condition.value);
                        }
                    });
                return builder;
            })
            .then((results) => {
                let jobs: AtomJob[] = [];
                results.forEach((value, index) => {
                    jobs.push(AtomJob.create(value));
                });
                return Promise.resolve(jobs);
            })
            .catch((err) => {
                throw err;
            });

    }

}
