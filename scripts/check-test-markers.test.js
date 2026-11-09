"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { collectTestMarkerViolations, findForbiddenMarkers, isTestSource } = require("./check-test-markers.js");

function labels(source) {
    return findForbiddenMarkers(source, "fixture.test.ts").map((violation) => violation.label);
}

test("focused tests are forbidden in every form", () => {
    assert.deepEqual(labels("it.only('a', () => {})"), ["focused test"]);
    assert.deepEqual(labels("describe.only('a', () => {})"), ["focused test"]);
    assert.deepEqual(labels("test.describe.only('a', () => {})"), ["focused test"]);
    assert.deepEqual(labels("it.concurrent.only('a', () => {})"), ["focused test"]);
    assert.deepEqual(labels("fit('a', () => {})"), ["focused or disabled test alias"]);
    assert.deepEqual(labels("xdescribe('a', () => {})"), ["focused or disabled test alias"]);
});

test("unconditional skips, todos, fixmes, and expected failures are forbidden", () => {
    const unconditional = "unconditional skip, todo, fixme, or expected failure";

    assert.deepEqual(labels("it.skip('a', () => {})"), [unconditional]);
    assert.deepEqual(labels('describe.skip("a", () => {})'), [unconditional]);
    assert.deepEqual(labels("it.todo(`later`)"), [unconditional]);
    assert.deepEqual(labels("it.fails('known bug', () => {})"), [unconditional]);
    assert.deepEqual(labels("test.fixme('flaky', async () => {})"), [unconditional]);
    assert.deepEqual(labels("    test.skip()"), [unconditional]);
});

test("conditional skips, comments, and unrelated identifiers stay allowed", () => {
    assert.deepEqual(labels("test.skip(!process.env.S3_ENDPOINT, 'Requires S3_* variables')"), []);
    assert.deepEqual(labels("it.skipIf(process.platform === 'win32')('posix only', () => {})"), []);
    assert.deepEqual(labels("// it.only('debug', () => {})"), []);
    assert.deepEqual(labels(" * describe.skip('docs example')"), []);
    assert.deepEqual(labels("const profit = calculate(); benefit(1);"), []);
    assert.deepEqual(labels("items.only = true; options.skip('x')"), []);
});

test("violations report the file, line, and source text", () => {
    const [violation] = findForbiddenMarkers("import { it } from 'vitest'\n\nit.only('a', () => {})\n", "a.test.ts");

    assert.deepEqual(violation, {
        filePath: "a.test.ts",
        line: 3,
        label: "focused test",
        source: "it.only('a', () => {})",
    });
});

test("the scan covers test files and Playwright setup files only", (context) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "test-markers-"));
    context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const files = {
        "api/src/a.test.ts": "it.only('a', () => {})\n",
        "api/src/a.ts": "export const only = { it: 1 }; it.only('not a test file')\n",
        "e2e/auth.setup.ts": "test.skip('setup disabled')\n",
        "e2e/home.spec.ts": "test.skip(!process.env.CI, 'local only')\n",
        "web/src/node_modules/pkg/x.test.ts": "it.only('vendored')\n",
    };

    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = path.join(repositoryRoot, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, contents, "utf8");
    }

    const result = collectTestMarkerViolations(repositoryRoot);

    assert.equal(result.scannedFiles, 3);
    assert.deepEqual(result.violations.map((violation) => `${violation.filePath}:${violation.line}`), [
        "api/src/a.test.ts:1",
        "e2e/auth.setup.ts:1",
    ]);
    assert.equal(isTestSource("web/src/__tests__/helper.ts"), true);
    assert.equal(isTestSource("web/src/lib/api.ts"), false);
});

test("Rust sources block ignored tests and unfinished code but not comments", () => {
    assert.deepEqual(findForbiddenMarkers("#[ignore]\nfn a() {}\n// todo!()\ntodo!();\nunimplemented!(\"x\");\n", "src-tauri/crates/api/tests/a.rs").map(({ line, label }) => [line, label]), [
        [1, "ignored Rust test"],
        [4, "unfinished Rust code"],
        [5, "unfinished Rust code"],
    ]);
    assert.deepEqual(findForbiddenMarkers("#[should_panic]\nfn a() { it.only(1) }\n", "src-tauri/crates/api/src/a.rs"), []);
    assert.equal(isTestSource("src-tauri/crates/api/src/a.rs"), true);
});
