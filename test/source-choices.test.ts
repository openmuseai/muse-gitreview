import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { RepositoryProvider } from "../src/repository.ts";
test("local source choices are scoped and divergent branches use their merge base", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-choices-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.test");
    git("config", "user.name", "Source test");
    await writeFile(path.join(root, "a.txt"), "base");
    git("add", ".");
    git("commit", "-qm", "base");
    const common = git("rev-parse", "HEAD");
    git("checkout", "-qb", "feature");
    await writeFile(path.join(root, "a.txt"), "target");
    git("commit", "-qam", "feature");
    const head = git("rev-parse", "HEAD");
    git("checkout", "main");
    await writeFile(path.join(root, "only-main.txt"), "not part of feature");
    git("add", ".");
    git("commit", "-qm", "main advanced");
    const p = new RepositoryProvider([{ id: "repo", title: "Repo", root }]);
    const choices = await p.choices("repo", "branch");
    assert.ok(
      choices.branches?.some(
        (b: any) => b.name === "feature" && b.sha === head,
      ),
    );
    const commits = await p.choices("repo", "commit");
    assert.ok(commits.commits?.length);
    const result = await p.compare({
      repositoryId: "repo",
      kind: "branch",
      baseRef: "main",
      headRef: "feature",
    });
    assert.equal(result.source.baseRef, common);
    assert.deepEqual(
      result.files.map((f) => f.path),
      ["a.txt"],
    );
    await assert.rejects(
      p.choices("foreign", "branch"),
      /REPOSITORY_NOT_GRANTED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("remote metadata and comparisons use the selected repository and pinned SHAs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-remote-choices-")),
    tokenFile = path.join(root, "token");
  await writeFile(tokenFile, "test-token");
  const previous = globalThis.fetch;
  const urls: string[] = [];
  const base = "a".repeat(40),
    head = "b".repeat(40),
    common = "c".repeat(40);
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    urls.push(url);
    let result: any;
    if (url.includes("/branches?"))
      result = [
        { name: "main", commit: { sha: base } },
        { name: "feature", commit: { sha: head } },
      ];
    else if (url.includes("/pulls?"))
      result = [
        {
          number: 2,
          title: "MR",
          state: "open",
          merged_at: null,
          base: { ref: "main" },
          head: { ref: "feature", sha: head },
        },
      ];
    else if (url.includes("/commits?"))
      result = [
        {
          sha: head,
          commit: { message: "Change\nbody", author: { date: "2026-11-27" } },
        },
      ];
    else if (url.includes("/compare/"))
      result = {
        merge_base_commit: { sha: common },
        files: [
          {
            filename: "a.txt",
            status: "modified",
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      };
    else if (url.includes("/git/trees/"))
      result = {
        truncated: true,
        tree: [
          { path: "a.txt", mode: "100644", type: "blob" },
          { path: "link", mode: "120000", type: "blob" },
          { path: "submodule", mode: "160000", type: "commit" },
        ],
      };
    else throw Error("Unexpected request");
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const p = new RepositoryProvider([
      {
        id: "repo",
        title: "Repo",
        root,
        github: { owner: "owner", repository: "selected", tokenFile },
      },
    ]);
    assert.equal((await p.choices("repo", "branch")).branches?.length, 2);
    assert.equal((await p.choices("repo", "mr")).mergeRequests?.[0].number, 2);
    assert.equal(
      (await p.choices("repo", "commit")).commits?.[0].title,
      "Change",
    );
    const c = await p.compare({
      repositoryId: "repo",
      kind: "branch",
      baseRef: base,
      headRef: head,
    });
    assert.equal(c.source.headSha, head);
    assert.equal(c.source.baseRef, common);
    // This SHA is absent from the deliberately empty local checkout.
    const tree = await p.tree("repo", head);
    assert.equal(tree.ref, head);
    assert.deepEqual(tree.files, [{ path: "a.txt", status: "unchanged" }]);
    assert.equal(tree.truncated, true);
    assert.ok(urls.some((u) => u.endsWith(`/git/trees/${head}?recursive=1`)));
    assert.ok(
      urls.every((u) =>
        u.startsWith("https://api.github.com/repos/owner/selected/"),
      ),
    );
    assert.equal(c.incomplete, false);
  } finally {
    globalThis.fetch = previous;
    await rm(root, { recursive: true, force: true });
  }
});
