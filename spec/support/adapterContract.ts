import { AtomDBAdapter } from "../../src/AtomDBAdapter";
import { AtomJob, AtomJobStatus } from "../../src/AtomJob";

type AdapterFactory = () => AtomDBAdapter | Promise<AtomDBAdapter>;

export function defineAdapterContract(name: string, createAdapter: AdapterFactory, enabled: boolean = true): void {
    const contractDescribe = enabled ? describe : xdescribe;

    contractDescribe(name + " adapter contract", () => {
        let adapter: AtomDBAdapter;
        let jobNames: string[];
        let sequence = 0;

        const newJob = (suffix: string, options?: object): AtomJob => {
            const name = "contract_" + Date.now() + "_" + sequence++ + "_" + suffix;
            jobNames.push(name);
            return new AtomJob(name, "tomorrow", { source: "adapter-contract" }, options);
        };

        beforeEach(async () => {
            adapter = await createAdapter();
            jobNames = [];
        });

        afterEach(async () => {
            for (const jobName of jobNames) {
                await adapter.deleteJob(jobName, true);
            }
        });

        it("persists jobs with metadata and options", async () => {
            const savedJob = await adapter.saveJob(newJob("persisted", { isRecurring: false }));
            const loadedJob = await adapter.getJob(savedJob.name);

            expect(loadedJob).toBeTruthy();
            expect(loadedJob.metadataObject["source"]).toBe("adapter-contract");
            expect(loadedJob.isRecurring).toBeFalsy();
        });

        it("lists jobs using adapter conditions", async () => {
            await adapter.saveJob(newJob("crawler_one"));
            await adapter.saveJob(newJob("crawler_two"));
            const filteredJobs = await adapter.getAllJobs([
                { field: "name", operator: "like", value: "contract_%_crawler_%" }
            ]);

            expect(filteredJobs.length).toBe(2);
        });

        it("persists updates and failure diagnostics", async () => {
            const job = await adapter.saveJob(newJob("failure"));
            const updatedJob = await adapter.updateJob({
                name: job.name,
                status: AtomJobStatus.Failed,
                lastErrorJSON: JSON.stringify({ name: "Error", message: "contract failure" })
            });
            const loadedJob = await adapter.getJob(job.name);

            expect(updatedJob.status).toBe(AtomJobStatus.Failed);
            expect(loadedJob.status).toBe(AtomJobStatus.Failed);
            expect(JSON.parse(loadedJob.lastErrorJSON).message).toBe("contract failure");
        });

        it("does not delete locked jobs without force", async () => {
            const job = await adapter.saveJob(newJob("locked"));
            await adapter.updateJob({ name: job.name, schedulerID: "contract-scheduler" });

            expect(await adapter.deleteJob(job.name)).toBeFalsy();
            expect(await adapter.deleteJob(job.name, true)).toBeTruthy();
        });
    });
}
