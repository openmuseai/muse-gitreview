import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonLabel } from "../web/comparison-label.ts";
test("MR number remains distinct even when two MRs share a head", () => {
  const base = {
    kind: "mr" as const,
    provider: "github",
    headSha: "a".repeat(40),
  };
  assert.equal(comparisonLabel({ ...base, number: 2 }), "MR #2 · aaaaaaa");
  assert.notEqual(
    comparisonLabel({ ...base, number: 2 }),
    comparisonLabel({ ...base, number: 6 }),
  );
});
test("branch comparisons show both named or pinned endpoints", () => {
  assert.equal(
    comparisonLabel({
      kind: "branch",
      provider: "git",
      baseRef: "main",
      headRef: "feat/review",
    }),
    "分支 · main ← feat/review",
  );
  assert.equal(
    comparisonLabel({
      kind: "branch",
      provider: "git",
      baseRef: "a".repeat(40),
      headRef: "b".repeat(40),
    }),
    "分支 · aaaaaaa ← bbbbbbb",
  );
  assert.equal(comparisonLabel(), "选择比较来源");
});
