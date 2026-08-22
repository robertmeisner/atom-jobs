import { AtomMySQLAdapter } from "../../src/DBAdapters/AtomMySQLAdapter";

describe("AtomMySQLAdapter lifecycle", () => {
    it("destroys its connection once when closed repeatedly", async () => {
        const adapter = new AtomMySQLAdapter({ client: "mysql" });
        const destroy = jasmine.createSpy("destroy").and.returnValue(Promise.resolve());
        (adapter as any).knex = { destroy };

        const firstClose = adapter.close();
        const secondClose = adapter.close();

        expect(secondClose).toBe(firstClose);
        await firstClose;
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
