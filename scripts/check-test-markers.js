"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TEST_ROOTS = [
    "api/src",
    "desktop/src",
    "desktop/scripts",
    "e2e",
    "web/src",
    "src-tauri/crates/api/src",
    "src-tauri/crates/api/tests",
];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_SETUP_FILE = /(^|\/)(e2e\/(fixtures|[^/]*\.setup)\.[cm]?[jt]sx?)$/;
const RUST_SOURCE = /\.rs$/;

// A focused test hides every other test in its file, and an unconditional skip
// removes a test while its coverage silently disappears. Conditional skips
// such as Playwright's `test.skip(!process.env.S3_ENDPOINT, "reason")` or
// Vitest's `it.skipIf(condition)` stay allowed because they state why.
const FORBIDDEN_MARKERS = [
    {
        label: "focused test",
        pattern: /\b(?:it|test|describe|suite|bench)(?:\.\w+)*\.only\b/,
    },
    {
        label: "focused or disabled test alias",
        pattern: /(?<![.\w])(?:fit|fdescribe|xit|xtest|xdescribe)\s*\(/,
    },
    {
        label: "unconditional skip, todo, fixme, or expected failure",
        pattern: /\b(?:it|test|describe|suite)(?:\.\w+)*\.(?:skip|todo|fixme|fails)\s*\(\s*(?:["'`]|\))/,
    },
];

// An ignored Rust test stops running without failing, and a todo!() or
// unimplemented!() leaves code that panics when reached.
const FORBIDDEN_RUST_MARKERS = [
    { label: "ignored Rust test", pattern: /#\[\s*ignore\b/ },
    { label: "unfinished Rust code", pattern: /\b(?:todo|unimplemented)!\s*\(/ },
];

function stripComments(line) {
    const withoutLineComment = line.replace(/(^|[^:"'`])\/\/.*$/, "$1");
    return /^\s*(\*|\/\*)/.test(withoutLineComment) ? "" : withoutLineComment;
}

function findForbiddenMarkers(contents, filePath) {
    const violations = [];
    const lines = contents.split(/\r\n|\r|\n/);

    for (const [index, rawLine] of lines.entries()) {
        const line = stripComments(rawLine);

        for (const marker of RUST_SOURCE.test(filePath) ? FORBIDDEN_RUST_MARKERS : FORBIDDEN_MARKERS) {
            if (marker.pattern.test(line)) {
                violations.push({ filePath, line: index + 1, label: marker.label, source: rawLine.trim() });
            }
        }
    }

    return violations;
}

function isTestSource(relativePath) {
    return RUST_SOURCE.test(relativePath)
        || TEST_FILE.test(relativePath)
        || /(^|\/)__tests__\//.test(relativePath)
        || TEST_SETUP_FILE.test(relativePath);
}

function collectTestMarkerViolations(repositoryRoot, roots = TEST_ROOTS) {
    const violations = [];
    let scannedFiles = 0;

    function visit(absoluteDirectory) {
        const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
            .sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
            const absolutePath = path.join(absoluteDirectory, entry.name);

            if (entry.isSymbolicLink() || entry.name === "node_modules") {
                continue;
            }

            if (entry.isDirectory()) {
                visit(absolutePath);
                continue;
            }

            const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");

            if (!entry.isFile() || !isTestSource(relativePath)) {
                continue;
            }

            scannedFiles += 1;
            violations.push(...findForbiddenMarkers(fs.readFileSync(absolutePath, "utf8"), relativePath));
        }
    }

    for (const root of roots) {
        const absoluteRoot = path.join(repositoryRoot, root);

        if (fs.existsSync(absoluteRoot) && fs.statSync(absoluteRoot).isDirectory()) {
            visit(absoluteRoot);
        }
    }

    return { scannedFiles, violations };
}

module.exports = {
    FORBIDDEN_MARKERS,
    FORBIDDEN_RUST_MARKERS,
    TEST_ROOTS,
    collectTestMarkerViolations,
    findForbiddenMarkers,
    isTestSource,
};
