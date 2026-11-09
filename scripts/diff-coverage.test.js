"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const {
    collectDiffCoverage,
    computeDiffCoverage,
    diffCoverageFailure,
    formatLineRanges,
    lineHitsFromIstanbul,
    parseLcov,
    parseUnifiedDiff,
} = require("./diff-coverage.js");

function git(repositoryRoot, ...args) {
    const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function write(repositoryRoot, relativePath, contents) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents, "utf8");
}

function statementCoverage(hitsByLine) {
    const entries = Object.entries(hitsByLine);
    return {
        statementMap: Object.fromEntries(entries.map(([line], index) => [
            String(index),
            { start: { line: Number(line), column: 0 }, end: { line: Number(line), column: 10 } },
        ])),
        s: Object.fromEntries(entries.map(([, hits], index) => [String(index), hits])),
    };
}

test("parseUnifiedDiff keeps only added lines on the new side, including pure insertions", () => {
    const diff = [
        "diff --git a/api/src/a.ts b/api/src/a.ts",
        "--- a/api/src/a.ts",
        "+++ b/api/src/a.ts",
        "@@ -2,0 +3,2 @@",
        "+one",
        "+two",
        "@@ -10 +12 @@",
        "-old",
        "+new",
        "@@ -20,3 +21,0 @@",
        "diff --git a/api/src/gone.ts b/api/src/gone.ts",
        "--- a/api/src/gone.ts",
        "+++ /dev/null",
        "@@ -1,2 +0,0 @@",
    ].join("\n");

    assert.deepEqual(parseUnifiedDiff(diff), { "api/src/a.ts": new Set([3, 4, 12]) });
});

test("line hits use the highest count of the statements that start on a line", () => {
    const hits = lineHitsFromIstanbul({
        statementMap: {
            0: { start: { line: 1 } },
            1: { start: { line: 1 } },
            2: { start: { line: 2 } },
        },
        s: { 0: 0, 1: 3, 2: 0 },
    }, "fixture");

    assert.deepEqual([...hits.entries()], [[1, 3], [2, 0]]);
    assert.throws(() => lineHitsFromIstanbul({ statementMap: { 0: {} }, s: { 0: 1 } }, "bad"), /malformed/);
});

test("computeDiffCoverage counts only executable changed lines", () => {
    const result = computeDiffCoverage(
        {
            "api/src/a.ts": new Set([1, 2, 3, 4]),
            "api/src/types.ts": new Set([1]),
        },
        {
            "api/src/a.ts": new Map([[1, 2], [2, 0], [4, 0], [9, 0]]),
            "api/src/types.ts": new Map(),
        },
    );

    assert.equal(result.covered, 1);
    assert.equal(result.total, 3);
    assert.deepEqual(result.files, [{ filePath: "api/src/a.ts", covered: 1, total: 3, uncoveredLines: [2, 4] }]);
});

test("diffCoverageFailure applies the minimum and passes when nothing executable changed", () => {
    const evaluated = { evaluated: true, minPercent: 80, files: [] };

    assert.equal(diffCoverageFailure({ ...evaluated, covered: 0, total: 0 }), null);
    assert.equal(diffCoverageFailure({ ...evaluated, covered: 4, total: 5 }), null);
    assert.match(diffCoverageFailure({ ...evaluated, covered: 3, total: 4 }), /75\.00% \(3\/4 executable lines\)/);
    assert.equal(diffCoverageFailure({ evaluated: false }), null);
    assert.equal(formatLineRanges([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10");
});

test("parseLcov keeps the highest hit count per line and rejects malformed records", () => {
    const root = path.resolve("/repo");
    const files = parseLcov(["SF:/repo/src-tauri/crates/api/src/a.rs", "DA:1,0", "DA:1,3", "DA:2,0", "end_of_record", "DA:9,9"].join("\n"), root);

    assert.deepEqual([...files["src-tauri/crates/api/src/a.rs"].entries()], [[1, 3], [2, 0]]);
    assert.throws(() => parseLcov("SF:/repo/a.rs\nDA:x,1\n", root), /Malformed LCOV/);
});

test("collectDiffCoverage reads committed, uncommitted, and untracked source changes", (context) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "diff-coverage-"));
    context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    git(repositoryRoot, "init", "--quiet");
    git(repositoryRoot, "config", "user.email", "test@example.com");
    git(repositoryRoot, "config", "user.name", "Test");
    write(repositoryRoot, "api/src/a.ts", "const a = 1;\nconst b = 2;\n");
    write(repositoryRoot, "api/src/a.test.ts", "test('a', () => {});\n");
    git(repositoryRoot, "add", ".");
    git(repositoryRoot, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "base");
    const baseSha = git(repositoryRoot, "rev-parse", "HEAD");

    write(repositoryRoot, "api/src/a.ts", "const a = 1;\nconst b = 3;\nconst c = 4;\n");
    write(repositoryRoot, "api/src/a.test.ts", "test('a', () => { expect(1).toBe(1); });\n");
    write(repositoryRoot, "api/src/new.ts", "export const x = 1;\n");
    write(repositoryRoot, "api/coverage/coverage-final.json", JSON.stringify({
        [path.join(repositoryRoot, "api/src/a.ts")]: statementCoverage({ 1: 1, 2: 1, 3: 0 }),
        [path.join(repositoryRoot, "api/src/new.ts")]: statementCoverage({ 1: 1 }),
    }));

    const result = collectDiffCoverage({
        repositoryRoot,
        projects: [{ name: "api", sourceRoot: "api/src", format: "istanbul" }, { name: "web", sourceRoot: "web/src", format: "istanbul" }],
        sourceRoots: ["api/src"],
        coverageScope: ["api/src/a.ts", "api/src/new.ts"],
        environment: { QUALITY_GATE_DIFF_BASE: baseSha },
    });

    assert.equal(result.evaluated, true);
    assert.equal(result.changedFiles, 2);
    assert.equal(result.covered, 2);
    assert.equal(result.total, 3);
    assert.deepEqual(result.files.map((file) => [file.filePath, file.uncoveredLines]), [
        ["api/src/a.ts", [3]],
        ["api/src/new.ts", []],
    ]);
});

test("collectDiffCoverage requires an explicit base in CI and skips locally without one", (context) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "diff-coverage-nobase-"));
    context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    git(repositoryRoot, "init", "--quiet");
    const options = { repositoryRoot, projects: ["api"], sourceRoots: ["api/src"], coverageScope: [] };

    assert.equal(collectDiffCoverage({ ...options, environment: {} }).evaluated, false);
    assert.throws(() => collectDiffCoverage({ ...options, environment: { CI: "true" } }), /QUALITY_GATE_DIFF_BASE/);
    assert.throws(
        () => collectDiffCoverage({ ...options, environment: { QUALITY_GATE_DIFF_BASE: "does-not-exist" } }),
        /does not name a commit/,
    );
});
