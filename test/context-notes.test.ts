import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createPatch } from "diff";
import { ReviewStore } from "../src/store.ts";

test("notes on expanded context are hash-bound, reject absent lines, and survive reload", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-context-notes-"));
  try {
    const store = new ReviewStore(root, "reviewer");
    const before =
        Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n") + "\n",
      after = before.replace("line 40\n", "changed\n");
    const raw = createPatch("a.ts", before, after),
      patch = raw.slice(raw.indexOf("--- "));
    const input = {
      schema: "openmuse.repository-review/1",
      title: "Context",
      source: {
        kind: "mr",
        provider: "github",
        repository: "allowed",
        baseRef: "a".repeat(40),
        headRef: "b".repeat(40),
      },
      files: [{ path: "a.ts", status: "modified", patch }],
    };
    const meta = await store.open(input),
      args = {
        comparisonId: meta.id,
        expectedDigest: meta.digest,
        commandId: randomUUID(),
        path: "a.ts",
        side: "right" as const,
        line: 1,
        body: "Inline context note",
      };
    await assert.rejects(store.change(args), /NOTE_ANCHOR_INVALID/);
    await assert.rejects(
      store.change(args, async (c, f) => ({
        ...f,
        before,
        after: after.replace("line 1\n", "foreign\n"),
      })),
      /CONTEXT_SNAPSHOT_MISMATCH/,
    );
    const load = async (c: any, f: any) => {
      assert.equal(c.source.repository, "allowed");
      assert.equal(c.source.headRef, "b".repeat(40));
      return { ...f, before, after };
    };
    await store.change(args, load);
    await store.change(args, load); // Same command is idempotent.
    const saved = store.read(meta.id);
    assert.equal(saved.digest, meta.digest);
    assert.equal(saved.notes.length, 1);
    assert.equal(saved.notes[0].line, 1);
    await assert.rejects(
      store.change({ ...args, commandId: randomUUID(), line: 81 }, load),
      /NOTE_ANCHOR_INVALID/,
    );
    const restored = new ReviewStore(root, "reviewer");
    await restored.load();
    assert.equal(restored.read(meta.id).notes[0].body, args.body);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("complete local snapshots allow context notes without reading a mutable worktree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-local-note-"));
  try {
    const store = new ReviewStore(root);
    const before = "same\n".repeat(30) + "old\n",
      after = "same\n".repeat(30) + "new\n";
    const meta = await store.open({
      schema: "openmuse.repository-review/1",
      title: "Local",
      source: { kind: "workspace", provider: "git" },
      files: [{ path: "a.txt", status: "modified", before, after }],
    });
    await store.change({
      comparisonId: meta.id,
      expectedDigest: meta.digest,
      commandId: randomUUID(),
      path: "a.txt",
      side: "left",
      line: 1,
      body: "Pinned local context",
    });
    assert.equal(store.read(meta.id).notes.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
