import { AtomMySQLAdapter } from "../../src/DBAdapters/AtomMySQLAdapter";
import { defineAdapterContract } from "../support/adapterContract";
require("../common");

defineAdapterContract(
    "MySQLAdapter",
    () => new AtomMySQLAdapter(require("../config/" + process.env.NODE_ENV + ".js")),
    process.env.RUN_INTEGRATION_TESTS === "true"
);
