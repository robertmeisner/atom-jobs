import { AtomInMemoryAdapter } from "../../src/DBAdapters/AtomInMemoryAdapter";
import { defineAdapterContract } from "../support/adapterContract";

defineAdapterContract("InMemoryAdapter", () => new AtomInMemoryAdapter());
