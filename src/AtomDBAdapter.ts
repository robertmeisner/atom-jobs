import { AtomJob, AtomJobStatus } from "./AtomJob";

export interface AtomDBAdapter {
    saveJob(job: AtomJob | any): Promise<AtomJob>;
    updateJob(job: AtomJob | any): Promise<AtomJob>;
    deleteJob(jobName: string, force?: boolean): Promise<boolean>;
    getJob(jobName: string): Promise<AtomJob>;
    getAllJobs(conditions?:  {field:string,operator?:string,value:string}[]): Promise<AtomJob[]>;
}
