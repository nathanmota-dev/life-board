"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    DEFAULT_POLICY,
    MAX_PRODUCTION_FILE_LINES,
    MAX_PRODUCTION_FUNCTION_LINES,
    QualityGateInputError,
    aggregateCoverage,
    buildBaseline,
    countLimitViolations,
    collectFileSizes,
    compareMetrics,
    countPhysicalLines,
    coverageDecreased,
    duplicationPercentage,
    duplicationRatioIsHigher,
    markdownEscape,
    parseArguments,
    parseCoverageFilePaths,
    parseCoverageSummary,
    parseEslintReports,
    parseJscpdReport,
    renderMarkdown,
    scanFunctionSizes,
    validateBaseline,
    validateCoverageScope,
} = require("./quality-gate.js");

const { parseClippyReport, parseRustCoverageReport, resolvePolicy } = require("./quality-gate.js");

const metricNames = ["lines", "statements", "functions", "branches"];

function coverage(covered = 8, total = 10) {
    return Object.fromEntries(metricNames.map((metric) => [metric, { covered, total }]));
}

function createBaseline() {
    return {
        schemaVersion: 1,
        generatedFromCommit: "abc123",
        policy: structuredClone(DEFAULT_POLICY),
        coverage: {
            projects: {
                api: coverage(),
                desktop: coverage(),
                web: coverage(),
            },
        },
        duplication: {
            duplicatedLines: 10,
            totalLines: 100,
            fragments: 2,
        },
        violations: {
            qualityRuleViolations: 0,
            oversizedFiles: 0,
            oversizedFunctions: 0,
        },
        fileLines: {
            "api/src/legacy.ts": 350,
            "web/src/small.ts": 200,
        },
    };
}

function createMetrics() {
    const projects = {
        api: coverage(),
        desktop: coverage(),
        web: coverage(),
    };

    return {
        coverage: {
            projects,
            total: aggregateCoverage(projects),
        },
        duplication: {
            duplicatedLines: 10,
            totalLines: 100,
            fragments: 2,
        },
        violations: {
            qualityRuleViolations: 0,
            oversizedFiles: 0,
            oversizedFunctions: 0,
            byProject: { api: 0, desktop: 0, web: 0 },
        },
        fileLines: {
            "api/src/legacy.ts": 350,
            "web/src/small.ts": 200,
        },
    };
}

test("parseCoverageSummary validates and extracts all required totals", () => {
    const summary = {
        total: {
            ...coverage(7, 9),
            branchesTrue: { covered: 0, total: 0 },
        },
    };

    assert.deepEqual(parseCoverageSummary(summary, "fixture"), coverage(7, 9));
    assert.throws(
        () => parseCoverageSummary({ total: { ...coverage(), lines: { covered: 11, total: 10 } } }, "fixture"),
        QualityGateInputError,
    );
    assert.throws(() => parseCoverageSummary({}, "fixture"), /fixture\.total must be an object/);
});

test("coverage scope requires every production file, including files not imported by tests", (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-coverage-"));
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const apiMain = path.join(directory, "api", "src", "main.ts");
    const summary = {
        total: coverage(),
        [apiMain]: coverage(),
        "src/unimported.ts": coverage(0, 5),
    };
    const backendFiles = parseCoverageFilePaths(summary, "api", directory);
    const fileLines = {
        "api/src/main.ts": 10,
        "api/src/unimported.ts": 4,
        "api/src/main.test.ts": 50,
        "api/src/__tests__/helper.ts": 50,
        "api/src/types.d.ts": 400,
        "web/src/view.tsx": 20,
    };

    assert.deepEqual(backendFiles, [
        "api/src/main.ts",
        "api/src/unimported.ts",
    ]);
    assert.deepEqual(validateCoverageScope({
        api: backendFiles,
        desktop: [],
        web: ["web/src/view.tsx"],
    }, fileLines), { api: 2, desktop: 0, web: 1 });
    assert.throws(
        () => validateCoverageScope({
            api: ["api/src/main.ts"],
            desktop: [],
            web: ["web/src/view.tsx"],
        }, fileLines),
        /Coverage scope mismatch for api: missing api\/src\/unimported\.ts/,
    );
    assert.throws(
        () => validateCoverageScope({
            api: [...backendFiles, "api/src/ghost.ts"],
            desktop: [],
            web: ["web/src/view.tsx"],
        }, fileLines),
        /unexpected api\/src\/ghost\.ts/,
    );
});

test("aggregateCoverage weights covered and total counts instead of averaging percentages", () => {
    const projects = {
        api: coverage(1, 1),
        desktop: coverage(0, 0),
        web: coverage(0, 9),
    };
    const aggregate = aggregateCoverage(projects);

    assert.deepEqual(aggregate.lines, { covered: 1, total: 10 });
    assert.notEqual(aggregate.lines.covered / aggregate.lines.total, (1 + 0) / 2);
});

test("parseEslintReports counts errors and warnings but not suppressed messages", () => {
    const parsed = parseEslintReports({
        api: [{ errorCount: 2, warningCount: 1, fatalErrorCount: 1, suppressedMessages: [{ ruleId: "x" }] }],
        desktop: [],
        web: [{ errorCount: 0, warningCount: 3, suppressedMessages: [{ ruleId: "y" }] }],
    });

    assert.deepEqual(parsed, {
        projects: { api: 3, desktop: 0, web: 3 },
        total: 6,
    });
    assert.throws(
        () => parseEslintReports({ api: [], desktop: [], web: [{ errorCount: -1, warningCount: 0 }] }),
        /non-negative integer/,
    );
});

test("parseJscpdReport supports v5 and v4 totals and rejects inconsistent reports", () => {
    assert.deepEqual(parseJscpdReport({
        statistics: { total: { lines: 100, duplicatedLines: 10, clones: 4, percentage: 10 } },
    }), {
        totalLines: 100,
        duplicatedLines: 10,
        fragments: 4,
    });

    assert.deepEqual(parseJscpdReport({
        statistic: { total: { lines: 50, duplicatedLines: 5, percentage: 10 } },
        duplicates: [{}, {}],
    }), {
        totalLines: 50,
        duplicatedLines: 5,
        fragments: 2,
    });

    assert.throws(
        () => parseJscpdReport({ statistics: { total: { lines: 100, duplicatedLines: 10, clones: 1, percentage: 50 } } }),
        /inconsistent/,
    );
    assert.throws(() => parseJscpdReport({}), /total statistics must be an object/);
});

test("countPhysicalLines handles empty files, final newlines, CRLF, and missing final newlines", () => {
    assert.equal(countPhysicalLines(""), 0);
    assert.equal(countPhysicalLines("one"), 1);
    assert.equal(countPhysicalLines("one\n"), 1);
    assert.equal(countPhysicalLines("one\ntwo"), 2);
    assert.equal(countPhysicalLines("one\r\ntwo\r\n"), 2);
    assert.equal(countPhysicalLines("one\rtwo"), 2);
});

test("production limits are absolute and include the exact 100/101 and 350/351 boundaries", () => {
    assert.equal(MAX_PRODUCTION_FUNCTION_LINES, 100);
    assert.equal(MAX_PRODUCTION_FILE_LINES, 350);
    assert.equal(countLimitViolations([100], MAX_PRODUCTION_FUNCTION_LINES), 0);
    assert.equal(countLimitViolations([101], MAX_PRODUCTION_FUNCTION_LINES), 1);
    assert.equal(countLimitViolations([350], MAX_PRODUCTION_FILE_LINES), 0);
    assert.equal(countLimitViolations([351], MAX_PRODUCTION_FILE_LINES), 1);
});

function sourceWithFunctionLength(lineCount, declaration) {
    const body = Array.from({ length: lineCount - 2 }, () => "    void 0;").join("\n");
    return declaration.replace("BODY", body);
}

test("function scanner checks declarations, methods, and arrows at 100/101 lines", () => {
    const cases = [
        [100, "function exact() {\nBODY\n}"],
        [101, "function tooLong() {\nBODY\n}"],
        [100, "class Exact {\n  method() {\nBODY\n  }\n}"],
        [101, "class TooLong {\n  method() {\nBODY\n  }\n}"],
    ];
    const results = cases.map(([lineCount, source]) => scanFunctionSizes(
        sourceWithFunctionLength(lineCount, source),
        "boundary.ts",
    )[0]);
    assert.deepEqual(results.map((result) => result.lineCount), [100, 101, 100, 101]);

    const arrowSource = (name, bodyLineCount) => `const ${name} = () => {\n${Array.from(
        { length: bodyLineCount },
        () => "    void 0;",
    ).join("\n")}\n};`;
    assert.equal(scanFunctionSizes(arrowSource("exact", 98), "arrow.ts")[0].lineCount, 100);
    assert.equal(scanFunctionSizes(arrowSource("tooLong", 99), "arrow.ts")[0].lineCount, 101);
});

test("collectFileSizes scans configured source roots, excludes tests, and does not follow symlinks", (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-"));
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, "app", "nested"), { recursive: true });
    fs.writeFileSync(path.join(directory, "app", "main.ts"), "one\ntwo\n", "utf8");
    fs.writeFileSync(path.join(directory, "app", "main.test.ts"), "ignored\n", "utf8");
    fs.writeFileSync(path.join(directory, "app", "nested", "view.tsx"), "one\r\ntwo", "utf8");
    fs.symlinkSync(path.join(directory, "app", "nested"), path.join(directory, "app", "linked"));
    const policy = {
        ...structuredClone(DEFAULT_POLICY),
        sourceRoots: ["app"],
    };

    assert.deepEqual(collectFileSizes(policy, directory), {
        "app/main.ts": 2,
        "app/nested/view.tsx": 2,
    });
});

test("validateBaseline rejects unsupported schemas and inconsistent oversized counts", () => {
    assert.equal(validateBaseline(createBaseline()).schemaVersion, 1);
    const unknownSchema = createBaseline();
    unknownSchema.schemaVersion = 2;
    assert.throws(() => validateBaseline(unknownSchema), /Unsupported baseline schemaVersion/);

    const inconsistent = createBaseline();
    inconsistent.violations.oversizedFiles = 1;
    assert.throws(() => validateBaseline(inconsistent), /fileLines contains 0/);
});

test("compareMetrics passes an equal baseline and improvements", () => {
    const baseline = createBaseline();
    const equal = compareMetrics(baseline, createMetrics());
    assert.equal(equal.passed, true);
    assert.deepEqual(equal.failures, []);

    const improved = createMetrics();
    improved.coverage.projects.api = coverage(9, 10);
    improved.coverage.total = aggregateCoverage(improved.coverage.projects);
    improved.duplication = { duplicatedLines: 5, totalLines: 100, fragments: 1 };
    improved.fileLines["api/src/legacy.ts"] = 300;
    improved.violations.oversizedFiles = 0;
    assert.equal(compareMetrics(baseline, improved).passed, true);
});

test("compareMetrics catches a package regression masked by unchanged aggregate coverage", () => {
    const baseline = createBaseline();
    const current = createMetrics();
    current.coverage.projects.api = coverage(7, 10);
    current.coverage.projects.web = coverage(9, 10);
    current.coverage.total = aggregateCoverage(current.coverage.projects);
    const result = compareMetrics(baseline, current);

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.includes("api lines coverage decreased")));
    assert.ok(!result.failures.some((failure) => failure.includes("total lines coverage decreased")));
});

test("compareMetrics fails closed when a previously measured coverage report becomes empty", () => {
    const baseline = createBaseline();
    const current = createMetrics();
    current.coverage.projects.api = coverage(0, 0);
    current.coverage.projects.desktop = coverage(0, 0);
    current.coverage.projects.web = coverage(0, 0);
    current.coverage.total = aggregateCoverage(current.coverage.projects);
    const result = compareMetrics(baseline, current);
    const markdown = renderMarkdown({ baseline, metrics: current, comparison: result });

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.includes("coverage report is empty")));
    assert.match(markdown, /\| Lines \| 80\.00% \| No data \| n\/a \|/);
});

test("compareMetrics blocks every aggregate debt increase", () => {
    const baseline = createBaseline();
    const current = createMetrics();
    current.duplication = { duplicatedLines: 11, totalLines: 100, fragments: 3 };
    current.violations.qualityRuleViolations = 1;
    const result = compareMetrics(baseline, current);

    assert.ok(result.failures.some((failure) => failure.startsWith("Duplication increased")));
    assert.ok(result.failures.some((failure) => failure.startsWith("Duplicate fragments increased")));
    assert.ok(result.failures.some((failure) => failure.startsWith("ESLint reports 1 error(s) or warning(s)")));
});

test("duplication comparison treats an empty scan as zero rather than 100 percent", () => {
    const empty = { duplicatedLines: 0, totalLines: 0, fragments: 0 };
    const clean = { duplicatedLines: 0, totalLines: 10, fragments: 0 };
    const duplicated = { duplicatedLines: 1, totalLines: 10, fragments: 1 };

    assert.equal(duplicationPercentage(empty), 0);
    assert.equal(duplicationRatioIsHigher(clean, empty), false);
    assert.equal(duplicationRatioIsHigher(duplicated, empty), true);
});

test("compareMetrics fails closed when a previously populated duplication scan becomes empty", () => {
    const baseline = createBaseline();
    const current = createMetrics();
    current.duplication = { duplicatedLines: 0, totalLines: 0, fragments: 0 };
    const result = compareMetrics(baseline, current);
    const markdown = renderMarkdown({ baseline, metrics: current, comparison: result });

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.includes("Duplication report is empty")));
    assert.match(markdown, /\| Percentage \| 10\.00% \| No data \| n\/a \|/);
});

test("compareMetrics reports new, crossed, and already-oversized file regressions", () => {
    const baseline = createBaseline();
    baseline.fileLines["api/src/legacy.ts"] = 351;
    baseline.violations.oversizedFiles = 1;
    const current = createMetrics();
    current.fileLines = {
        "api/src/legacy.ts": 352,
        "web/src/small.ts": 351,
        "web/src/new.ts": 450,
    };
    current.violations.oversizedFiles = 3;
    const result = compareMetrics(baseline, current);

    assert.deepEqual(result.regressions, [
        "api/src/legacy.ts grew from 351 to 352 lines while already over the 350-line limit.",
        "web/src/new.ts is a new oversized file with 450 lines (limit: 350).",
        "web/src/small.ts grew from 200 to 351 lines and crossed the 350-line limit.",
    ]);
    assert.equal(result.passed, false);
});

test("compareMetrics catches oversized replacement even when the aggregate count is unchanged", () => {
    const baseline = createBaseline();
    baseline.fileLines["api/src/legacy.ts"] = 351;
    baseline.violations.oversizedFiles = 1;
    const current = createMetrics();
    current.fileLines = {
        "web/src/replacement.ts": 351,
        "web/src/small.ts": 200,
    };
    current.violations.oversizedFiles = 1;
    const result = compareMetrics(baseline, current);

    assert.equal(result.regressions.length, 1);
    assert.match(result.regressions[0], /replacement\.ts is a new oversized file/);
    assert.ok(!result.failures.some((failure) => failure.startsWith("Oversized files increased")));
});

test("buildBaseline is deterministic and keeps exact coverage counts", () => {
    const metrics = createMetrics();
    metrics.fileLines = {
        "z.ts": 2,
        "a.ts": 1,
    };
    metrics.violations.oversizedFiles = 0;
    const baseline = buildBaseline(metrics, DEFAULT_POLICY, "deadbeef");

    assert.equal(baseline.generatedFromCommit, "deadbeef");
    assert.deepEqual(Object.keys(baseline.fileLines), ["a.ts", "z.ts"]);
    assert.deepEqual(baseline.coverage.projects.api.lines, { covered: 8, total: 10 });
    assert.doesNotThrow(() => validateBaseline(baseline));
});

test("renderMarkdown includes every requested table and exact regression details", () => {
    const baseline = createBaseline();
    const metrics = createMetrics();
    metrics.fileLines["api/src/legacy.ts"] = 352;
    const comparison = compareMetrics(baseline, metrics);
    const markdown = renderMarkdown({ baseline, metrics, comparison, baselineLabel: "main|trusted`baseline" });

    assert.match(markdown, /^# Quality Gate/m);
    assert.match(markdown, /## Coverage/);
    assert.match(markdown, /## Duplication/);
    assert.match(markdown, /## Violations/);
    assert.match(markdown, /## Regressions/);
    assert.match(markdown, /\| Metric \| Baseline \| Current \| Increase \|/);
    assert.match(markdown, /grew from 350 to 352 lines and crossed the 350-line limit/);
    assert.match(markdown, /main\\\|trusted\\`baseline/);
});

test("markdownEscape prevents table and multiline injection", () => {
    assert.equal(
        markdownEscape("one|two\n`three` <tag> @team"),
        "one\\|two \\`three\\` &lt;tag&gt; &#64;team",
    );
});

test("parseArguments supports explicit baselines and rejects invalid input", () => {
    const parsed = parseArguments(["--no-collect", "--baseline", "fixtures/baseline.json"]);
    assert.equal(parsed.collectToolReports, false);
    assert.match(parsed.baselinePath, /fixtures\/baseline\.json$/);
    assert.throws(() => parseArguments(["--baseline"]), /requires a path/);
    assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/);
});

test("coverage may fall within the 0.1 pp tolerance but not beyond it", () => {
    assert.equal(coverageDecreased({ covered: 7999, total: 10000 }, { covered: 8000, total: 10000 }), false);
    assert.equal(coverageDecreased({ covered: 7990, total: 10000 }, { covered: 8000, total: 10000 }), false);
    assert.equal(coverageDecreased({ covered: 7989, total: 10000 }, { covered: 8000, total: 10000 }), true);
    assert.equal(coverageDecreased({ covered: 0, total: 0 }, { covered: 1, total: 2 }), true);

    const baseline = createBaseline();
    const current = createMetrics();
    current.coverage.projects.desktop = { ...coverage(), lines: { covered: 7999, total: 10000 } };
    current.coverage.total = aggregateCoverage(current.coverage.projects);
    assert.equal(compareMetrics(baseline, current).passed, true);
});

test("ESLint violations block even when the baseline already had some", () => {
    const baseline = createBaseline();
    baseline.violations.qualityRuleViolations = 29;
    const current = createMetrics();
    current.violations.qualityRuleViolations = 3;
    const result = compareMetrics(baseline, current);

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.includes("this check requires zero")));
});

test("changed-line coverage below the minimum blocks and lists uncovered lines", () => {
    const baseline = createBaseline();
    const current = createMetrics();
    current.diffCoverage = {
        evaluated: true,
        base: { ref: "main", sha: "abc123def456" },
        minPercent: 80,
        changedFiles: 1,
        covered: 3,
        total: 5,
        files: [{ filePath: "api/src/new.ts", covered: 3, total: 5, uncoveredLines: [4, 5] }],
    };
    const result = compareMetrics(baseline, current);
    const markdown = renderMarkdown({ baseline, metrics: current, comparison: result });

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.startsWith("Changed-line coverage is 60.00%")));
    assert.match(markdown, /## Changed-line coverage/);
    assert.match(markdown, /\| api\/src\/new\.ts \| 3\/5 \| 4-5 \|/);

    current.diffCoverage = { ...current.diffCoverage, covered: 4, files: [] };
    assert.equal(compareMetrics(baseline, current).passed, true);
});

test("forbidden test markers block with their location", () => {
    const baseline = createBaseline();
    const current = createMetrics();
    current.testMarkers = {
        scannedFiles: 1,
        violations: [{ filePath: "web/src/a.test.ts", line: 3, label: "focused test", source: "it.only('x', () => {})" }],
    };
    const result = compareMetrics(baseline, current);

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.startsWith("web/src/a.test.ts:3 has a focused test")));
});

test("the API source root follows the measured tree, not the baseline policy", () => {
    assert.deepEqual(resolvePolicy(DEFAULT_POLICY, { api: "rust" }).sourceRoots, [
        "src-tauri/crates/api/src",
        "desktop/src",
        "web/src",
    ]);
    assert.deepEqual(resolvePolicy(DEFAULT_POLICY, { api: "typescript" }).sourceRoots, ["api/src", "desktop/src", "web/src"]);
});

test("parseRustCoverageReport maps regions to statements and keeps only production files", (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-rust-"));
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const count = (covered, total) => ({ covered, count: total, percent: 0 });
    const parsed = parseRustCoverageReport({
        data: [{
            totals: { lines: count(8, 10), regions: count(6, 10), functions: count(4, 5), branches: count(0, 0) },
            files: [
                { filename: path.join(directory, "src-tauri/crates/api/src/main.rs") },
                { filename: path.join(directory, "target/out/generated.rs") },
            ],
        }],
    }, directory);

    assert.deepEqual(parsed.coverage.statements, { covered: 6, total: 10 });
    assert.deepEqual(parsed.coverage.branches, { covered: 0, total: 0 });
    assert.deepEqual(parsed.files, ["src-tauri/crates/api/src/main.rs"]);
    assert.throws(() => parseRustCoverageReport({ data: [] }, directory), QualityGateInputError);
});

test("Rust coverage scope tolerates only files without functions", (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-rust-scope-"));
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const root = path.join(directory, "src-tauri/crates/api/src");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "lib.rs"), "pub fn run() {}\n");
    fs.writeFileSync(path.join(root, "mod.rs"), "pub mod lib;\n");
    const fileLines = { "src-tauri/crates/api/src/lib.rs": 1, "src-tauri/crates/api/src/mod.rs": 1 };
    const options = { languages: { api: "rust" }, repositoryRoot: directory };

    assert.deepEqual(validateCoverageScope({ api: ["src-tauri/crates/api/src/lib.rs"], desktop: [], web: [] }, fileLines, options), { api: 1, desktop: 0, web: 0 });
    assert.throws(() => validateCoverageScope({ api: [], desktop: [], web: [] }, fileLines, options), /missing src-tauri\/crates\/api\/src\/lib\.rs/);
});

test("parseClippyReport deduplicates targets and reads function sizes from too_many_lines", () => {
    const span = (file, line) => ({ is_primary: true, file_name: file, line_start: line, line_end: line + 120, column_start: 1, text: [{ text: "pub async fn load_all(state: State) {" }] });
    const diagnostic = (code, spans, message = "m", level = "warning") => JSON.stringify({ reason: "compiler-message", message: { code: { code }, level, message, spans } });
    const source = "src-tauri/crates/api/src/a.rs";
    const report = [
        JSON.stringify({ reason: "compiler-artifact" }),
        diagnostic("clippy::needless_return", [span(source, 3)]),
        diagnostic("clippy::needless_return", [span(source, 3)]),
        diagnostic("clippy::too_many_lines", [span(source, 10)], "this function has too many lines (121/100)"),
        diagnostic("clippy::too_many_lines", [span("src-tauri/crates/api/tests/suite/a.rs", 1)], "this function has too many lines (150/100)"),
        JSON.stringify({ reason: "compiler-message", message: { code: null, level: "warning", message: "1 warning emitted", spans: [] } }),
    ].join("\n");
    const parsed = parseClippyReport(report);

    assert.equal(parsed.violations, 1);
    assert.deepEqual(parsed.oversizedFunctions.map(({ filePath, name, lineCount }) => [filePath, name, lineCount]), [[source, "load_all", 121]]);
    assert.throws(() => parseClippyReport("not json"), /line 1 is invalid JSON/);
});

test("a migrated project skips comparisons but keeps its floor and absolute limits", () => {
    const baseline = createBaseline();
    baseline.languages = { api: "typescript", desktop: "typescript", web: "typescript" };
    const current = createMetrics();
    current.languages = { api: "rust", desktop: "typescript", web: "typescript" };
    current.coverage.projects.api = { ...coverage(9, 10), branches: { covered: 0, total: 0 } };
    current.coverage.total = aggregateCoverage(current.coverage.projects);
    current.duplication = { duplicatedLines: 50, totalLines: 100, fragments: 20 };

    assert.equal(compareMetrics(baseline, current).passed, true);

    current.coverage.projects.web = coverage(1, 10);
    assert.match(compareMetrics(baseline, current).failures.join("\n"), /web lines coverage decreased/);
    current.coverage.projects.web = coverage();
    current.coverage.projects.api = { ...coverage(7, 10), branches: { covered: 0, total: 0 } };
    assert.match(compareMetrics(baseline, current).failures.join("\n"), /api lines coverage is 70\.00%; at least 80% is required/);
    current.coverage.projects.api = { ...coverage(9, 10), branches: { covered: 0, total: 0 } };
    current.violations.oversizedFiles = 1;
    current.fileLines["src-tauri/crates/api/src/big.rs"] = 400;
    assert.match(compareMetrics(baseline, current).failures.join("\n"), /big\.rs is a new oversized file/);
});

test("the API floor applies without a language change", () => {
    const current = createMetrics();
    current.coverage.projects.api = coverage(7, 10);
    assert.match(compareMetrics(createBaseline(), current).failures.join("\n"), /api branches coverage is 70\.00%/);
});
