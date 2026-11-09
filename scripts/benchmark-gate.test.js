const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
    BenchmarkGateInputError,
    buildSnapshot,
    compareBenchmarks,
    extractProjectMetrics,
    markdownEscape,
    parseArguments,
    renderMarkdown,
    validateBaseline,
} = require("./benchmark-gate.js");

function metric(hz) {
    return { hz, mean: 1 / hz, median: 1 / hz, rme: 1.25, sampleCount: 100 };
}

function project(hz = 100) {
    return { benchmarks: { "suite > benchmark": metric(hz) } };
}

function baseline(hz = 100) {
    return buildSnapshot({ api: project(hz), web: project(hz) }, { maxRegressionPercent: 20 }, "abc123");
}

test("extractProjectMetrics creates stable names and keeps Vitest statistics", () => {
    const result = extractProjectMetrics("api", {
        files: [{
            filepath: "/workspace/api/benchmarks/example.bench.ts",
            groups: [{
                fullName: "slot calculation",
                benchmarks: [{ name: "dense day", ...metric(250) }],
            }],
        }],
    });

    assert.deepEqual(result, { benchmarks: { "slot calculation > dense day": metric(250) } });
});

test("extractProjectMetrics rejects malformed and duplicate reports", () => {
    assert.throws(() => extractProjectMetrics("api", {}), BenchmarkGateInputError);
    assert.throws(() => extractProjectMetrics("api", { files: [] }), /did not contain benchmarks/);
    assert.throws(() => extractProjectMetrics("api", {
        files: [{ groups: [{ fullName: "suite", benchmarks: [
            { name: "same", ...metric(100) },
            { name: "same", ...metric(100) },
        ] }] }],
    }), /duplicate benchmark/);
    assert.throws(() => extractProjectMetrics("api", {
        files: [{ groups: [{ fullName: "suite", benchmarks: [{ name: "bad", ...metric(0) }] }] }],
    }), /positive finite number/);
});

test("compareBenchmarks passes improvements and the exact 20 percent boundary", () => {
    const trusted = baseline();
    const current = buildSnapshot({ api: project(80), web: project(120) }, trusted.policy, "def456");
    const result = compareBenchmarks(trusted, current, ["api", "web"]);

    assert.equal(result.passed, true);
    assert.deepEqual(result.results.map(({ status }) => status), ["pass", "pass"]);
});

test("compareBenchmarks blocks regressions above 20 percent and missing benchmarks", () => {
    const trusted = baseline();
    const slow = buildSnapshot({ api: project(79.99) }, trusted.policy, "def456");
    const regression = compareBenchmarks(trusted, slow, ["api"]);
    assert.equal(regression.passed, false);
    assert.equal(regression.results[0].status, "regression");

    const missing = buildSnapshot({ api: { benchmarks: {} } }, trusted.policy, "def456");
    const missingResult = compareBenchmarks(trusted, missing, ["api"]);
    assert.equal(missingResult.passed, false);
    assert.equal(missingResult.results[0].status, "missing");
});

test("compareBenchmarks reports new benchmarks without blocking", () => {
    const trusted = baseline();
    const current = buildSnapshot({
        api: { benchmarks: { ...project().benchmarks, "suite > new": metric(50) } },
    }, trusted.policy, "def456");
    const result = compareBenchmarks(trusted, current, ["api"]);

    assert.equal(result.passed, true);
    assert.equal(result.results.find(({ key }) => key === "suite > new").status, "new");
    assert.equal(result.warnings.length, 1);
});

test("validateBaseline rejects invalid policy and metrics", () => {
    assert.doesNotThrow(() => validateBaseline(baseline()));
    assert.throws(() => validateBaseline({ ...baseline(), schemaVersion: 2 }), /schemaVersion 1/);
    assert.throws(() => validateBaseline({ ...baseline(), policy: { maxRegressionPercent: 100 } }), /lower than 100/);
    assert.throws(() => validateBaseline({ ...baseline(), projects: { api: project() } }), /web project/);
    assert.throws(() => validateBaseline({
        ...baseline(),
        projects: { api: { benchmarks: {} }, web: project() },
    }), /at least one benchmark/);
    const invalid = baseline();
    invalid.projects.api.benchmarks["suite > benchmark"].hz = Number.NaN;
    assert.throws(() => validateBaseline(invalid), /positive finite number/);
});

test("renderMarkdown includes comparison, skipped projects and escaped names", () => {
    const trusted = baseline();
    const comparison = compareBenchmarks(trusted, buildSnapshot({ api: project(90) }, trusted.policy), ["api"]);
    comparison.warnings.push("notify @team|now");
    const markdown = renderMarkdown({
        baseline: trusted,
        comparison,
        selectedProjects: ["api"],
        skippedProjects: ["web"],
        baselineLabel: "main|trusted`baseline",
    });

    assert.match(markdown, /^# Performance/m);
    assert.match(markdown, /-10\.00%/);
    assert.match(markdown, /Skipped projects: `web`/);
    assert.match(markdown, /main\\\|trusted\\`baseline/);
    assert.match(markdown, /&#64;team\\\|now/);
});

test("renderMarkdown explains the bootstrap reference without claiming a regression comparison", () => {
    const trusted = baseline();
    const comparison = compareBenchmarks(trusted, trusted, ["api"]);
    comparison.bootstrap = true;
    const markdown = renderMarkdown({
        baseline: trusted,
        comparison,
        selectedProjects: ["api"],
        skippedProjects: ["web"],
        baselineLabel: "bootstrap:scripts/benchmark-baseline.json",
    });

    assert.match(markdown, /Baseline captured for this benchmark suite/);
    assert.doesNotMatch(markdown, /No blocking microbenchmark regressions/);
});

test("argument parsing validates projects and baseline paths", () => {
    assert.deepEqual(parseArguments(["--projects", "api"]), {
        bootstrap: false,
        updateBaseline: false,
        projects: ["api"],
        baselinePath: parseArguments([]).baselinePath,
    });
    assert.equal(parseArguments(["--bootstrap"]).bootstrap, true);
    assert.deepEqual(parseArguments(["--projects", ""]).projects, []);
    assert.throws(() => parseArguments(["--projects", "desktop"]), /Unknown benchmark project/);
    assert.throws(() => parseArguments(["--baseline"]), /requires a path/);
    assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/);
});

test("markdownEscape prevents table and mention injection", () => {
    assert.equal(markdownEscape("one|two\n`three` <tag> @team"), "one\\|two \\`three\\` &lt;tag&gt; &#64;team");
});

test("a project rewritten in another language starts with no comparable benchmarks", () => {
    const trusted = baseline();
    trusted.languages = { api: "typescript", web: "typescript" };
    const current = buildSnapshot({ api: { benchmarks: { "rust > day key": project().benchmarks["suite > benchmark"] } } }, trusted.policy, "abc", { api: "rust", web: "typescript" });
    const comparison = compareBenchmarks(trusted, current, ["api"]);

    assert.equal(comparison.passed, true);
    assert.deepEqual(comparison.results.map((result) => result.status), ["new"]);
});

test("extractProjectMetrics reads Vitest 5 JSON benchmark results", () => {
    const report = {
        success: true,
        testResults: [{
            name: path.join(__dirname, "..", "api", "benchmarks", "date.bench.ts"),
            assertionResults: [{
                ancestorTitles: ["date helpers"],
                benchmarks: [{ name: "x", tasks: [{ name: "convert", throughput: { mean: 2000 }, latency: { mean: 0.5, p50: 0.4, rme: 0.2, samplesCount: 10 } }] }],
            }],
        }],
    };

    assert.deepEqual(extractProjectMetrics("api", report).benchmarks, {
        "benchmarks/date.bench.ts > date helpers > convert": { hz: 2000, mean: 0.5, median: 0.4, rme: 0.2, sampleCount: 10 },
    });
    assert.throws(() => extractProjectMetrics("api", { ...report, success: false }), /did not pass/);
});
