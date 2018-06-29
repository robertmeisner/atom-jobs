import { RowDataPacket, createPool, OkPacket } from 'mysql';
import { AtomDBAdapter } from '../AtomDBAdapter';
import { AtomJob } from '../AtomJob';
import { promisify } from 'util';
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
        if (await this.jobExists(job.name)) {
            throw new AtomSchedulerError("You can update only existing job. " + job.name + " doesn't exist.");
        }
        const numUpdated = await AtomJobModel.query().patch(job as Partial<AtomJobModel>)
        if (numUpdated)
            return this.getJob(job.name);
        else
            throw new AtomSchedulerError("Error updating job: " + job.name);
    }
    async deleteJob(jobName: string, force?: boolean): Promise<boolean> {
        let jobExists: AtomJob = await this.getJob(jobName);
        if (!this.jobExists(jobName)) {
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
    async isJobLocked(jobName: string): Promise<boolean> {
        let result = await AtomJobModel.query().where('name', jobName).limit(1).first();
        return Boolean(result['schedulerID']);
    }
    async unlockJob(jobName: string): Promise<boolean> {
        const numUpdated = await AtomJobModel.query().patch({ schedulerID: null } as Partial<AtomJobModel>).where('name', jobName).limit(1).first();
        return (Boolean(numUpdated));
    }
    async lockJob(jobName: string, schedulerID: string): Promise<boolean> {
        const numUpdated = await AtomJobModel.query().patch({ schedulerID: schedulerID } as Partial<AtomJobModel>).where('name', jobName).whereNull("schedulerID").limit(1).first();
        return (Boolean(numUpdated));

    }
    async jobExists(jobName: string): Promise<boolean> {
        return (Boolean(await AtomJobModel.query().where('name', jobName).limit(1).first()));
    }
    async getJob(jobName: string): Promise<AtomJob> {
        let result = await AtomJobModel.query().where('name', jobName).limit(1).first();
        if (result) {
            return AtomJob.create(result);
        }
        return null;
    }
    async getNextJob(schedulerID: string): Promise<AtomJob> {
        let job: AtomJob;
        //update next job which needs to be executed and is free with schedulerId
        const numUpdated = await AtomJobModel.query()
            .patch({ schedulerID: schedulerID } as Partial<AtomJobModel>)
            .where('plannedOn', '>=', new Date().toISOString()).whereNull('schedulerId').whereNotNull('plannedOn').limit(1).first();
        if (numUpdated) {
            return AtomJob.create(await AtomJobModel.query().where('schedulerID', schedulerID).limit(1).first());
        }
        return null;
    }
    async getAllJobs(): Promise<AtomJob[]> {
        let results = await AtomJobModel.query();
        let jobs: AtomJob[] = [];
        results.forEach((value, index) => {
            jobs.push(AtomJob.create(value));
        });
        return jobs;
    }

}
