import { InMemoryGraphStore } from "../../src/storage/index.js";
import { runConformanceTests } from "../../src/storage/conformance.js";

runConformanceTests(() => new InMemoryGraphStore());
