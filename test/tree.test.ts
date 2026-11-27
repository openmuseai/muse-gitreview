import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { RepositoryProvider } from "../src/repository.ts";
test("full tree is a pinned commit, includes unchanged files and excludes symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-tree-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.email", "tree@example.test");
    git("config", "user.name", "Tree test");
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "stable.txt"), "old");
    await writeFile(path.join(root, "unchanged.txt"), "same");
    await symlink("unchanged.txt", path.join(root, "link"));
    git("add", ".");
    git("commit", "-qm", "base");
    const provider = new RepositoryProvider([
      { id: "granted", title: "Fixture", root },
    ]);
    const original = await provider.tree("granted");
    assert.deepEqual(
      original.files.map((f) => f.path),
      ["src/stable.txt", "unchanged.txt"],
    );
    assert.equal(original.truncated, false);
    await writeFile(path.join(root, "new.txt"), "new");
    git("add", ".");
    git("commit", "-qm", "next");
    assert.deepEqual(
      (await provider.tree("granted", original.ref)).files,
      original.files,
    );
    assert.equal((await provider.tree("granted")).files.length, 3);
    await assert.rejects(provider.tree("foreign"), /REPOSITORY_NOT_GRANTED/);
    await assert.rejects(provider.tree("granted", "--all"), /GIT_REF_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
