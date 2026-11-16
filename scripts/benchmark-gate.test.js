const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
    BenchmarkGateInputError,
    aggregateRounds,
    buildSnapshot,
    compareBenchmarks,
    extractProjectMetrics,
    markdownEscape,
    parseArguments,
    renderMarkdown,
    retryPlan,
    validateBaseline,
    validateSnapshot,
} = require("./benchmark-gate.js");

function metric(hz, rme = 1.25) {
    return { hz, mean: 1 / hz, median: 1 / hz, rme, sampleCount: 100 };
}

function project(hz = 100, rme = 1.25) {
    return { benchmarks: { "suite > benchmark": metric(hz, rme) } };
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
        baselinePaths: parseArguments([]).baselinePaths,
        currentPaths: [],
    });
    assert.equal(parseArguments([]).baselinePaths.length, 1);
    assert.equal(parseArguments(["--bootstrap"]).bootstrap, true);
    assert.deepEqual(parseArguments(["--projects", ""]).projects, []);
    const rounds = parseArguments(["--baseline", "a.json", "--baseline", "b.json", "--current", "c.json"]);
    assert.deepEqual(rounds.baselinePaths.map((file) => path.basename(file)), ["a.json", "b.json"]);
    assert.deepEqual(rounds.currentPaths.map((file) => path.basename(file)), ["c.json"]);
    assert.throws(() => parseArguments(["--projects", "desktop"]), /Unknown benchmark project/);
    assert.throws(() => parseArguments(["--baseline"]), /--baseline requires a path/);
    assert.throws(() => parseArguments(["--current"]), /--current requires a path/);
    assert.throws(() => parseArguments(["--bootstrap", "--current", "c.json"]), /only applies to a comparison/);
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

test("compareBenchmarks marks regressions and near misses within the margin of error as suspects", () => {
    const trusted = buildSnapshot({ api: project(100, 1), web: project(100, 1) }, { maxRegressionPercent: 20 }, "abc");
    const current = buildSnapshot({ api: project(70, 1), web: project(81, 6) }, trusted.policy, "def");
    const comparison = compareBenchmarks(trusted, current, ["api", "web"]);

    assert.deepEqual(comparison.results.map(({ status, suspect }) => [status, suspect]), [["regression", true], ["pass", true]]);
    assert.deepEqual(retryPlan(comparison), {
        projects: ["api", "web"],
        benchmarks: ["api/suite > benchmark", "web/suite > benchmark"],
    });
});

test("compareBenchmarks doesn't measure again a result clear of the limit", () => {
    const trusted = buildSnapshot({ api: project(100, 1), web: project(100, 1) }, { maxRegressionPercent: 20 }, "abc");
    const comparison = compareBenchmarks(trusted, buildSnapshot({ api: project(85, 1) }, trusted.policy, "def"), ["api"]);

    assert.equal(comparison.results[0].suspect, false);
    assert.deepEqual(retryPlan(comparison), { projects: [], benchmarks: [] });
});

test("aggregateRounds takes the median of every metric across rounds", () => {
    const rounds = [70, 98, 101].map((hz, index) =>
        buildSnapshot({ web: { benchmarks: { "suite > benchmark": metric(hz, index + 1), ...(index ? {} : { "suite > once": metric(5) }) } } }, { maxRegressionPercent: 20 }, "abc"));
    const aggregated = aggregateRounds(rounds);

    assert.equal(aggregated.rounds, 3);
    assert.equal(aggregated.projects.web.benchmarks["suite > benchmark"].hz, 98);
    assert.equal(aggregated.projects.web.benchmarks["suite > benchmark"].rme, 2);
    assert.equal(aggregated.projects.web.benchmarks["suite > once"].hz, 5);
    assert.equal(aggregated.projects.api, undefined);
    assert.equal(aggregateRounds([rounds[0]]).rounds, 1);
    assert.equal(aggregateRounds(rounds.slice(0, 2)).projects.web.benchmarks["suite > benchmark"].hz, 84);
});

test("validateSnapshot requires the selected projects", () => {
    const round = buildSnapshot({ web: project() }, { maxRegressionPercent: 20 }, "abc");
    assert.doesNotThrow(() => validateSnapshot(round, ["web"], "round"));
    assert.throws(() => validateSnapshot(round, ["api"], "round"), /round must contain the api project/);
    assert.throws(() => validateSnapshot({ ...round, schemaVersion: 2 }, ["web"], "round"), /schemaVersion 1/);
});

test("renderMarkdown says when medians of several rounds were compared", () => {
    const trusted = baseline();
    const comparison = compareBenchmarks(trusted, trusted, ["api"]);
    const options = { baseline: trusted, comparison, selectedProjects: ["api"], skippedProjects: ["web"], baselineLabel: "base" };

    assert.match(renderMarkdown({ ...options, rounds: 3 }), /Medians of 3 measurement rounds/);
    assert.doesNotMatch(renderMarkdown(options), /Medians of/);
});

/** Runs a copy of the gate in a temporary repository, so its reports don't touch this checkout. */
function runGate(files, args) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-gate-"));
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(path.join(__dirname, "benchmark-gate.js"), path.join(root, "scripts", "benchmark-gate.js"));
    for (const [file, value] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), JSON.stringify(value));
    }
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "benchmark-gate.js"), ...args], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, BENCHMARK_COMMIT: "abc", BENCHMARK_BASELINE_PATH: "", BENCHMARK_BASELINE_LABEL: "" },
    });
    const reports = Object.fromEntries(["benchmark-retry.json", "performance.json"].map((file) => [
        `reports/${file}`,
        JSON.parse(fs.readFileSync(path.join(root, "reports", file), "utf8")),
    ]));
    const report = fs.readFileSync(path.join(root, "reports", "performance.md"), "utf8");
    fs.rmSync(root, { recursive: true, force: true });
    return { status: result.status, read: (file) => reports[file], report, stderr: result.stderr };
}

function rawReport(hz, rme = 1) {
    return { files: [{ groups: [{ fullName: "suite", benchmarks: [{ name: "benchmark", ...metric(hz, rme) }] }] }] };
}

test("the CLI asks to measure a single-round regression again and lets the medians decide", () => {
    const base = baseline();
    for (const name of ["api", "web"]) base.projects[name].benchmarks["suite > benchmark"].rme = 1;
    const noisy = runGate({
        "base.json": base,
        "reports/benchmarks/web.json": rawReport(78, 6),
    }, ["--projects", "web", "--baseline", "base.json"]);
    assert.equal(noisy.status, 1);
    assert.match(noisy.report, /measures it again before deciding/);

    const roundsOf = (hzs) => Object.fromEntries(hzs.map((hz, index) => [`head-${index}.json`, buildSnapshot({ web: { benchmarks: { "suite > benchmark": metric(hz, 1) } } }, base.policy, "abc")]));
    const currentArgs = (count) => Array.from({ length: count }, (_, index) => ["--current", `head-${index}.json`]).flat();
    const baseArgs = ["--baseline", "base.json", "--baseline", "base.json", "--baseline", "base.json"];

    const settled = runGate({ "base.json": base, ...roundsOf([78, 97, 99]) }, ["--projects", "web", ...baseArgs, ...currentArgs(3)]);
    assert.equal(settled.status, 0);
    assert.deepEqual(settled.read("reports/benchmark-retry.json"), { projects: [], benchmarks: [] });
    assert.equal(settled.read("reports/performance.json").rounds, 3);
    assert.match(settled.report, /Medians of 3 measurement rounds/);

    const stable = runGate({ "base.json": base, ...roundsOf([75, 74, 99]) }, ["--projects", "web", ...baseArgs, ...currentArgs(3)]);
    assert.equal(stable.status, 1);
    assert.match(stable.report, /regressed by 25\.00%/);
});

test("the CLI writes the retry plan only for a single-round comparison", () => {
    const base = baseline();
    const result = runGate({ "base.json": base, "reports/benchmarks/web.json": rawReport(70) }, ["--projects", "web", "--baseline", "base.json"]);

    assert.equal(result.status, 1);
    assert.deepEqual(result.read("reports/benchmark-retry.json"), { projects: ["web"], benchmarks: ["web/suite > benchmark"] });
});
