"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    aggregateState,
    classifyWorkflow,
    findProtectedChanges,
    isApprovedInfrastructureChange,
    isProtectedPath,
    missingRunsShouldBlock,
    protectedPathEntries,
    renderPerformanceSection,
    renderQualitySection,
    renderReport,
    selectBenchmarks,
    selectLatestRun,
    selectWorkflows,
    stripEmojis,
} = require("./pr-validation.js");

function run({ id = 1, attempt = 1, started = "2026-01-01T00:00:00Z", status = "completed", conclusion = "success" } = {}) {
    return {
        id,
        run_number: id,
        run_attempt: attempt,
        run_started_at: started,
        status,
        conclusion,
        pull_requests: [{ number: 12, head: { sha: "sha-current" } }],
    };
}

test("benchmark and workflow selections cover the API, web, Rust, and unrelated changes", () => {
    assert.deepEqual(selectBenchmarks(["api/src/app.ts"]), ["api"]);
    assert.deepEqual(selectBenchmarks(["src-tauri/crates/api/src/lib.rs"]), ["api"]);
    assert.deepEqual(selectBenchmarks(["web/src/app.tsx"]), ["web"]);
    assert.deepEqual(selectBenchmarks(["api/src/app.ts", "web/src/app.tsx"]), ["api", "web"]);
    assert.deepEqual(selectBenchmarks(["docs/readme.md"]), []);
    assert.deepEqual(selectBenchmarks(["scripts/benchmark-gate.js"]), ["api", "web"]);
    assert.deepEqual(selectBenchmarks([".github/workflows/frontend-ci.yml"]), ["web"]);
    assert.deepEqual(selectBenchmarks([".github/workflows/performance.yml"]), ["api", "web"]);

    const selection = selectWorkflows(["docs/readme.md"]);
    assert.equal(selection["Frontend CI"], true);
    assert.equal(selection["Rust CI"], false);
    assert.equal(selection["Electron E2E"], true);
    assert.equal(selection["PR Quality Gate"], true);
    assert.equal(selection.Performance, true);
    assert.equal(selectWorkflows(["Cargo.lock"])["Rust CI"], true);
    assert.equal(selectWorkflows([".github/workflows/rust-ci.yml"])["Rust CI"], true);
});

test("infrastructure approval needs the label, the same repository, and an allowed branch", () => {
    const approved = { labels: ["validation-infrastructure-approved"], headBranch: "ci/gate", headRepository: "o/r", repository: "o/r" };
    assert.equal(isApprovedInfrastructureChange(approved), true);
    assert.equal(isApprovedInfrastructureChange({ ...approved, headBranch: "refactor/rewrite-rust-app" }), true);
    assert.equal(isApprovedInfrastructureChange({ ...approved, headBranch: "feat/other" }), false);
    assert.equal(isApprovedInfrastructureChange({ ...approved, labels: [] }), false);
    assert.equal(isApprovedInfrastructureChange({ ...approved, headRepository: "fork/r" }), false);
});

test("latest selected run is scoped to the same PR and SHA and uses its latest rerun attempt", () => {
    const olderSha = { ...run({ id: 99, started: "2026-02-01T00:00:00Z" }), pull_requests: [{ number: 12, head: { sha: "sha-old" } }] };
    const olderAttempt = run({ id: 1, attempt: 1, started: "2026-01-01T00:00:00Z", conclusion: "failure" });
    const rerunSuccess = run({ id: 1, attempt: 2, started: "2026-01-02T00:00:00Z", conclusion: "success" });
    const newerRun = run({ id: 2, started: "2026-01-03T00:00:00Z", conclusion: "failure" });

    assert.equal(selectLatestRun([olderSha, olderAttempt, rerunSuccess], 12, "sha-current"), rerunSuccess);
    assert.equal(selectLatestRun([olderAttempt, rerunSuccess, newerRun], 12, "sha-current"), newerRun);
    assert.equal(selectLatestRun([olderSha], 12, "sha-current"), null);
});

test("in-progress, failed, cancelled, timeout, absent, and unselected workflows classify correctly", () => {
    for (const status of ["queued", "in_progress", "waiting"]) {
        assert.equal(classifyWorkflow({ selected: true, run: run({ status }) }).state, "pending");
    }
    assert.equal(classifyWorkflow({ selected: true, run: run() }).state, "success");
    for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "action_required", null]) {
        assert.equal(classifyWorkflow({ selected: true, run: run({ conclusion }) }).state, "failure");
    }
    assert.deepEqual(classifyWorkflow({ selected: true, run: null, missingExpired: false }), {
        result: "pending (awaiting run)", blocking: true, state: "pending",
    });
    assert.deepEqual(classifyWorkflow({ selected: true, run: null, missingExpired: true }), {
        result: "missing", blocking: true, state: "failure",
    });
    assert.deepEqual(classifyWorkflow({ selected: false, run: run({ conclusion: "failure" }) }), {
        result: "not selected", blocking: false, state: "neutral",
    });
});

test("aggregate waits on required checks, blocks failures, and passes only completed selected checks", () => {
    const pending = { selected: true, state: "pending" };
    const failed = { selected: true, state: "failure" };
    const passed = { selected: true, state: "success" };
    const skipped = { selected: false, state: "neutral" };
    assert.equal(aggregateState([passed, pending, skipped]), "pending");
    assert.equal(aggregateState([passed, failed, pending]), "failure");
    assert.equal(aggregateState([passed, skipped]), "success");
});

test("missing required runs wait while another selected workflow is still running", () => {
    const selected = ["Frontend CI", "Electron E2E", "Performance"];
    assert.equal(missingRunsShouldBlock({
        eventAction: "completed",
        selectedWorkflowNames: selected,
        runsByWorkflow: new Map([
            ["Frontend CI", { status: "completed" }],
            ["Electron E2E", { status: "in_progress" }],
            ["Performance", null],
        ]),
    }), false);
    assert.equal(missingRunsShouldBlock({
        eventAction: "completed",
        selectedWorkflowNames: selected,
        runsByWorkflow: new Map([
            ["Frontend CI", { status: "completed" }],
            ["Electron E2E", { status: "completed" }],
            ["Performance", null],
        ]),
    }), true);
});

test("single report table is stable, detailed warnings stay nonblocking, and emojis are removed", () => {
    const body = renderReport({
        pullRequestNumber: 12,
        sha: "sha-current-abcdef",
        state: "success",
        checks: [{
            workflow: "PR Quality Gate",
            check: "Required workflow",
            result: "success",
            selected: true,
            blocking: false,
        }, {
            workflow: "PR Quality Gate",
            check: "High audit",
            result: "failure (warning)",
            selected: true,
            blocking: false,
        }],
        details: ["## Quality\n\n✅ PASS", "High-severity npm audit: ⚠️ warning only"],
    });

    assert.equal((body.match(/life-board-pr-report/g) ?? []).length, 1);
    assert.match(body, /\| Workflow \| Check \| Result \| Selected \| Blocking \|/);
    assert.match(body, /High-severity npm audit:  warning only/);
    assert.doesNotMatch(body, /\p{Extended_Pictographic}/u);
    assert.equal(stripEmojis("ok ✅ warn ⚠️"), "ok  warn ");
});

function coverage(lines, total = 100) {
    const count = { covered: lines, total };
    return { lines: count, statements: count, functions: count, branches: count };
}

function qualityReport(overrides = {}) {
    return {
        status: "pass",
        baseline: {
            label: "main@abc measured on this runner",
            coverage: { projects: { api: coverage(80), web: coverage(90) } },
            duplication: { duplicatedLines: 3, totalLines: 100, fragments: 2 },
            violations: { qualityRuleViolations: 0, oversizedFiles: 1, oversizedFunctions: 0 },
        },
        metrics: {
            coverage: { projects: { api: coverage(82), web: coverage(90) } },
            diffCoverage: {
                evaluated: true,
                minPercent: 80,
                covered: 9,
                total: 10,
                files: [
                    { filePath: "api/src/<img>|@user.ts", covered: 4, total: 5, uncoveredLines: [7, 3, 4] },
                    { filePath: "api/src/types.ts", covered: 0, total: 0, uncoveredLines: [] },
                ],
            },
            duplication: { duplicatedLines: 2, totalLines: 100, fragments: 2 },
            violations: { qualityRuleViolations: 0, oversizedFiles: 0, oversizedFunctions: 0 },
            testMarkers: { violations: [] },
        },
        comparison: { passed: true, failures: [], regressions: [] },
        ...overrides,
    };
}

test("quality section compares baseline and current in coverage, duplication, violations, and regressions tables", () => {
    const body = renderQualitySection(qualityReport()).join("\n");

    for (const heading of ["Coverage", "Duplication", "Violations", "Regressions"]) {
        assert.match(body, new RegExp(`^#### ${heading}$`, "m"));
    }
    assert.match(body, /baseline: main&#64;abc measured on this runner/);
    assert.match(body, /\| Lines \| 85\.00% \| 86\.00% \| \+1\.00 pp \|/);
    assert.match(body, /\| api \| branches \| 80\.00% \| 82\.00% \| \+2\.00 pp \|/);
    assert.match(body, /Changed-line coverage: 90\.00% \(9\/10 lines\) · minimum 80%/);
    assert.match(body, /Changed files \(1\)/);
    assert.match(body, /\| api\/src\/&lt;img&gt;\\\|&#64;user\.ts \| 4\/5 \| 80\.00% \| 3-4, 7 \|/);
    assert.doesNotMatch(body, /types\.ts/);
    assert.match(body, /\| Percentage \| 3\.00% \| 2\.00% \| -1\.00 pp \|/);
    assert.match(body, /\| Oversized files \| 1 \| 0 \| -1 \|/);
    assert.match(body, /No regressions detected\./);
});

test("quality section lists failures and regressions and degrades without baseline metrics", () => {
    const failing = renderQualitySection(qualityReport({
        status: "fail",
        baseline: { label: "bootstrap" },
        comparison: { passed: false, failures: ["lines fell", "a.ts grew"], regressions: ["a.ts grew"] },
    })).join("\n");

    assert.match(failing, /\*\*FAIL\*\*/);
    assert.match(failing, /\| Lines \| n\/a \| 86\.00% \| n\/a \|/);
    assert.match(failing, /^- lines fell\n- a\.ts grew$/m);
    assert.deepEqual(renderQualitySection(null), ["### Quality gate", "", "Report not available yet."]);
    assert.match(renderQualitySection({ status: "error", error: "<b>broken</b>" }).join("\n"), /\*\*ERROR\*\* — &lt;b&gt;broken&lt;\/b&gt;/);
});

test("performance section renders one benchmark table without emojis", () => {
    const body = renderPerformanceSection({
        status: "fail",
        baseline: { label: "main@abc measured on this runner" },
        current: { policy: { maxRegressionPercent: 20 } },
        comparison: {
            results: [{
                project: "api",
                key: "benchmarks/a.bench.ts > group > case",
                baseline: { hz: 1234.567 },
                current: { hz: 900, rme: 1.596 },
                changePercent: -27.1,
                status: "fail",
            }],
            failures: ["api case regressed by 27.10%"],
        },
    }).join("\n");

    assert.match(body, /limit: 20% throughput loss/);
    assert.match(body, /\| Project \| Benchmark \| Baseline ops\/s \| Current ops\/s \| Change \| RME \| Result \|/);
    assert.match(body, /\| api \| benchmarks\/a\.bench\.ts &gt; group &gt; case \| 1,234\.57 \| 900\.00 \| -27\.10% \| 1\.60% \| Fail \|/);
    assert.match(body, /^- api case regressed by 27\.10%$/m);
    assert.doesNotMatch(body, /\p{Extended_Pictographic}/u);
    assert.match(renderPerformanceSection({ status: "pass", comparison: { results: [] } }).join("\n"), /no microbenchmark ran/);
});

test("report includes gate sections only when the caller fetched the gate reports", () => {
    const base = { pullRequestNumber: 12, sha: "sha", state: "pending", checks: [] };

    assert.doesNotMatch(renderReport(base), /### Quality gate/);
    const body = renderReport({ ...base, quality: qualityReport(), performance: null });
    assert.match(body, /### Quality gate[\s\S]*### Performance\n\nReport not available yet\./);
});

const repositoryRoot = path.resolve(__dirname, "..");
const protectedPolicy = JSON.parse(fs.readFileSync(path.join(__dirname, "protected-paths.json"), "utf8"));

test("protected paths match exact files and whole directories, including both sides of a rename", () => {
    const policy = { schemaVersion: 1, paths: ["scripts/quality-gate.js", "web/benchmarks/**"] };
    const entries = protectedPathEntries(policy);

    assert.equal(isProtectedPath("scripts/quality-gate.js", entries), true);
    assert.equal(isProtectedPath("./scripts/quality-gate.js", entries), true);
    assert.equal(isProtectedPath("scripts/quality-gate.jsx", entries), false);
    assert.equal(isProtectedPath("web/benchmarks/api-error.bench.ts", entries), true);
    assert.equal(isProtectedPath("web/benchmarks-old/x.ts", entries), false);
    assert.deepEqual(
        findProtectedChanges(["web/src/a.ts", "web/benchmarks/a.bench.ts", undefined, "scripts/quality-gate.js", "scripts/quality-gate.js"], policy),
        ["web/benchmarks/a.bench.ts", "scripts/quality-gate.js"],
    );
    assert.throws(() => protectedPathEntries({ schemaVersion: 1, paths: [] }), /non-empty paths/);
    assert.throws(() => protectedPathEntries({ paths: ["a"] }), /schemaVersion 1/);
});

test("the shared protected-path list is valid, self-protecting, and documented in AGENTS.md", () => {
    const entries = protectedPathEntries(protectedPolicy);
    const agents = fs.readFileSync(path.join(repositoryRoot, "AGENTS.md"), "utf8");

    assert.equal(new Set(entries).size, entries.length);
    assert.equal(isProtectedPath("scripts/protected-paths.json", entries), true);
    for (const entry of entries) {
        assert.ok(agents.includes(`\`${entry}\``), `AGENTS.md does not list \`${entry}\``);
        if (!entry.endsWith("/**")) {
            assert.ok(fs.existsSync(path.join(repositoryRoot, entry)), `${entry} does not exist`);
        }
    }
});

test("validation workflows read the shared protected-path list instead of copying it", () => {
    for (const workflow of ["quality-gate.yml", "pr-validation.yml"]) {
        const source = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", workflow), "utf8");
        assert.match(source, /scripts\/protected-paths\.json/, workflow);
        assert.doesNotMatch(source, /'scripts\/baseline\.json',|^\s+scripts\/baseline\.json$/m, workflow);
    }
});
