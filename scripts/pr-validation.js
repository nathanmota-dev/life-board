"use strict";

const WORKFLOWS = [
    { name: "Frontend CI", key: "web", always: true, check: "audit, lint, typecheck, unit, coverage" },
    { name: "Rust CI", key: "rust", check: "format, clippy, tests on Linux, Windows and macOS" },
    { name: "Electron E2E", key: "e2e", always: true, check: "Playwright E2E" },
    { name: "PR Quality Gate", key: "quality", always: true, check: "audits, coverage, quality metrics" },
    { name: "Performance", key: "performance", always: true, check: "microbenchmarks and 20% gate" },
];

const INFRASTRUCTURE_LABEL = "validation-infrastructure-approved";
// The Rust rewrite replaces the API and its validation commands in one merge.
// Remove this entry once that branch has landed.
const INFRASTRUCTURE_BRANCHES = ["refactor/rewrite-rust-app"];

function normalizePath(filePath) {
    return String(filePath).replaceAll("\\", "/").replace(/^\.\//, "");
}

function isRustPath(filePath) {
    return filePath.startsWith("src-tauri/")
        || ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "rustfmt.toml", "clippy.toml"].includes(filePath);
}

function selectChangedAreas(files) {
    const paths = files.map(normalizePath);
    const bothForPolicy = paths.some((filePath) => filePath === ".github/workflows/performance.yml"
        || /^scripts\/(benchmark-|run-rust-benchmark)/.test(filePath)
        || filePath === "scripts/benchmark-baseline.json");
    const rust = paths.some((filePath) => isRustPath(filePath) || filePath === ".github/workflows/rust-ci.yml");
    const api = bothForPolicy || paths.some((filePath) => filePath.startsWith("api/") || isRustPath(filePath));
    const web = bothForPolicy || paths.some((filePath) => filePath.startsWith("web/")
        || filePath === ".github/workflows/frontend-ci.yml");
    return { api, web, rust };
}

function selectBenchmarks(files) {
    const areas = selectChangedAreas(files);
    return ["api", "web"].filter((project) => areas[project]);
}

function selectWorkflows(files) {
    const areas = selectChangedAreas(files);
    return Object.fromEntries(WORKFLOWS.map((workflow) => [
        workflow.name,
        workflow.always ?? areas[workflow.key],
    ]));
}

// Maintainers approve a validation-infrastructure change with a label, and only
// from a same-repository ci/ branch, so ordinary and fork PRs stay blocked.
function isApprovedInfrastructureChange({ labels = [], headBranch = "", headRepository = "", repository = "" }) {
    return labels.includes(INFRASTRUCTURE_LABEL)
        && headRepository === repository
        && (headBranch.startsWith("ci/") || INFRASTRUCTURE_BRANCHES.includes(headBranch));
}

function protectedPathEntries(policy) {
    if (!policy || policy.schemaVersion !== 1 || !Array.isArray(policy.paths) || policy.paths.length === 0
        || policy.paths.some((entry) => typeof entry !== "string" || !entry || entry.includes("\\"))) {
        throw new Error("Protected paths must be a schemaVersion 1 object with a non-empty paths string array.");
    }
    return policy.paths.map(normalizePath);
}

function isProtectedPath(filePath, entries) {
    const normalized = normalizePath(filePath);
    return entries.some((entry) => (entry.endsWith("/**")
        ? normalized.startsWith(entry.slice(0, -2))
        : normalized === entry));
}

function findProtectedChanges(files, policy) {
    const entries = protectedPathEntries(policy);
    return [...new Set(files.filter(Boolean).map(normalizePath))]
        .filter((filePath) => isProtectedPath(filePath, entries));
}

function belongsToPullRequest(run, pullRequestNumber, headSha) {
    return (run.pull_requests ?? []).some((pullRequest) => pullRequest.number === pullRequestNumber
        && pullRequest.head?.sha === headSha);
}

function attemptTimestamp(run) {
    return Date.parse(run.run_started_at ?? run.created_at ?? "") || 0;
}

function compareAttempts(left, right) {
    return attemptTimestamp(right) - attemptTimestamp(left)
        || (right.run_number ?? 0) - (left.run_number ?? 0)
        || (right.run_attempt ?? 1) - (left.run_attempt ?? 1)
        || (right.id ?? 0) - (left.id ?? 0);
}

function selectLatestRun(runs, pullRequestNumber, headSha) {
    const matching = runs.filter((run) => belongsToPullRequest(run, pullRequestNumber, headSha));
    const latestAttemptByRunId = new Map();
    for (const run of matching) {
        const current = latestAttemptByRunId.get(run.id);
        if (!current || (run.run_attempt ?? 1) > (current.run_attempt ?? 1)) {
            latestAttemptByRunId.set(run.id, run);
        }
    }
    return [...latestAttemptByRunId.values()].sort(compareAttempts)[0] ?? null;
}

function classifyWorkflow({ selected, run, missingExpired = false }) {
    if (!selected) {
        return { result: "not selected", blocking: false, state: "neutral" };
    }
    if (!run) {
        return missingExpired
            ? { result: "missing", blocking: true, state: "failure" }
            : { result: "pending (awaiting run)", blocking: true, state: "pending" };
    }
    if (run.status !== "completed") {
        return { result: run.status || "pending", blocking: true, state: "pending" };
    }
    if (run.conclusion === "success") {
        return { result: "success", blocking: false, state: "success" };
    }
    return {
        result: run.conclusion || "unknown",
        blocking: true,
        state: "failure",
    };
}

function aggregateState(checks) {
    if (checks.some((check) => check.selected && check.state === "failure")) return "failure";
    if (checks.some((check) => check.selected && check.state === "pending")) return "pending";
    return "success";
}

function missingRunsShouldBlock({ eventAction, runsByWorkflow, selectedWorkflowNames }) {
    if (eventAction !== "completed") return false;
    return !selectedWorkflowNames.some((workflowName) => {
        const run = runsByWorkflow.get(workflowName);
        return run && run.status !== "completed";
    });
}

function stripEmojis(value) {
    return String(value)
        .replace(/\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu, "")
        .replace(/[0-9#*]\uFE0F?\u20E3/gu, "")
        .replace(/\u200D|\uFE0F|\uFE0E/g, "");
}

function escapeCell(value) {
    return String(value).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
}

function renderWorkflowTable(checks) {
    const lines = [
        "| Workflow | Check | Result | Selected | Blocking |",
        "|---|---|---|---:|---:|",
    ];
    for (const check of checks) {
        lines.push(`| ${escapeCell(check.workflow)} | ${escapeCell(check.check)} | ${escapeCell(check.result)} | ${check.selected ? "Yes" : "No"} | ${check.blocking ? "Yes" : "No"} |`);
    }
    return lines.join("\n");
}

// Gate reports come from pull-request artifacts, so every string is untrusted.
function escapeText(value) {
    return escapeCell(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("@", "&#64;")
        .replaceAll("`", "\\`");
}

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function ratioPercent(part, whole) {
    return isNumber(part) && isNumber(whole) && whole > 0 ? (part / whole) * 100 : null;
}

function formatPercent(value) {
    return isNumber(value) ? `${(Math.floor((value + Number.EPSILON) * 100) / 100).toFixed(2)}%` : "n/a";
}

function formatPointDelta(current, baseline) {
    if (!isNumber(current) || !isNumber(baseline)) return "n/a";
    const difference = current - baseline;
    if (difference !== 0 && Math.abs(difference) < 0.005) return `${difference > 0 ? "+" : "-"}<0.01 pp`;
    return `${difference >= 0 ? "+" : ""}${difference.toFixed(2)} pp`;
}

function formatCount(value) {
    return isNumber(value) ? String(value) : "n/a";
}

function formatCountDelta(current, baseline) {
    if (!isNumber(current) || !isNumber(baseline)) return "n/a";
    return `${current >= baseline ? "+" : ""}${current - baseline}`;
}

function coveragePercent(count) {
    return ratioPercent(count?.covered, count?.total);
}

function totalCoverage(projects, metric) {
    const counts = Object.values(projects ?? {}).map((project) => project?.[metric]);
    if (counts.length === 0 || counts.some((count) => !isNumber(count?.covered) || !isNumber(count?.total))) return null;
    return counts.reduce((sum, count) => ({
        covered: sum.covered + count.covered,
        total: sum.total + count.total,
    }), { covered: 0, total: 0 });
}

function formatLineRanges(lines) {
    const ranges = [];
    for (const line of [...new Set(lines.filter(Number.isInteger))].sort((left, right) => left - right)) {
        const last = ranges.at(-1);
        if (last && line === last[1] + 1) last[1] = line;
        else ranges.push([line, line]);
    }
    return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(", ");
}

function gateStatus(report) {
    return escapeText(String(report.status ?? "unknown").toUpperCase());
}

// Returns the section body when the report cannot be rendered as tables.
function unavailableReport(report) {
    if (!report || typeof report !== "object") return "Report not available yet.";
    if (report.status === "error") return `**ERROR** — ${escapeText(report.error ?? "the report could not be read")}`;
    return null;
}

const METRIC_TABLE_HEADER = ["| Metric | Baseline | Current | Increase |", "|---|---:|---:|---:|"];
const COVERAGE_METRICS = ["lines", "statements", "functions", "branches"];
const MAX_FILE_ROWS = 50;

function capitalize(value) {
    return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function coverageRow(label, current, baseline) {
    const currentPercent = coveragePercent(current);
    const baselinePercent = coveragePercent(baseline);
    return `| ${label} | ${formatPercent(baselinePercent)} | ${formatPercent(currentPercent)} | ${formatPointDelta(currentPercent, baselinePercent)} |`;
}

function countRow(label, current, baseline) {
    return `| ${label} | ${formatCount(baseline)} | ${formatCount(current)} | ${formatCountDelta(current, baseline)} |`;
}

function renderPackageCoverage(baselineProjects, currentProjects) {
    const projects = Object.keys(currentProjects ?? {});
    if (projects.length === 0) return [];
    const rows = projects.flatMap((project) => COVERAGE_METRICS.map((metric) => {
        const current = currentProjects[project]?.[metric];
        const baseline = baselineProjects?.[project]?.[metric];
        const currentPercent = coveragePercent(current);
        const baselinePercent = coveragePercent(baseline);
        return `| ${escapeText(project)} | ${metric} | ${formatPercent(baselinePercent)} | ${formatPercent(currentPercent)} | ${formatPointDelta(currentPercent, baselinePercent)} |`;
    }));
    return [
        "",
        "<details>",
        "<summary>Coverage by package</summary>",
        "",
        "| Package | Metric | Baseline | Current | Increase |",
        "|---|---|---:|---:|---:|",
        ...rows,
        "",
        "</details>",
    ];
}

function renderChangedLineCoverage(diffCoverage) {
    if (!diffCoverage?.evaluated) return ["", "Changed-line coverage: not evaluated."];
    const summary = diffCoverage.total === 0
        ? "no executable production lines changed"
        : `${formatPercent(ratioPercent(diffCoverage.covered, diffCoverage.total))} (${formatCount(diffCoverage.covered)}/${formatCount(diffCoverage.total)} lines)`;
    const files = (Array.isArray(diffCoverage.files) ? diffCoverage.files : [])
        .filter((file) => isNumber(file?.total) && file.total > 0);
    const lines = ["", `Changed-line coverage: ${summary} · minimum ${formatCount(diffCoverage.minPercent)}%`];
    if (files.length === 0) return lines;
    const shown = files.slice(0, MAX_FILE_ROWS);
    lines.push(
        "",
        "<details>",
        `<summary>Changed files (${files.length})</summary>`,
        "",
        "| File | Covered | Coverage | Uncovered lines |",
        "|---|---:|---:|---|",
        ...shown.map((file) => {
            const uncovered = formatLineRanges(Array.isArray(file.uncoveredLines) ? file.uncoveredLines : []);
            return `| ${escapeText(file.filePath)} | ${formatCount(file.covered)}/${file.total} | ${formatPercent(ratioPercent(file.covered, file.total))} | ${uncovered || "—"} |`;
        }),
    );
    if (files.length > shown.length) lines.push("", `${files.length - shown.length} more file(s) in the workflow artifact.`);
    lines.push("", "</details>");
    return lines;
}

function renderRegressions(comparison) {
    const items = [comparison?.failures, comparison?.regressions]
        .flatMap((list) => (Array.isArray(list) ? list : []));
    const unique = [...new Set(items.map(String))];
    return unique.length ? unique.map((item) => `- ${escapeText(item)}`) : ["No regressions detected."];
}

function renderQualitySection(report) {
    const unavailable = unavailableReport(report);
    if (unavailable) return ["### Quality gate", "", unavailable];
    const baseline = report.baseline ?? {};
    const metrics = report.metrics ?? {};
    const duplicationPercent = (value) => ratioPercent(value?.duplicatedLines, value?.totalLines);
    const baselineDuplication = duplicationPercent(baseline.duplication);
    const currentDuplication = duplicationPercent(metrics.duplication);
    return [
        "### Quality gate",
        "",
        `**${gateStatus(report)}** · baseline: ${escapeText(baseline.label ?? "unknown")}`,
        "",
        "#### Coverage",
        "",
        ...METRIC_TABLE_HEADER,
        ...COVERAGE_METRICS.map((metric) => coverageRow(
            capitalize(metric),
            totalCoverage(metrics.coverage?.projects, metric),
            totalCoverage(baseline.coverage?.projects, metric),
        )),
        ...renderPackageCoverage(baseline.coverage?.projects, metrics.coverage?.projects),
        ...renderChangedLineCoverage(metrics.diffCoverage),
        "",
        "#### Duplication",
        "",
        ...METRIC_TABLE_HEADER,
        `| Percentage | ${formatPercent(baselineDuplication)} | ${formatPercent(currentDuplication)} | ${formatPointDelta(currentDuplication, baselineDuplication)} |`,
        countRow("Fragments", metrics.duplication?.fragments, baseline.duplication?.fragments),
        "",
        "#### Violations",
        "",
        ...METRIC_TABLE_HEADER,
        countRow("Quality rule violations", metrics.violations?.qualityRuleViolations, baseline.violations?.qualityRuleViolations),
        countRow("Oversized files", metrics.violations?.oversizedFiles, baseline.violations?.oversizedFiles),
        countRow("Oversized functions", metrics.violations?.oversizedFunctions, baseline.violations?.oversizedFunctions),
        `| Forbidden test markers | n/a | ${formatCount(metrics.testMarkers?.violations?.length)} | n/a |`,
        "",
        "#### Regressions",
        "",
        ...renderRegressions(report.comparison),
    ];
}

function formatOpsPerSecond(value) {
    return isNumber(value) ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a";
}

function formatChangePercent(value) {
    return isNumber(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "n/a";
}

function formatResult(status) {
    const text = String(status ?? "unknown");
    return escapeText(`${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`);
}

function renderBenchmarkRow(result) {
    return `| ${escapeText(result?.project ?? "unknown")} | ${escapeText(result?.key ?? "unknown")} | ${formatOpsPerSecond(result?.baseline?.hz)} | ${formatOpsPerSecond(result?.current?.hz)} | ${formatChangePercent(result?.changePercent)} | ${isNumber(result?.current?.rme) ? `${result.current.rme.toFixed(2)}%` : "n/a"} | ${formatResult(result?.status)} |`;
}

function renderPerformanceSection(report) {
    const unavailable = unavailableReport(report);
    if (unavailable) return ["### Performance", "", unavailable];
    const results = Array.isArray(report.comparison?.results) ? report.comparison.results : [];
    const limit = report.current?.policy?.maxRegressionPercent;
    const lines = [
        "### Performance",
        "",
        `**${gateStatus(report)}** · baseline: ${escapeText(report.baseline?.label ?? "unknown")} · limit: ${isNumber(limit) ? `${limit}%` : "n/a"} throughput loss`,
        "",
    ];
    if (results.length === 0) {
        lines.push("No benchmark-relevant files changed, so no microbenchmark ran for this PR.");
    } else {
        lines.push(
            "| Project | Benchmark | Baseline ops/s | Current ops/s | Change | RME | Result |",
            "|---|---|---:|---:|---:|---:|---|",
            ...results.map(renderBenchmarkRow),
        );
    }
    const failures = Array.isArray(report.comparison?.failures) ? report.comparison.failures : [];
    if (failures.length) lines.push("", ...failures.map((failure) => `- ${escapeText(failure)}`));
    return lines;
}

function renderReport({ checks, state, details = [], sha, pullRequestNumber, quality, performance }) {
    const title = state === "success" ? "PASS" : state === "failure" ? "FAIL" : "PENDING";
    const sections = [
        "<!-- life-board-pr-report -->",
        `# PR Validation: ${title}`,
        "",
        `PR #${pullRequestNumber} · commit \`${String(sha).slice(0, 12)}\``,
        "",
        renderWorkflowTable(checks),
    ];
    const nonemptyDetails = details.map(stripEmojis).map((detail) => detail.trim()).filter(Boolean);
    if (nonemptyDetails.length) {
        sections.push("", "## Quality and performance details", "", ...nonemptyDetails);
    }
    // Gate tables are rendered only by callers that fetched the gate reports.
    if (quality !== undefined || performance !== undefined) {
        sections.push(
            "",
            ...renderQualitySection(quality).map(stripEmojis),
            "",
            ...renderPerformanceSection(performance).map(stripEmojis),
        );
    }
    return sections.join("\n").slice(0, 60000);
}

module.exports = {
    INFRASTRUCTURE_BRANCHES,
    INFRASTRUCTURE_LABEL,
    WORKFLOWS,
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
    renderWorkflowTable,
    selectBenchmarks,
    selectChangedAreas,
    selectLatestRun,
    selectWorkflows,
    stripEmojis,
};
