import { QueryError, RowDataPacket, createPool, OkPacket } from 'mysql';
import { AtomDBAdapter } from '../AtomDBAdapter';
import { AtomJob } from '../AtomJob';
import { promisify } from 'util';
import { timingSafeEqual } from 'crypto';
var mysql = require('mysql');
export class MySQLAdapter implements AtomDBAdapter {
    private pool;
    private UPDATE_INSERT_QUERY_PARTIAL = 'name=?,plannedString=?,status=?,started=?,timeElapsed=?,lastErrorJSON=?,schedulerID=?';
    constructor(connection: object) {
        if (this.pool) {
            this.pool = createPool(connection);
            this.pool.query = promisify(this.pool.query);
        }
    }
    async saveJob(job: AtomJob): Promise<AtomJob> {
        try {
            let jobExists: AtomJob = await this.getJob(job.name);
            let results: OkPacket;
            if (job) {
                results = await this.pool.query(
                    'UPDATE scheduler_jobs SET ' + this.UPDATE_INSERT_QUERY_PARTIAL + ' WHERE name=?',
                    [job.name, job.plannedString, job.status, job.started, job.timeElapsed, job.lastErrorJSON, job.schedulerID, job.name]);

            } else {
                results = await this.pool.query(
                    'INSERT INTO scheduler_jobs SET ' + this.UPDATE_INSERT_QUERY_PARTIAL,
                    [job.name, job.plannedString, job.status, job.started, job.timeElapsed, job.lastErrorJSON, job.schedulerID]);
            }
            if (results.affectedRows)
                return this.getJob(job.name);
            return null;//throw new SchedulerError("Couldn't find the job named: " + job.name)
        } catch (error) {
            throw error;
        }
    }
    /* updateJob(): Promise<Job> {
         return new Promise<Job>((resolve, reject) => {
             this.pool.query('UPDATE scheduler_jobs SET ?', { title: 'test' }, (error, results, fields) => {
                 if (error) throw error;
                 console.log(results.insertId);
             });
         });
     }*/
    async getJob(jobName: string): Promise<AtomJob> {
        let row: RowDataPacket = (await this.pool.query('SELECT * FROM scheduler_jobs WHERE name = ? LIMIT 1', [jobName]) as { rows: RowDataPacket[], fields: any[] }).rows.pop();
        return AtomJob.create(row);
    }
    async getNextJob(schedulerId: string): Promise<AtomJob> {
        let job: AtomJob;
        //update next job which needs to be executed and is free with schedulerId
        let results: OkPacket = await this.pool.query('UPDATE scheduler_jobs SET schedulerId=?,  WHERE plannedOn >= CURDATE() AND schedulerId IS NULL LIMIT 1', [schedulerId]);
        if (results.affectedRows) {
            //get it
            let row: object = (await this.pool.query('SELECT * FROM scheduler_jobs WHERE shedulerId = ? LIMIT 1', [schedulerId]) as { rows: RowDataPacket[], fields: any[] }).rows.pop();
            job =AtomJob.create(row);
        }
        //build Job object 
        return job;
    }
    async getAllJobs(): Promise<AtomJob[]> {
        let results: { rows: RowDataPacket[], fields: any[] } = await this.pool.query('SELECT * FROM scheduler_jobs');
        let jobs: AtomJob[] = [];
        results.rows.forEach((value, index) => {
            jobs.push(AtomJob.create(value));
        });
        return jobs;
    }

}
