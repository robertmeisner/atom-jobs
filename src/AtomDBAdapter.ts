import { AtomJob, AtomJobStatus } from "./AtomJob";

export interface AtomDBAdapter {
    saveJob(job: AtomJob | any): Promise<AtomJob>;
    updateJob(job: AtomJob | any): Promise<AtomJob>;
    deleteJob(jobName: string, force?: boolean): Promise<boolean>;
    isJobLocked(jobName: string): Promise<boolean>;
    unlockJob(jobName: string): Promise<boolean>;
    lockJob(jobName: string, schedulerID: string): Promise<boolean>;
    getJob(jobName: string): Promise<AtomJob>;
    jobExists(jobName: string): Promise<boolean>;
    getNextJob(schedulerId: string): Promise<AtomJob>;
    getAllJobs(conditions?: { statuses?: AtomJobStatus[] }): Promise<AtomJob[]>;
}
