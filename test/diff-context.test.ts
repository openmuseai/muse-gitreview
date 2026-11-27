import { test } from "node:test";
import assert from "node:assert/strict";
import { createPatch } from "diff";
import { buildHunks, pairedRows } from "../src/diff-model.ts";
import { contextSections, contextLines } from "../src/diff-context.ts";
import type { ChangeFile } from "../src/contract.ts";

const file = (before: string, after: string): ChangeFile => ({
  path: "a.ts",
  status: "modified",
  before,
  after,
  binary: false,
  truncated: false,
  patchUnavailable: false,
});
test("folded gaps restore exact unchanged lines and absolute anchors in either layout", () => {
  const before =
    Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const after = before
    .replace("line 12\n", "edited\ninserted\n")
    .replace("line 48\n", "changed\n");
  const f = file(before, after),
    model = buildHunks(f);
  const sections = contextSections(f, model.hunks);
  const gaps = sections.flatMap((s) => ("gap" in s ? [s.gap] : []));
  assert.equal(gaps.length, 3);
  const expanded = sections
    .flatMap((s) => ("gap" in s ? contextLines(s.gap) : s.hunk.lines))
    .filter((l) => l.kind !== "meta");
  assert.equal(
    expanded
      .filter((l) => l.oldLine !== undefined)
      .map((l) => l.text)
      .join("\n") + "\n",
    before,
  );
  assert.equal(
    expanded
      .filter((l) => l.newLine !== undefined)
      .map((l) => l.text)
      .join("\n") + "\n",
    after,
  );
  const last = contextLines(gaps.at(-1)!);
  assert.equal(last.at(-1)?.oldLine, 60);
  assert.equal(last.at(-1)?.newLine, 61);
  assert.equal(pairedRows(last).at(-1)?.right?.newLine, 61);
  assert.equal(model.additions, 3);
  assert.equal(model.deletions, 2);
});
test("loading immutable context never replaces or renumbers the original MR patch", () => {
  const before = "prefix\n".repeat(20) + "old\n" + "suffix\n".repeat(20);
  const after = before.replace("old\n", "new\n");
  const raw = createPatch("a.ts", before, after);
  const patch = raw.slice(raw.indexOf("--- "));
  const model = buildHunks({
    ...file(before, after),
    before: undefined,
    after: undefined,
    patch,
  });
  const original = JSON.stringify(model);
  const sections = contextSections(
    { ...file(before, after), patch },
    model.hunks,
  );
  assert.equal(JSON.stringify(model), original);
  assert.ok(sections.some((s) => "gap" in s));
  assert.throws(
    () =>
      contextSections(
        file(before.replace("prefix", "foreign"), after),
        model.hunks,
      ),
    /CONTEXT_SNAPSHOT_MISMATCH/,
  );
  assert.throws(
    () =>
      contextSections(file(before.replace("old", "wrong"), after), model.hunks),
    /CONTEXT_SNAPSHOT_MISMATCH/,
  );
});
test("root additions, deletions, CRLF and missing final newline keep their boundaries", () => {
  for (const [before, after] of [
    ["", "new\n"],
    ["old\n", ""],
    ["one\r\ntwo\r\n", "one\r\nchanged\r\n"],
    ["a\nb", "a\nc"],
    ["\n", "\nchanged\n"],
  ]) {
    const f = file(before, after),
      model = buildHunks(f);
    assert.doesNotThrow(() => contextSections(f, model.hunks));
  }
});
test("patch-only snapshots expose no invented context", () => {
  const f = {
    ...file("old\n", "new\n"),
    before: undefined,
    after: undefined,
    patch: "@@ -1 +1 @@\n-old\n+new",
  };
  const model = buildHunks(f);
  assert.ok(contextSections(f, model.hunks).every((s) => "hunk" in s));
});

test("patch anchors expose inline folded ranges before any full text is read", () => {
  const f = {
    ...file("", ""),
    before: undefined,
    after: undefined,
    patch: "@@ -88 +88 @@\n-old\n+new\n@@ -156 +156 @@\n-old2\n+new2",
  };
  const sections = contextSections(f, buildHunks(f).hunks);
  const gaps = sections.flatMap((s) => ("gap" in s ? [s.gap] : []));
  assert.deepEqual(
    gaps.map((g) => g.count),
    [87, 67],
  );
  assert.ok(gaps.every((g) => g.lines === undefined));
  assert.throws(() => contextLines(gaps[0]), /FULL_CONTEXT_UNAVAILABLE/);
});
