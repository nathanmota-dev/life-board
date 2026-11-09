"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DIFF_COVERAGE_MIN_PERCENT = 80;
const DEFAULT_BASE_CANDIDATES = ["origin/main", "main"];

class DiffCoverageInputError extends Error {
    constructor(message) {
        super(message);
        this.name = "DiffCoverageInputError";
    }
}

function runGit(args, repositoryRoot) {
    const result = spawnSync("git", args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
    });

    if (result.error) {
        throw new DiffCoverageInputError(`Could not run git ${args[0]}: ${result.error.message}`);
    }

    return result;
}

// Lines added or modified on the new side of a zero-context unified diff, keyed
// by the repository-relative path of the new file.
function parseUnifiedDiff(diffText) {
    const changedLines = {};
    let currentFile = null;

    for (const line of diffText.split("\n")) {
        if (line.startsWith("+++ ")) {
            const target = line.slice(4).trim();
            currentFile = target === "/dev/null" ? null : target.replace(/^b\//, "");
            continue;
        }

        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);

        if (hunk && currentFile) {
            const start = Number(hunk[1]);
            const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
            const lines = changedLines[currentFile] ?? new Set();

            for (let offset = 0; offset < count; offset += 1) {
                lines.add(start + offset);
            }

            changedLines[currentFile] = lines;
        }
    }

    return Object.fromEntries(Object.entries(changedLines)
        .filter(([, lines]) => lines.size > 0)
        .sort(([left], [right]) => left.localeCompare(right)));
}

function countFileLines(absolutePath) {
    const contents = fs.readFileSync(absolutePath, "utf8");

    if (contents.length === 0) {
        return 0;
    }

    const lines = contents.split(/\r\n|\r|\n/).length;
    return /(\r\n|\r|\n)$/.test(contents) ? lines - 1 : lines;
}

function resolveDiffBase({ repositoryRoot, environment = process.env }) {
    const explicit = environment.QUALITY_GATE_DIFF_BASE;

    if (explicit) {
        const verified = runGit(["rev-parse", "--verify", "--quiet", `${explicit}^{commit}`], repositoryRoot);

        if (verified.status !== 0) {
            throw new DiffCoverageInputError(`QUALITY_GATE_DIFF_BASE does not name a commit: ${explicit}`);
        }

        return { ref: explicit, sha: verified.stdout.trim() };
    }

    for (const candidate of DEFAULT_BASE_CANDIDATES) {
        const mergeBase = runGit(["merge-base", "HEAD", candidate], repositoryRoot);

        if (mergeBase.status === 0 && mergeBase.stdout.trim()) {
            return { ref: `merge-base(HEAD, ${candidate})`, sha: mergeBase.stdout.trim() };
        }
    }

    return null;
}

// Compares the working tree with the base commit, so local runs include
// uncommitted and untracked source files exactly as the coverage run saw them.
function collectChangedLines({ repositoryRoot, baseSha, sourceRoots }) {
    const diff = runGit([
        "diff",
        "--unified=0",
        "--no-color",
        "--no-ext-diff",
        "--find-renames",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        baseSha,
        "--",
        ...sourceRoots,
    ], repositoryRoot);

    if (diff.status !== 0) {
        throw new DiffCoverageInputError(`git diff against ${baseSha} failed: ${diff.stderr.trim()}`);
    }

    const changedLines = parseUnifiedDiff(diff.stdout);
    const untracked = runGit(["ls-files", "--others", "--exclude-standard", "--", ...sourceRoots], repositoryRoot);

    if (untracked.status !== 0) {
        throw new DiffCoverageInputError(`git ls-files failed: ${untracked.stderr.trim()}`);
    }

    for (const relativePath of untracked.stdout.split("\n").map((value) => value.trim()).filter(Boolean)) {
        const lineCount = countFileLines(path.join(repositoryRoot, relativePath));
        changedLines[relativePath] = new Set(Array.from({ length: lineCount }, (_, index) => index + 1));
    }

    return changedLines;
}

// Istanbul line coverage: a line's hit count is the highest count of the
// statements that start on it, matching FileCoverage.getLineCoverage().
function lineHitsFromIstanbul(fileCoverage, label) {
    if (!fileCoverage || typeof fileCoverage.statementMap !== "object" || typeof fileCoverage.s !== "object") {
        throw new DiffCoverageInputError(`${label} is not an Istanbul file coverage entry.`);
    }

    const hits = new Map();

    for (const [statementId, location] of Object.entries(fileCoverage.statementMap)) {
        const line = location?.start?.line;
        const count = fileCoverage.s[statementId];

        if (!Number.isInteger(line) || !Number.isFinite(count)) {
            throw new DiffCoverageInputError(`${label} statement ${statementId} is malformed.`);
        }

        hits.set(line, Math.max(hits.get(line) ?? 0, count));
    }

    return hits;
}

function readCoverageFinal(project, repositoryRoot) {
    const coveragePath = path.join(repositoryRoot, project, "coverage", "coverage-final.json");
    let report;

    try {
        report = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
    } catch (error) {
        throw new DiffCoverageInputError(`Could not read ${project} line coverage at ${coveragePath}: ${error.message}`);
    }

    if (!report || typeof report !== "object" || Array.isArray(report)) {
        throw new DiffCoverageInputError(`${project} line coverage must be an object.`);
    }

    const files = {};

    for (const [reportedPath, fileCoverage] of Object.entries(report)) {
        const absolutePath = path.isAbsolute(reportedPath)
            ? reportedPath
            : path.resolve(repositoryRoot, project, reportedPath);
        const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
        files[relativePath] = lineHitsFromIstanbul(fileCoverage, `${project} coverage for ${relativePath}`);
    }

    return files;
}

// LCOV is what `cargo llvm-cov` writes: `SF:` opens a file and `DA:line,hits` follows.
function parseLcov(contents, repositoryRoot) {
    const files = {};
    let current = null;

    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (line.startsWith("SF:")) {
            const absolutePath = path.resolve(repositoryRoot, line.slice(3));
            current = new Map();
            files[path.relative(repositoryRoot, absolutePath).split(path.sep).join("/")] = current;
        } else if (line.startsWith("DA:") && current) {
            const [lineNumber, hits] = line.slice(3).split(",").map(Number);

            if (!Number.isInteger(lineNumber) || !Number.isFinite(hits)) {
                throw new DiffCoverageInputError(`Malformed LCOV record: ${line}`);
            }

            current.set(lineNumber, Math.max(current.get(lineNumber) ?? 0, hits));
        } else if (line === "end_of_record") {
            current = null;
        }
    }

    return files;
}

function readLcov(project, repositoryRoot) {
    const coveragePath = path.join(repositoryRoot, "coverage", project, "lcov.info");

    try {
        return parseLcov(fs.readFileSync(coveragePath, "utf8"), repositoryRoot);
    } catch (error) {
        if (error instanceof DiffCoverageInputError) {
            throw error;
        }

        throw new DiffCoverageInputError(`Could not read ${project} line coverage at ${coveragePath}: ${error.message}`);
    }
}

function readProjectLineHits(project, repositoryRoot) {
    return project.format === "lcov"
        ? readLcov(project.name, repositoryRoot)
        : readCoverageFinal(project.name, repositoryRoot);
}

// Only executable lines count: a changed line without a statement (a comment,
// a type, a closing brace) is neither covered nor uncovered.
function computeDiffCoverage(changedLines, lineHitsByFile) {
    const files = [];

    for (const [filePath, lines] of Object.entries(changedLines)) {
        const hits = lineHitsByFile[filePath];

        if (!hits) {
            continue;
        }

        const executable = [...lines].filter((line) => hits.has(line)).sort((left, right) => left - right);

        if (executable.length === 0) {
            continue;
        }

        const uncoveredLines = executable.filter((line) => hits.get(line) === 0);
        files.push({
            filePath,
            covered: executable.length - uncoveredLines.length,
            total: executable.length,
            uncoveredLines,
        });
    }

    files.sort((left, right) => left.filePath.localeCompare(right.filePath));

    return {
        covered: files.reduce((sum, file) => sum + file.covered, 0),
        total: files.reduce((sum, file) => sum + file.total, 0),
        files,
    };
}

function formatLineRanges(lines) {
    const ranges = [];

    for (const line of lines) {
        const last = ranges[ranges.length - 1];

        if (last && line === last[1] + 1) {
            last[1] = line;
        } else {
            ranges.push([line, line]);
        }
    }

    return ranges.map(([start, end]) => (start === end ? String(start) : `${start}-${end}`)).join(", ");
}

function collectDiffCoverage({ repositoryRoot, projects, sourceRoots, coverageScope, environment = process.env }) {
    const base = resolveDiffBase({ repositoryRoot, environment });

    if (!base) {
        if (environment.CI === "true") {
            throw new DiffCoverageInputError("Diff coverage needs QUALITY_GATE_DIFF_BASE in CI.");
        }

        return {
            evaluated: false,
            reason: "No base commit found (set QUALITY_GATE_DIFF_BASE or fetch origin/main).",
            minPercent: DIFF_COVERAGE_MIN_PERCENT,
        };
    }

    const inScope = new Set(coverageScope);
    const changedLines = Object.fromEntries(Object.entries(collectChangedLines({
        repositoryRoot,
        baseSha: base.sha,
        sourceRoots,
    })).filter(([filePath]) => inScope.has(filePath)));
    const changedProjects = projects.filter((project) => Object.keys(changedLines)
        .some((filePath) => filePath.startsWith(`${project.sourceRoot}/`)));
    const lineHitsByFile = Object.assign({}, ...changedProjects.map((project) => readProjectLineHits(project, repositoryRoot)));
    const missing = Object.keys(changedLines).filter((filePath) => !lineHitsByFile[filePath]);

    if (missing.length > 0) {
        throw new DiffCoverageInputError(`Line coverage is missing for changed files: ${missing.join(", ")}`);
    }

    return {
        evaluated: true,
        base: { ref: base.ref, sha: base.sha.slice(0, 12) },
        minPercent: DIFF_COVERAGE_MIN_PERCENT,
        changedFiles: Object.keys(changedLines).length,
        ...computeDiffCoverage(changedLines, lineHitsByFile),
    };
}

function diffCoverageFailure(diffCoverage) {
    if (!diffCoverage?.evaluated || diffCoverage.total === 0) {
        return null;
    }

    if (diffCoverage.covered * 100 >= diffCoverage.minPercent * diffCoverage.total) {
        return null;
    }

    const percent = (diffCoverage.covered / diffCoverage.total) * 100;
    return `Changed-line coverage is ${percent.toFixed(2)}% (${diffCoverage.covered}/${diffCoverage.total} executable lines); at least ${diffCoverage.minPercent}% is required.`;
}

module.exports = {
    DIFF_COVERAGE_MIN_PERCENT,
    DiffCoverageInputError,
    collectChangedLines,
    collectDiffCoverage,
    computeDiffCoverage,
    diffCoverageFailure,
    formatLineRanges,
    lineHitsFromIstanbul,
    parseLcov,
    parseUnifiedDiff,
    resolveDiffBase,
};
