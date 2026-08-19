import { AtomJob } from "./AtomJob";

export interface AtomJobCondition {
    field: string;
    operator?: string;
    value: any;
}

export interface AtomDBAdapter {
    saveJob(job: AtomJob | any): Promise<AtomJob>;
    updateJob(job: AtomJob | any): Promise<AtomJob>;
    deleteJob(jobName: string, force?: boolean): Promise<boolean>;
    getJob(jobName: string): Promise<AtomJob | undefined>;
    getAllJobs(conditions?: AtomJobCondition[]): Promise<AtomJob[]>;
}
