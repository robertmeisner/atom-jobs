import { AtomJob, AtomJobStatus } from "./AtomJob";

export interface AtomDBAdapter {
    saveJob(job: AtomJob): Promise<AtomJob>;
    getJob(jobName: string): Promise<AtomJob>;
    getNextJob(schedulerId: string): Promise<AtomJob>;
    getAllJobs(conditions?: { statuses?:AtomJobStatus[] }): Promise<AtomJob[]>;

}
 