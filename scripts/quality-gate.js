#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { collectDiffCoverage, diffCoverageFailure, formatLineRanges } = require("./diff-coverage.js");
const { collectTestMarkerViolations } = require("./check-test-markers.js");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASELINE_PATH = path.join(__dirname, "baseline.json");
const REPORTS_DIRECTORY = path.join(REPOSITORY_ROOT, "reports");
const QUALITY_REPORT_PATH = path.join(REPORTS_DIRECTORY, "quality-gate.md");
const QUALITY_JSON_PATH = path.join(REPORTS_DIRECTORY, "quality-gate.json");
const CANDIDATE_BASELINE_PATH = path.join(REPORTS_DIRECTORY, "candidate-baseline.json");
const COVERAGE_METRICS = ["lines", "statements", "functions", "branches"];
const PROJECT_NAMES = ["api", "desktop", "web"];
const RUST_API_SOURCE_ROOT = "src-tauri/crates/api/src";
const RUST_COVERAGE_JSON = path.join("coverage", "api", "coverage.json");
const CLIPPY_REPORT_PATH = path.join(REPORTS_DIRECTORY, "clippy", "clippy.ndjson");
// The backend keeps its absolute floor; the other packages only cannot regress.
const MINIMUM_PROJECT_COVERAGE = Object.freeze({ api: 80 });
const ESLINT_TARGETS = Object.freeze({
    api: ["api"],
    desktop: ["desktop", "e2e", "electron.vite.config.mts", "playwright.config.ts"],
    web: ["web"],
});
const MAX_PRODUCTION_FILE_LINES = 350;
const MAX_PRODUCTION_FUNCTION_LINES = 100;
// Deleting well-covered code lowers a ratio without any test getting worse, so
// coverage may move this far below the base; changed-line coverage guards the
// new code itself.
const COVERAGE_TOLERANCE_PERCENTAGE_POINTS = 0.1;
const TYPESCRIPT_PATH = path.join(REPOSITORY_ROOT, "node_modules", "typescript");

const DEFAULT_POLICY = Object.freeze({
    maxFileLines: MAX_PRODUCTION_FILE_LINES,
    maxFunctionLines: MAX_PRODUCTION_FUNCTION_LINES,
    sourceRoots: ["api/src", "desktop/src", "web/src"],
    sourceExtensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".rs"],
    excludeFiles: ["web/src/routeTree.gen.ts"],
    excludeTestsFromFileSize: true,
    duplication: {
        minLines: 5,
        minTokens: 50,
        maxLines: 10000,
        mode: "strict",
        crossFormats: "js-ts",
        ignore: [
            "**/__tests__/**",
            "**/test/**",
            "**/routeTree.gen.ts",
            "**/*.test.*",
            "**/*.spec.*",
            "**/*.d.ts",
            "**/*.d.mts",
            "**/*.d.cts",
            "**/node_modules/**",
            "**/coverage/**",
            "**/dist/**",
        ],
    },
});

class QualityGateInputError extends Error {
    constructor(message) {
        super(message);
        this.name = "QualityGateInputError";
    }
}

function ensureDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath, label = filePath) {
    let contents;

    try {
        contents = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        throw new QualityGateInputError(`Could not read ${label} at ${filePath}: ${error.message}`);
    }

    try {
        return JSON.parse(contents);
    } catch (error) {
        throw new QualityGateInputError(`${label} is not valid JSON: ${error.message}`);
    }
}

function writeJson(filePath, value) {
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new QualityGateInputError(`${label} must be an object.`);
    }
}

function assertNonNegativeInteger(value, label) {
    if (!Number.isInteger(value) || value < 0) {
        throw new QualityGateInputError(`${label} must be a non-negative integer.`);
    }
}

function assertPositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new QualityGateInputError(`${label} must be a positive integer.`);
    }
}

function assertFiniteNumber(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new QualityGateInputError(`${label} must be a non-negative finite number.`);
    }
}

function validateCoverageCount(count, label) {
    assertObject(count, label);
    assertNonNegativeInteger(count.covered, `${label}.covered`);
    assertNonNegativeInteger(count.total, `${label}.total`);

    if (count.covered > count.total) {
        throw new QualityGateInputError(`${label}.covered cannot exceed ${label}.total.`);
    }

    return { covered: count.covered, total: count.total };
}

function parseCoverageSummary(summary, label) {
    assertObject(summary, label);
    assertObject(summary.total, `${label}.total`);

    return Object.fromEntries(COVERAGE_METRICS.map((metric) => [
        metric,
        validateCoverageCount(summary.total[metric], `${label}.total.${metric}`),
    ]));
}

function aggregateCoverage(projectCoverage) {
    assertObject(projectCoverage, "project coverage");

    return Object.fromEntries(COVERAGE_METRICS.map((metric) => {
        const total = PROJECT_NAMES.reduce((result, project) => {
            const count = validateCoverageCount(
                projectCoverage[project]?.[metric],
                `coverage.projects.${project}.${metric}`,
            );

            return {
                covered: result.covered + count.covered,
                total: result.total + count.total,
            };
        }, { covered: 0, total: 0 });

        return [metric, total];
    }));
}

function percentage(count) {
    const validCount = validateCoverageCount(count, "metric count");
    return validCount.total === 0 ? 100 : (validCount.covered / validCount.total) * 100;
}

function parseEslintReports(reports) {
    assertObject(reports, "ESLint reports");
    const projects = {};

    for (const project of PROJECT_NAMES) {
        const report = reports[project];

        if (!Array.isArray(report)) {
            throw new QualityGateInputError(`ESLint report for ${project} must be an array.`);
        }

        projects[project] = report.reduce((total, result, resultIndex) => {
            assertObject(result, `ESLint ${project} result ${resultIndex}`);
            assertNonNegativeInteger(result.errorCount, `ESLint ${project} result ${resultIndex}.errorCount`);
            assertNonNegativeInteger(result.warningCount, `ESLint ${project} result ${resultIndex}.warningCount`);
            return total + result.errorCount + result.warningCount;
        }, 0);
    }

    return {
        projects,
        total: PROJECT_NAMES.reduce((total, project) => total + projects[project], 0),
    };
}

function parseJscpdReport(report) {
    assertObject(report, "JSCPD report");
    const total = report.statistics?.total ?? report.statistic?.total;
    assertObject(total, "JSCPD report total statistics");

    const totalLines = total.lines;
    const duplicatedLines = total.duplicatedLines;
    const fragments = total.clones ?? (Array.isArray(report.duplicates) ? report.duplicates.length : undefined);

    assertNonNegativeInteger(totalLines, "JSCPD total lines");
    assertNonNegativeInteger(duplicatedLines, "JSCPD duplicated lines");
    assertNonNegativeInteger(fragments, "JSCPD clone fragments");

    if (duplicatedLines > totalLines) {
        throw new QualityGateInputError("JSCPD duplicated lines cannot exceed total lines.");
    }

    assertFiniteNumber(total.percentage, "JSCPD duplication percentage");
    const computedPercentage = totalLines === 0 ? 0 : (duplicatedLines / totalLines) * 100;

    if (Math.abs(total.percentage - computedPercentage) > 0.02) {
        throw new QualityGateInputError(
            `JSCPD percentage (${total.percentage}) is inconsistent with duplicated/total lines (${computedPercentage.toFixed(2)}).`,
        );
    }

    return {
        duplicatedLines,
        totalLines,
        fragments,
    };
}

function countPhysicalLines(contents) {
    if (contents.length === 0) {
        return 0;
    }

    const normalized = contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n").length;
    return normalized.endsWith("\n") ? lines - 1 : lines;
}

function countLimitViolations(values, limit) {
    return values.filter((value) => value > limit).length;
}

// The API moves to Rust in place: the project keeps its name and changes source root.
function projectLanguages(repositoryRoot = REPOSITORY_ROOT) {
    const rust = fs.existsSync(path.join(repositoryRoot, "Cargo.toml"))
        && fs.existsSync(path.join(repositoryRoot, RUST_API_SOURCE_ROOT));
    return { api: rust ? "rust" : "typescript", desktop: "typescript", web: "typescript" };
}

function projectSourceRoot(project, languages) {
    return project === "api" && languages?.api === "rust" ? RUST_API_SOURCE_ROOT : `${project}/src`;
}

// Source roots follow the tree being measured, never the baseline that was
// produced from another commit (which may still have the other API language).
function resolvePolicy(policy, languages = projectLanguages()) {
    return { ...policy, sourceRoots: PROJECT_NAMES.map((project) => projectSourceRoot(project, languages)) };
}

function isTestFile(relativePath) {
    return /(^|\/)(__tests__|test|tests)(\/|$)/.test(relativePath)
        || /\.(test|spec)\.[^/]+$/.test(relativePath);
}

function isDeclarationFile(relativePath) {
    return /\.d\.(ts|mts|cts)$/.test(relativePath);
}

function parseCoverageFilePaths(summary, project, repositoryRoot = REPOSITORY_ROOT, relativeSourceRoot = `${project}/src`) {
    assertObject(summary, `${project} coverage summary`);

    if (!PROJECT_NAMES.includes(project)) {
        throw new QualityGateInputError(`Unknown coverage project: ${project}`);
    }

    const sourceRoot = path.resolve(repositoryRoot, relativeSourceRoot);
    const files = [];

    for (const [reportedPath, fileMetrics] of Object.entries(summary)) {
        if (reportedPath === "total") {
            continue;
        }

        assertObject(fileMetrics, `${project} coverage entry ${reportedPath}`);
        const portablePath = reportedPath.replace(/[\\/]+/g, path.sep);
        const projectPrefix = `${project}${path.sep}`;
        const absolutePath = path.isAbsolute(portablePath)
            ? path.normalize(portablePath)
            : path.resolve(
                repositoryRoot,
                portablePath.startsWith(projectPrefix) ? portablePath : path.join(project, portablePath),
            );
        const relativeToSource = path.relative(sourceRoot, absolutePath);

        if (!relativeToSource
            || relativeToSource === ".."
            || relativeToSource.startsWith(`..${path.sep}`)
            || path.isAbsolute(relativeToSource)) {
            throw new QualityGateInputError(
                `${project} coverage report contains a file outside ${relativeSourceRoot}: ${reportedPath}`,
            );
        }

        files.push(path.relative(repositoryRoot, absolutePath).split(path.sep).join("/"));
    }

    const uniqueFiles = [...new Set(files)].sort((left, right) => left.localeCompare(right));

    if (uniqueFiles.length !== files.length) {
        throw new QualityGateInputError(`${project} coverage report contains duplicate normalized file paths.`);
    }

    return uniqueFiles;
}

function rustCoverageCount(value, label) {
    assertObject(value, label);
    return validateCoverageCount({ covered: value.covered, total: value.count }, label);
}

// Stable Rust has no branch coverage: llvm reports zero branches, which the
// report shows as n/a. Regions take the place of statements.
function parseRustCoverageReport(report, repositoryRoot = REPOSITORY_ROOT) {
    assertObject(report, "Rust coverage report");
    const entry = Array.isArray(report.data) ? report.data[0] : undefined;
    assertObject(entry, "Rust coverage report data");
    assertObject(entry.totals, "Rust coverage report totals");

    if (!Array.isArray(entry.files)) {
        throw new QualityGateInputError("Rust coverage report must list its files.");
    }

    const sourceRoot = path.resolve(repositoryRoot, RUST_API_SOURCE_ROOT);
    const summary = {};

    for (const file of entry.files) {
        const absolutePath = path.resolve(repositoryRoot, String(file?.filename ?? ""));

        if (absolutePath.startsWith(`${sourceRoot}${path.sep}`)) {
            summary[absolutePath] = {};
        }
    }

    return {
        coverage: {
            lines: rustCoverageCount(entry.totals.lines, "Rust lines coverage"),
            statements: rustCoverageCount(entry.totals.regions, "Rust regions coverage"),
            functions: rustCoverageCount(entry.totals.functions, "Rust functions coverage"),
            branches: entry.totals.branches
                ? rustCoverageCount(entry.totals.branches, "Rust branches coverage")
                : { covered: 0, total: 0 },
        },
        files: parseCoverageFilePaths(summary, "api", repositoryRoot, RUST_API_SOURCE_ROOT),
    };
}

// Duplicate targets (lib and test builds) report the same diagnostic, so each
// primary span counts once. `too_many_lines` becomes the function-size metric.
function parseClippyReport(contents, sourceRoot = RUST_API_SOURCE_ROOT) {
    const seen = new Set();
    const oversizedFunctions = [];
    let violations = 0;

    for (const [index, line] of String(contents).split(/\r?\n/).entries()) {
        if (!line.trim()) {
            continue;
        }

        let item;

        try {
            item = JSON.parse(line);
        } catch (error) {
            throw new QualityGateInputError(`Clippy report line ${index + 1} is invalid JSON: ${error.message}`);
        }

        const message = item.reason === "compiler-message" ? item.message : null;
        const code = message?.code?.code;

        if (!code || !["warning", "error"].includes(message.level)) {
            continue;
        }

        const span = message.spans?.find((candidate) => candidate.is_primary) ?? message.spans?.[0];
        const key = `${code}:${span?.file_name}:${span?.line_start}:${span?.column_start}`;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);

        if (code !== "clippy::too_many_lines") {
            violations += 1;
        } else if (span?.file_name?.startsWith(`${sourceRoot}/`)) {
            oversizedFunctions.push({
                filePath: span.file_name,
                name: /\bfn\s+([A-Za-z_]\w*)/.exec(span.text?.[0]?.text ?? "")?.[1] ?? "function",
                startLine: span.line_start,
                endLine: span.line_end,
                lineCount: Number(/\((\d+)\/\d+\)/.exec(message.message)?.[1] ?? span.line_end - span.line_start + 1),
            });
        }
    }

    return { violations, oversizedFunctions };
}

function formatPathList(paths) {
    const displayed = paths.slice(0, 10);
    const suffix = paths.length > displayed.length ? `, ... (+${paths.length - displayed.length} more)` : "";
    return `${displayed.join(", ")}${suffix}`;
}

// llvm omits Rust files without executable code, such as declaration-only modules.
function rustFileHasFunctions(filePath, repositoryRoot) {
    return /\bfn\s+[A-Za-z_]/.test(fs.readFileSync(path.join(repositoryRoot, filePath), "utf8"));
}

function validateCoverageScope(coverageFiles, fileLines, { languages, repositoryRoot = REPOSITORY_ROOT } = {}) {
    assertObject(coverageFiles, "coverage file paths");
    assertObject(fileLines, "source file lines");
    const fileCounts = {};

    for (const project of PROJECT_NAMES) {
        const actual = coverageFiles[project];

        if (!Array.isArray(actual) || actual.some((filePath) => typeof filePath !== "string" || !filePath)) {
            throw new QualityGateInputError(`Coverage file paths for ${project} must be a string array.`);
        }

        const actualSet = new Set(actual);

        if (actualSet.size !== actual.length) {
            throw new QualityGateInputError(`Coverage file paths for ${project} contain duplicates.`);
        }

        const prefix = `${projectSourceRoot(project, languages)}/`;
        const expected = Object.keys(fileLines)
            .filter((filePath) => filePath.startsWith(prefix)
                && !isTestFile(filePath)
                && !isDeclarationFile(filePath)
                && (languages?.[project] !== "rust" || rustFileHasFunctions(filePath, repositoryRoot)))
            .sort((left, right) => left.localeCompare(right));
        const expectedSet = new Set(expected);
        const missing = expected.filter((filePath) => !actualSet.has(filePath));
        const unexpected = [...actualSet]
            .filter((filePath) => !expectedSet.has(filePath)
                && !(languages?.[project] === "rust" && fileLines[filePath] !== undefined))
            .sort((left, right) => left.localeCompare(right));

        if (missing.length > 0 || unexpected.length > 0) {
            const details = [];

            if (missing.length > 0) {
                details.push(`missing ${formatPathList(missing)}`);
            }

            if (unexpected.length > 0) {
                details.push(`unexpected ${formatPathList(unexpected)}`);
            }

            throw new QualityGateInputError(`Coverage scope mismatch for ${project}: ${details.join("; ")}.`);
        }

        fileCounts[project] = actual.length;
    }

    return fileCounts;
}

function collectFileSizes(policy, repositoryRoot = REPOSITORY_ROOT) {
    const extensions = new Set(policy.sourceExtensions);
    const files = {};

    function visit(absoluteDirectory) {
        const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
            .sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
            const absolutePath = path.join(absoluteDirectory, entry.name);

            if (entry.isSymbolicLink()) {
                continue;
            }

            if (entry.isDirectory()) {
                visit(absolutePath);
                continue;
            }

            if (!entry.isFile() || !extensions.has(path.extname(entry.name))) {
                continue;
            }

            const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");

            if ((policy.excludeTestsFromFileSize && isTestFile(relativePath))
                || policy.excludeFiles?.includes(relativePath)) {
                continue;
            }

            files[relativePath] = countPhysicalLines(fs.readFileSync(absolutePath, "utf8"));
        }
    }

    for (const sourceRoot of policy.sourceRoots) {
        const absoluteRoot = path.resolve(repositoryRoot, sourceRoot);

        if (!absoluteRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
            throw new QualityGateInputError(`Source root escapes the repository: ${sourceRoot}`);
        }

        if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
            throw new QualityGateInputError(`Source root does not exist: ${sourceRoot}`);
        }

        visit(absoluteRoot);
    }

    return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
}

function isFunctionNode(ts, node) {
    return ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isMethodDeclaration(node)
        || ts.isConstructorDeclaration(node)
        || ts.isGetAccessorDeclaration(node)
        || ts.isSetAccessorDeclaration(node)
        || ts.isArrowFunction(node);
}

function functionDisplayName(ts, node, sourceFile) {
    if (node.name) {
        return node.name.getText(sourceFile);
    }

    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent)) {
        return parent.name.getText(sourceFile);
    }
    return "anonymous";
}

function scanFunctionSizes(contents, filePath, typescript = require(TYPESCRIPT_PATH)) {
    const ts = typescript;
    const scriptKind = /\.(tsx|jsx)$/.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true, scriptKind);
    const diagnostics = sourceFile.parseDiagnostics ?? [];

    if (diagnostics.length > 0) {
        const diagnostic = diagnostics[0];
        const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
        throw new QualityGateInputError(`Could not parse ${filePath}:${position.line + 1}: ${message}`);
    }

    const functions = [];
    function visit(node) {
        if (isFunctionNode(ts, node) && node.body) {
            const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
            functions.push({
                filePath,
                name: functionDisplayName(ts, node, sourceFile),
                startLine,
                endLine,
                lineCount: endLine - startLine + 1,
            });
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return functions;
}

function collectFunctionSizes(policy, repositoryRoot = REPOSITORY_ROOT) {
    const functions = [];
    for (const relativePath of Object.keys(collectFileSizes(policy, repositoryRoot))) {
        // Rust function sizes come from clippy, which reads the real syntax tree.
        if (relativePath.endsWith(".rs")) {
            continue;
        }

        const absolutePath = path.join(repositoryRoot, relativePath);
        const source = fs.readFileSync(absolutePath, "utf8");
        functions.push(...scanFunctionSizes(source, relativePath));
    }
    return functions.sort((left, right) => left.filePath.localeCompare(right.filePath)
        || left.startLine - right.startLine
        || left.name.localeCompare(right.name));
}

function validatePolicy(policy) {
    assertObject(policy, "baseline.policy");
    assertPositiveInteger(policy.maxFileLines, "baseline.policy.maxFileLines");
    if (policy.maxFunctionLines !== undefined) {
        assertPositiveInteger(policy.maxFunctionLines, "baseline.policy.maxFunctionLines");
    }

    for (const [key, values] of [
        ["sourceRoots", policy.sourceRoots],
        ["sourceExtensions", policy.sourceExtensions],
    ]) {
        if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "string" || !value)) {
            throw new QualityGateInputError(`baseline.policy.${key} must be a non-empty string array.`);
        }
    }

    if (typeof policy.excludeTestsFromFileSize !== "boolean") {
        throw new QualityGateInputError("baseline.policy.excludeTestsFromFileSize must be boolean.");
    }

    assertObject(policy.duplication, "baseline.policy.duplication");
    assertPositiveInteger(policy.duplication.minLines, "baseline.policy.duplication.minLines");
    assertPositiveInteger(policy.duplication.minTokens, "baseline.policy.duplication.minTokens");
    assertPositiveInteger(policy.duplication.maxLines, "baseline.policy.duplication.maxLines");

    if (typeof policy.duplication.mode !== "string" || !policy.duplication.mode) {
        throw new QualityGateInputError("baseline.policy.duplication.mode must be a non-empty string.");
    }

    if (typeof policy.duplication.crossFormats !== "string" || !policy.duplication.crossFormats) {
        throw new QualityGateInputError("baseline.policy.duplication.crossFormats must be a non-empty string.");
    }

    if (!Array.isArray(policy.duplication.ignore)
        || policy.duplication.ignore.some((value) => typeof value !== "string" || !value)) {
        throw new QualityGateInputError("baseline.policy.duplication.ignore must be a string array.");
    }

    return policy;
}

function validateBaseline(baseline) {
    assertObject(baseline, "baseline");

    if (baseline.schemaVersion !== 1) {
        throw new QualityGateInputError(`Unsupported baseline schemaVersion: ${baseline.schemaVersion}`);
    }

    validatePolicy(baseline.policy);
    assertObject(baseline.coverage, "baseline.coverage");
    assertObject(baseline.coverage.projects, "baseline.coverage.projects");

    for (const project of PROJECT_NAMES) {
        for (const metric of COVERAGE_METRICS) {
            validateCoverageCount(
                baseline.coverage.projects[project]?.[metric],
                `baseline.coverage.projects.${project}.${metric}`,
            );
        }
    }

    assertObject(baseline.duplication, "baseline.duplication");
    assertNonNegativeInteger(baseline.duplication.duplicatedLines, "baseline.duplication.duplicatedLines");
    assertNonNegativeInteger(baseline.duplication.totalLines, "baseline.duplication.totalLines");
    assertNonNegativeInteger(baseline.duplication.fragments, "baseline.duplication.fragments");

    if (baseline.duplication.duplicatedLines > baseline.duplication.totalLines) {
        throw new QualityGateInputError("baseline.duplication.duplicatedLines cannot exceed totalLines.");
    }

    assertObject(baseline.violations, "baseline.violations");
    assertNonNegativeInteger(
        baseline.violations.qualityRuleViolations,
        "baseline.violations.qualityRuleViolations",
    );
    assertNonNegativeInteger(baseline.violations.oversizedFiles, "baseline.violations.oversizedFiles");
    if (baseline.violations.oversizedFunctions !== undefined) {
        assertNonNegativeInteger(baseline.violations.oversizedFunctions, "baseline.violations.oversizedFunctions");
    }
    assertObject(baseline.fileLines, "baseline.fileLines");

    for (const [filePath, lineCount] of Object.entries(baseline.fileLines)) {
        if (!filePath || filePath.includes("\\")) {
            throw new QualityGateInputError(`Invalid baseline file path: ${filePath}`);
        }

        assertNonNegativeInteger(lineCount, `baseline.fileLines.${filePath}`);
    }

    const oversizedFiles = Object.values(baseline.fileLines)
        .filter((lineCount) => lineCount > (baseline.policy.maxFileLines ?? MAX_PRODUCTION_FILE_LINES))
        .length;

    if (oversizedFiles !== baseline.violations.oversizedFiles) {
        throw new QualityGateInputError(
            `baseline.violations.oversizedFiles is ${baseline.violations.oversizedFiles}, but fileLines contains ${oversizedFiles}.`,
        );
    }

    return baseline;
}

function resolveNpmExecutable() {
    return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
        ...options,
    });

    if (result.error) {
        throw new QualityGateInputError(`Could not run ${command}: ${result.error.message}`);
    }

    return result;
}

function generateEslintReports(languages) {
    const eslintDirectory = path.join(REPORTS_DIRECTORY, "eslint");
    ensureDirectory(eslintDirectory);

    for (const project of PROJECT_NAMES.filter((candidate) => languages[candidate] !== "rust")) {
        const result = runCommand(resolveNpmExecutable(), [
            "exec",
            "--",
            "eslint",
            ...ESLINT_TARGETS[project],
            "--format",
            "json",
        ]);

        if (result.status !== 0 && result.status !== 1) {
            throw new QualityGateInputError(
                `ESLint report generation failed for ${project} (exit ${result.status}): ${result.stderr.trim()}`,
            );
        }

        let parsed;

        try {
            parsed = JSON.parse(result.stdout);
        } catch (error) {
            throw new QualityGateInputError(`ESLint returned invalid JSON for ${project}: ${error.message}`);
        }

        writeJson(path.join(eslintDirectory, `${project}.json`), parsed);
    }
}

function generateClippyReport() {
    ensureDirectory(path.dirname(CLIPPY_REPORT_PATH));
    const result = runCommand("cargo", [
        "clippy",
        "--workspace",
        "--all-targets",
        "--locked",
        "--message-format=json",
        "--",
        "-W",
        "clippy::too_many_lines",
    ], { maxBuffer: 200 * 1024 * 1024 });
    fs.writeFileSync(CLIPPY_REPORT_PATH, result.stdout, "utf8");

    // Denied lints exit non-zero but still produce a usable report.
    if (result.status !== 0 && !result.stdout.includes('"reason":"compiler-message"')) {
        throw new QualityGateInputError(`Clippy failed (exit ${result.status}): ${result.stderr.trim()}`);
    }
}

function generateJscpdReport(policy) {
    const binaryName = process.platform === "win32" ? "jscpd.cmd" : "jscpd";
    const binaryPath = path.join(REPOSITORY_ROOT, "node_modules", ".bin", binaryName);

    if (!fs.existsSync(binaryPath)) {
        throw new QualityGateInputError(
            `JSCPD is not installed at ${binaryPath}. Run npm ci first.`,
        );
    }

    const outputDirectory = path.join(REPORTS_DIRECTORY, "jscpd");
    ensureDirectory(outputDirectory);
    const duplicationPolicy = policy.duplication;
    const args = [
        ...policy.sourceRoots,
        "--min-lines", String(duplicationPolicy.minLines),
        "--min-tokens", String(duplicationPolicy.minTokens),
        "--max-lines", String(duplicationPolicy.maxLines),
        "--mode", duplicationPolicy.mode,
        "--cross-formats", duplicationPolicy.crossFormats,
        "--ignore", duplicationPolicy.ignore.join(","),
        "--reporters", "json,html",
        "--output", path.relative(REPOSITORY_ROOT, outputDirectory),
        "--threshold", "100",
        "--no-colors",
        "--no-tips",
    ];
    const result = runCommand(binaryPath, args);

    fs.writeFileSync(
        path.join(outputDirectory, "console.txt"),
        `${result.stdout}${result.stderr}`,
        "utf8",
    );

    if (result.status !== 0) {
        throw new QualityGateInputError(
            `JSCPD report generation failed (exit ${result.status}): ${(result.stderr || result.stdout).trim()}`,
        );
    }
}

function collectMetrics({ policy, collectToolReports = true } = {}) {
    const languages = projectLanguages();
    const validPolicy = validatePolicy(resolvePolicy(policy ?? DEFAULT_POLICY, languages));
    const rustApi = languages.api === "rust";

    if (collectToolReports) {
        generateEslintReports(languages);
        generateJscpdReport(validPolicy);

        if (rustApi) {
            generateClippyReport();
        }
    }

    const coverageReports = Object.fromEntries(PROJECT_NAMES.map((project) => {
        if (languages[project] === "rust") {
            return [project, parseRustCoverageReport(readJson(
                path.join(REPOSITORY_ROOT, RUST_COVERAGE_JSON),
                "Rust coverage report",
            ))];
        }

        const summary = readJson(
            path.join(REPOSITORY_ROOT, project, "coverage", "coverage-summary.json"),
            `${project} coverage summary`,
        );
        return [project, {
            coverage: parseCoverageSummary(summary, project),
            files: parseCoverageFilePaths(summary, project),
        }];
    }));
    const coverageProjects = Object.fromEntries(PROJECT_NAMES.map((project) => [project, coverageReports[project].coverage]));
    const eslintReports = Object.fromEntries(PROJECT_NAMES.map((project) => [
        project,
        languages[project] === "rust"
            ? []
            : readJson(path.join(REPORTS_DIRECTORY, "eslint", `${project}.json`), `${project} ESLint report`),
    ]));
    const eslint = parseEslintReports(eslintReports);
    const clippy = rustApi
        ? parseClippyReport(fs.readFileSync(CLIPPY_REPORT_PATH, "utf8"))
        : { violations: 0, oversizedFunctions: [] };
    eslint.projects.api += clippy.violations;
    eslint.total += clippy.violations;
    const duplication = parseJscpdReport(readJson(
        path.join(REPORTS_DIRECTORY, "jscpd", "jscpd-report.json"),
        "JSCPD report",
    ));
    const fileLines = collectFileSizes(validPolicy);
    const functions = [...collectFunctionSizes(validPolicy), ...clippy.oversizedFunctions];
    const coverageFiles = Object.fromEntries(PROJECT_NAMES.map((project) => [project, coverageReports[project].files]));
    const coverageFileCounts = validateCoverageScope(coverageFiles, fileLines, { languages });
    const diffCoverage = collectDiffCoverage({
        repositoryRoot: REPOSITORY_ROOT,
        projects: PROJECT_NAMES.map((project) => ({
            name: project,
            sourceRoot: projectSourceRoot(project, languages),
            format: languages[project] === "rust" ? "lcov" : "istanbul",
        })),
        sourceRoots: validPolicy.sourceRoots,
        coverageScope: PROJECT_NAMES.flatMap((project) => coverageFiles[project]),
    });
    const testMarkers = collectTestMarkerViolations(REPOSITORY_ROOT);
    const oversizedFiles = countLimitViolations(Object.values(fileLines), MAX_PRODUCTION_FILE_LINES);
    const oversizedFunctionDetails = functions.filter((item) => item.lineCount > MAX_PRODUCTION_FUNCTION_LINES);
    const oversizedFunctions = oversizedFunctionDetails.length;

    return {
        languages,
        coverage: {
            projects: coverageProjects,
            total: aggregateCoverage(coverageProjects),
            fileCounts: coverageFileCounts,
        },
        diffCoverage,
        testMarkers,
        duplication,
        violations: {
            qualityRuleViolations: eslint.total,
            oversizedFiles,
            oversizedFunctions,
            byProject: eslint.projects,
        },
        oversizedFunctionDetails,
        fileLines,
    };
}

function coverageDecreased(current, baseline, tolerancePoints = COVERAGE_TOLERANCE_PERCENTAGE_POINTS) {
    const currentCount = validateCoverageCount(current, "current ratio");
    const baselineCount = validateCoverageCount(baseline, "baseline ratio");

    if (currentCount.total === 0) {
        return baselineCount.total > 0;
    }

    if (baselineCount.total === 0) {
        return currentCount.covered !== currentCount.total;
    }

    // current < baseline - tolerance, cross-multiplied so no percentage is rounded.
    return currentCount.covered * baselineCount.total * 100
        < (baselineCount.covered * 100 - tolerancePoints * baselineCount.total) * currentCount.total;
}

function duplicationCount(value, label) {
    return validateCoverageCount(
        { covered: value.duplicatedLines, total: value.totalLines },
        label,
    );
}

function duplicationPercentage(value) {
    const count = duplicationCount(value, "duplication");
    return count.total === 0 ? 0 : (count.covered / count.total) * 100;
}

function duplicationRatioIsHigher(current, baseline) {
    const currentCount = duplicationCount(current, "current duplication");
    const baselineCount = duplicationCount(baseline, "baseline duplication");

    if (currentCount.total === 0) {
        return false;
    }

    if (baselineCount.total === 0) {
        return currentCount.covered > 0;
    }

    return currentCount.covered * baselineCount.total > baselineCount.covered * currentCount.total;
}

function compareMetrics(baseline, current) {
    validateBaseline(baseline);
    assertObject(current, "current metrics");
    const failures = [];
    const regressions = [];
    const baselineTotal = aggregateCoverage(baseline.coverage.projects);
    // A project rewritten in another language has no comparable history: only
    // its absolute limits apply, and the aggregates that include it are skipped.
    const migrated = PROJECT_NAMES.filter((project) => (baseline.languages?.[project] ?? "typescript")
        !== (current.languages?.[project] ?? "typescript"));
    const comparedScopes = migrated.length > 0
        ? PROJECT_NAMES.filter((project) => !migrated.includes(project))
        : [...PROJECT_NAMES, "total"];

    for (const [project, minimum] of Object.entries(MINIMUM_PROJECT_COVERAGE)) {
        for (const metric of COVERAGE_METRICS) {
            const count = current.coverage.projects[project][metric];

            if (count.total > 0 && count.covered * 100 < minimum * count.total) {
                failures.push(`${project} ${metric} coverage is ${formatPercentage(percentage(count))}; at least ${minimum}% is required.`);
            }
        }
    }

    for (const scope of comparedScopes) {
        const baselineCoverage = scope === "total" ? baselineTotal : baseline.coverage.projects[scope];
        const currentCoverage = scope === "total" ? current.coverage.total : current.coverage.projects[scope];

        for (const metric of COVERAGE_METRICS) {
            if (coverageDecreased(currentCoverage[metric], baselineCoverage[metric])) {
                if (currentCoverage[metric].total === 0 && baselineCoverage[metric].total > 0) {
                    failures.push(
                        `${scope} ${metric} coverage report is empty; the baseline measured ${baselineCoverage[metric].total} items.`,
                    );
                } else {
                    failures.push(
                        `${scope} ${metric} coverage decreased from ${formatPercentage(percentage(baselineCoverage[metric]))} to ${formatPercentage(percentage(currentCoverage[metric]))} (tolerance: ${COVERAGE_TOLERANCE_PERCENTAGE_POINTS} pp).`,
                    );
                }
            }
        }
    }

    if (migrated.length > 0) {
        // The scanned code changed language, so the ratios are not comparable.
    } else if (current.duplication.totalLines === 0 && baseline.duplication.totalLines > 0) {
        failures.push(
            `Duplication report is empty; the baseline scanned ${baseline.duplication.totalLines} lines.`,
        );
    } else if (duplicationRatioIsHigher(current.duplication, baseline.duplication)) {
        failures.push(
            `Duplication increased from ${formatPercentage(duplicationPercentage(baseline.duplication))} to ${formatPercentage(duplicationPercentage(current.duplication))}.`,
        );
    }

    if (migrated.length === 0 && current.duplication.fragments > baseline.duplication.fragments) {
        failures.push(
            `Duplicate fragments increased from ${baseline.duplication.fragments} to ${current.duplication.fragments}.`,
        );
    }

    if (current.violations.qualityRuleViolations !== 0) {
        failures.push(
            `ESLint reports ${current.violations.qualityRuleViolations} error(s) or warning(s); this check requires zero.`,
        );
    }

    const diffFailure = diffCoverageFailure(current.diffCoverage);
    if (diffFailure) {
        failures.push(diffFailure);
    }

    for (const marker of current.testMarkers?.violations ?? []) {
        failures.push(`${marker.filePath}:${marker.line} has a ${marker.label}: ${marker.source}`);
    }

    if (current.violations.oversizedFiles > baseline.violations.oversizedFiles) {
        failures.push(
            `Oversized files increased from ${baseline.violations.oversizedFiles} to ${current.violations.oversizedFiles}.`,
        );
    }

    const baselineOversizedFunctions = baseline.violations.oversizedFunctions ?? 0;
    if (current.violations.oversizedFunctions > baselineOversizedFunctions) {
        failures.push(
            `Oversized functions increased from ${baselineOversizedFunctions} to ${current.violations.oversizedFunctions}.`,
        );
    }

    if (current.violations.oversizedFiles !== 0) {
        failures.push(`Production source contains ${current.violations.oversizedFiles} file(s) over ${MAX_PRODUCTION_FILE_LINES} lines; this limit requires zero violations.`);
    }

    if (current.violations.oversizedFunctions !== 0) {
        failures.push(`Production source contains ${current.violations.oversizedFunctions} function(s) over ${MAX_PRODUCTION_FUNCTION_LINES} lines; this limit requires zero violations.`);
    }

    for (const [filePath, currentLines] of Object.entries(current.fileLines).sort(([left], [right]) => left.localeCompare(right))) {
        if (currentLines <= MAX_PRODUCTION_FILE_LINES) {
            continue;
        }

        const baselineLines = baseline.fileLines[filePath];

        if (baselineLines === undefined) {
            regressions.push(
                `${filePath} is a new oversized file with ${currentLines} lines (limit: ${MAX_PRODUCTION_FILE_LINES}).`,
            );
        } else if (baselineLines <= MAX_PRODUCTION_FILE_LINES) {
            regressions.push(
                `${filePath} grew from ${baselineLines} to ${currentLines} lines and crossed the ${MAX_PRODUCTION_FILE_LINES}-line limit.`,
            );
        } else if (currentLines > baselineLines) {
            regressions.push(
                `${filePath} grew from ${baselineLines} to ${currentLines} lines while already over the ${MAX_PRODUCTION_FILE_LINES}-line limit.`,
            );
        }
    }

    failures.push(...regressions);

    return {
        passed: failures.length === 0,
        failures,
        regressions,
    };
}

function buildBaseline(metrics, policy, generatedFromCommit = "unknown") {
    const coverageProjects = Object.fromEntries(PROJECT_NAMES.map((project) => [
        project,
        Object.fromEntries(COVERAGE_METRICS.map((metric) => [
            metric,
            {
                covered: metrics.coverage.projects[project][metric].covered,
                total: metrics.coverage.projects[project][metric].total,
            },
        ])),
    ]));

    const fileLines = Object.fromEntries(
        Object.entries(metrics.fileLines).sort(([left], [right]) => left.localeCompare(right)),
    );

    return {
        schemaVersion: 1,
        generatedFromCommit,
        languages: metrics.languages,
        policy: JSON.parse(JSON.stringify(policy)),
        coverage: { projects: coverageProjects },
        duplication: {
            duplicatedLines: metrics.duplication.duplicatedLines,
            totalLines: metrics.duplication.totalLines,
            fragments: metrics.duplication.fragments,
        },
        violations: {
            qualityRuleViolations: metrics.violations.qualityRuleViolations,
            oversizedFiles: metrics.violations.oversizedFiles,
            oversizedFunctions: metrics.violations.oversizedFunctions ?? 0,
        },
        fileLines,
    };
}

function markdownEscape(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/@/g, "&#64;")
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|")
        .replace(/`/g, "\\`")
        .replace(/\r?\n/g, " ");
}

function formatPercentage(value) {
    const truncated = Math.floor((value + Number.EPSILON) * 100) / 100;
    return `${truncated.toFixed(2)}%`;
}

function formatPercentageDelta(current, baseline) {
    const difference = current - baseline;

    if (difference !== 0 && Math.abs(difference) < 0.005) {
        return `${difference > 0 ? "+" : "-"}<0.01 pp`;
    }

    return `${difference >= 0 ? "+" : ""}${difference.toFixed(2)} pp`;
}

function formatCountDelta(current, baseline) {
    const difference = current - baseline;
    return `${difference >= 0 ? "+" : ""}${difference}`;
}

function formatCoverageValue(count) {
    return count.total === 0 ? "No data" : formatPercentage(percentage(count));
}

function formatCoverageDelta(current, baseline) {
    if (current.total === 0 || baseline.total === 0) {
        return "n/a";
    }

    return formatPercentageDelta(percentage(current), percentage(baseline));
}

function formatDuplicationValue(value) {
    return value.totalLines === 0 ? "No data" : formatPercentage(duplicationPercentage(value));
}

function formatDuplicationDelta(current, baseline) {
    if (current.totalLines === 0 || baseline.totalLines === 0) {
        return "n/a";
    }

    return formatPercentageDelta(duplicationPercentage(current), duplicationPercentage(baseline));
}

function renderDiffCoverage(diffCoverage) {
    const lines = ["## Changed-line coverage", ""];

    if (!diffCoverage?.evaluated) {
        lines.push(`Not evaluated: ${markdownEscape(diffCoverage?.reason ?? "no data")}`);
        return lines;
    }

    const summary = diffCoverage.total === 0
        ? "No executable production lines changed."
        : `${formatPercentage((diffCoverage.covered / diffCoverage.total) * 100)} (${diffCoverage.covered}/${diffCoverage.total} executable lines)`;
    lines.push(
        `Base: \`${markdownEscape(diffCoverage.base.ref)}\` (\`${markdownEscape(diffCoverage.base.sha)}\`) · minimum: ${diffCoverage.minPercent}% · changed files: ${diffCoverage.changedFiles}`,
        "",
        `Result: ${summary}`,
    );
    const uncovered = diffCoverage.files.filter((file) => file.uncoveredLines.length > 0);

    if (uncovered.length > 0) {
        lines.push("", "| File | Covered | Uncovered lines |", "|---|---:|---|");

        for (const file of uncovered) {
            lines.push(`| ${markdownEscape(file.filePath)} | ${file.covered}/${file.total} | ${formatLineRanges(file.uncoveredLines)} |`);
        }
    }

    return lines;
}

function renderMarkdown({ baseline, metrics, comparison, baselineLabel = "scripts/baseline.json" }) {
    const status = comparison.passed ? "PASS" : "FAIL";
    const baselineTotal = aggregateCoverage(baseline.coverage.projects);
    const lines = [
        "# Quality Gate",
        "",
        `**${status}** — ${comparison.passed ? "No quality regression detected." : `${comparison.failures.length} regression(s) detected.`}`,
        "",
        `Baseline: \`${markdownEscape(baselineLabel)}\` (commit \`${markdownEscape(baseline.generatedFromCommit ?? "unknown")}\`)`,
        "",
    ];

    if (!comparison.passed) {
        lines.push("## Failures", "");

        for (const failure of comparison.failures) {
            lines.push(`- ${markdownEscape(failure)}`);
        }

        lines.push("");
    }

    lines.push(
        "## Coverage",
        "",
        "| Metric | Baseline | Current | Increase |",
        "|---|---:|---:|---:|",
    );

    for (const metric of COVERAGE_METRICS) {
        lines.push(
            `| ${metric[0].toUpperCase()}${metric.slice(1)} | ${formatCoverageValue(baselineTotal[metric])} | ${formatCoverageValue(metrics.coverage.total[metric])} | ${formatCoverageDelta(metrics.coverage.total[metric], baselineTotal[metric])} |`,
        );
    }

    lines.push(
        "",
        "<details>",
        "<summary>Coverage by package</summary>",
        "",
        "| Package | Metric | Baseline | Current | Increase |",
        "|---|---|---:|---:|---:|",
    );

    for (const project of PROJECT_NAMES) {
        for (const metric of COVERAGE_METRICS) {
            lines.push(
                `| ${project} | ${metric} | ${formatCoverageValue(baseline.coverage.projects[project][metric])} | ${formatCoverageValue(metrics.coverage.projects[project][metric])} | ${formatCoverageDelta(metrics.coverage.projects[project][metric], baseline.coverage.projects[project][metric])} |`,
            );
        }
    }

    lines.push(
        "",
        "</details>",
        "",
        `Coverage may not fall more than ${COVERAGE_TOLERANCE_PERCENTAGE_POINTS} pp below the baseline.`,
        "",
        ...renderDiffCoverage(metrics.diffCoverage),
        "",
        "## Duplication",
        "",
        "| Metric | Baseline | Current | Increase |",
        "|---|---:|---:|---:|",
        `| Percentage | ${formatDuplicationValue(baseline.duplication)} | ${formatDuplicationValue(metrics.duplication)} | ${formatDuplicationDelta(metrics.duplication, baseline.duplication)} |`,
        `| Fragments | ${baseline.duplication.fragments} | ${metrics.duplication.fragments} | ${formatCountDelta(metrics.duplication.fragments, baseline.duplication.fragments)} |`,
        "",
        "## Violations",
        "",
        "| Metric | Baseline | Current | Increase |",
        "|---|---:|---:|---:|",
        `| Quality rule violations | ${baseline.violations.qualityRuleViolations} | ${metrics.violations.qualityRuleViolations} | ${formatCountDelta(metrics.violations.qualityRuleViolations, baseline.violations.qualityRuleViolations)} |`,
        `| Oversized files (> ${MAX_PRODUCTION_FILE_LINES} lines) | ${baseline.violations.oversizedFiles} | ${metrics.violations.oversizedFiles} | ${formatCountDelta(metrics.violations.oversizedFiles, baseline.violations.oversizedFiles)} |`,
        `| Oversized functions (> ${MAX_PRODUCTION_FUNCTION_LINES} lines) | ${baseline.violations.oversizedFunctions ?? "not recorded"} | ${metrics.violations.oversizedFunctions ?? 0} | ${baseline.violations.oversizedFunctions === undefined ? "n/a" : formatCountDelta(metrics.violations.oversizedFunctions ?? 0, baseline.violations.oversizedFunctions)} |`,
        `| Forbidden test markers (.only, unconditional .skip, #[ignore]) | n/a | ${metrics.testMarkers?.violations.length ?? 0} | n/a |`,
        "",
        "## Regressions",
        "",
    );

    if (comparison.regressions.length === 0) {
        lines.push("No oversized-file or oversized-function regressions detected.");
    } else {
        for (const regression of comparison.regressions) {
            lines.push(`- ${markdownEscape(regression)}`);
        }
    }

    lines.push(
        "",
        "## Diagnostics",
        "",
        `- Source files scanned: ${Object.keys(metrics.fileLines).length}`,
        `- Production size violations: ${metrics.violations.oversizedFiles} oversized file(s), ${metrics.violations.oversizedFunctions ?? 0} oversized function(s)`,
        `- Coverage files: ${PROJECT_NAMES.map((project) => `${project} ${metrics.coverage.fileCounts?.[project] ?? "unknown"}`).join(", ")}`,
        `- Lint violations: ${PROJECT_NAMES.map((project) => `${project} ${metrics.violations.byProject[project]}`).join(", ")}`,
        `- API language: ${metrics.languages?.api ?? "typescript"}${metrics.languages?.api === "rust" ? " (statements are llvm regions; branches are n/a on stable Rust)" : ""}`,
        `- JSCPD lines: ${metrics.duplication.duplicatedLines} duplicated / ${metrics.duplication.totalLines} scanned`,
        `- Test files scanned for markers: ${metrics.testMarkers?.scannedFiles ?? "unknown"}`,
        "",
    );

    return `${lines.join("\n")}\n`;
}

function currentCommit() {
    try {
        const result = runCommand("git", ["rev-parse", "--short=12", "HEAD"]);
        return result.status === 0 ? result.stdout.trim() : "unknown";
    } catch {
        return "unknown";
    }
}

function parseArguments(args) {
    const options = {
        updateBaseline: false,
        collectToolReports: true,
        baselinePath: process.env.QUALITY_GATE_BASELINE_PATH || DEFAULT_BASELINE_PATH,
    };

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];

        if (argument === "--update-baseline") {
            options.updateBaseline = true;
        } else if (argument === "--no-collect") {
            options.collectToolReports = false;
        } else if (argument === "--baseline") {
            index += 1;

            if (!args[index]) {
                throw new QualityGateInputError("--baseline requires a path.");
            }

            options.baselinePath = path.resolve(REPOSITORY_ROOT, args[index]);
        } else {
            throw new QualityGateInputError(`Unknown argument: ${argument}`);
        }
    }

    return options;
}

function writeInputFailureReport(error) {
    ensureDirectory(REPORTS_DIRECTORY);
    const report = [
        "# Quality Gate",
        "",
        "**ERROR** — Metrics could not be collected or validated.",
        "",
        "## Failure",
        "",
        `- ${markdownEscape(error.message)}`,
        "",
    ].join("\n");
    fs.writeFileSync(QUALITY_REPORT_PATH, report, "utf8");
    writeJson(QUALITY_JSON_PATH, {
        schemaVersion: 1,
        status: "error",
        error: error.message,
    });
}

function runCli(args = process.argv.slice(2)) {
    try {
        const options = parseArguments(args);

        if (options.updateBaseline && process.env.CI === "true") {
            throw new QualityGateInputError("Baseline updates are disabled in CI.");
        }

        const existingBaseline = fs.existsSync(options.baselinePath)
            ? validateBaseline(readJson(options.baselinePath, "quality baseline"))
            : null;
        const policy = existingBaseline?.policy ?? DEFAULT_POLICY;
        const metrics = collectMetrics({ policy, collectToolReports: options.collectToolReports });
        const candidateBaseline = buildBaseline(metrics, resolvePolicy(policy, metrics.languages), currentCommit());
        writeJson(CANDIDATE_BASELINE_PATH, candidateBaseline);

        if (options.updateBaseline) {
            writeJson(options.baselinePath, candidateBaseline);
            const comparison = compareMetrics(candidateBaseline, metrics);
            const markdown = renderMarkdown({
                baseline: candidateBaseline,
                metrics,
                comparison,
                baselineLabel: path.relative(REPOSITORY_ROOT, options.baselinePath),
            });
            fs.writeFileSync(QUALITY_REPORT_PATH, markdown, "utf8");
            writeJson(QUALITY_JSON_PATH, {
                schemaVersion: 1,
                status: "pass",
                baselineUpdated: path.relative(REPOSITORY_ROOT, options.baselinePath),
                metrics,
                comparison,
            });
            process.stdout.write(`Baseline updated: ${path.relative(REPOSITORY_ROOT, options.baselinePath)}\n`);
            process.stdout.write(markdown);
            return 0;
        }

        if (!existingBaseline) {
            throw new QualityGateInputError(
                `Quality baseline not found at ${options.baselinePath}. Run node scripts/quality-gate.js --update-baseline.`,
            );
        }

        const comparison = compareMetrics(existingBaseline, metrics);
        const baselineLabel = process.env.QUALITY_GATE_BASELINE_LABEL
            || path.relative(REPOSITORY_ROOT, options.baselinePath);
        const markdown = renderMarkdown({
            baseline: existingBaseline,
            metrics,
            comparison,
            baselineLabel,
        });
        ensureDirectory(REPORTS_DIRECTORY);
        fs.writeFileSync(QUALITY_REPORT_PATH, markdown, "utf8");
        writeJson(QUALITY_JSON_PATH, {
            schemaVersion: 1,
            status: comparison.passed ? "pass" : "fail",
            // PR Validation renders the baseline next to the current metrics.
            baseline: {
                label: baselineLabel,
                generatedFromCommit: existingBaseline.generatedFromCommit ?? "unknown",
                coverage: existingBaseline.coverage,
                duplication: existingBaseline.duplication,
                violations: existingBaseline.violations,
            },
            metrics,
            comparison,
        });
        process.stdout.write(markdown);
        return comparison.passed ? 0 : 1;
    } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        writeInputFailureReport(normalizedError);
        process.stderr.write(`${normalizedError.name}: ${normalizedError.message}\n`);
        return 2;
    }
}

module.exports = {
    COVERAGE_METRICS,
    COVERAGE_TOLERANCE_PERCENTAGE_POINTS,
    DEFAULT_POLICY,
    MAX_PRODUCTION_FILE_LINES,
    MAX_PRODUCTION_FUNCTION_LINES,
    PROJECT_NAMES,
    QualityGateInputError,
    aggregateCoverage,
    buildBaseline,
    collectFunctionSizes,
    collectFileSizes,
    collectMetrics,
    compareMetrics,
    countPhysicalLines,
    coverageDecreased,
    countLimitViolations,
    duplicationPercentage,
    duplicationRatioIsHigher,
    formatPercentage,
    markdownEscape,
    parseArguments,
    parseCoverageFilePaths,
    parseClippyReport,
    parseCoverageSummary,
    parseEslintReports,
    parseJscpdReport,
    parseRustCoverageReport,
    percentage,
    projectLanguages,
    renderMarkdown,
    resolvePolicy,
    runCli,
    scanFunctionSizes,
    validateBaseline,
    validateCoverageScope,
};

if (require.main === module) {
    process.exitCode = runCli();
}
