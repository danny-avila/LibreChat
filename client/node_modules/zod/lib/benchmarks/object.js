"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const benchmark_1 = __importDefault(require("benchmark"));
const index_1 = require("../index");
const emptySuite = new benchmark_1.default.Suite("z.object: empty");
const shortSuite = new benchmark_1.default.Suite("z.object: short");
const longSuite = new benchmark_1.default.Suite("z.object: long");
const empty = index_1.z.object({});
const short = index_1.z.object({
    string: index_1.z.string(),
});
const long = index_1.z.object({
    string: index_1.z.string(),
    number: index_1.z.number(),
    boolean: index_1.z.boolean(),
});
emptySuite
    .add("valid", () => {
    empty.parse({});
})
    .add("valid: extra keys", () => {
    empty.parse({ string: "string" });
})
    .add("invalid: null", () => {
    try {
        empty.parse(null);
    }
    catch (err) { }
})
    .on("cycle", (e) => {
    console.log(`${emptySuite.name}: ${e.target}`);
});
shortSuite
    .add("valid", () => {
    short.parse({ string: "string" });
})
    .add("valid: extra keys", () => {
    short.parse({ string: "string", number: 42 });
})
    .add("invalid: null", () => {
    try {
        short.parse(null);
    }
    catch (err) { }
})
    .on("cycle", (e) => {
    console.log(`${shortSuite.name}: ${e.target}`);
});
longSuite
    .add("valid", () => {
    long.parse({ string: "string", number: 42, boolean: true });
})
    .add("valid: extra keys", () => {
    long.parse({ string: "string", number: 42, boolean: true, list: [] });
})
    .add("invalid: null", () => {
    try {
        long.parse(null);
    }
    catch (err) { }
})
    .on("cycle", (e) => {
    console.log(`${longSuite.name}: ${e.target}`);
});
exports.default = {
    suites: [emptySuite, shortSuite, longSuite],
};
