import { InMemoryGraphStore } from "../../src/storage/index.js";
import { runConformanceTests } from "./conformance.js";

runConformanceTests(() => new InMemoryGraphStore());
