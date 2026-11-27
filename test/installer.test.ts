import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
test("review UI upgrade preserves account-bound Host grants and sibling Apps", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "review-installer-"));
  const grants = {
    owner: "existing-owner",
    hostCapabilities: ["directories.read", "versions.read"],
    hostResources: ["a"],
    hostDirectorySources: ["opaque-source"],
    hostRepositoryBindings: [
      { sourceKey: "opaque-source", nodeRef: "root", repositoryId: "repo" },
    ],
  };
  try {
    await writeFile(
      path.join(dir, "apps.json"),
      JSON.stringify([
        { id: "sibling", title: "Keep me" },
        { id: "io.openmuse.repository-review", ...grants },
      ]),
    );
    execFileSync(
      process.execPath,
      [
        "scripts/install-development-host.mjs",
        "--directory",
        dir,
        "--endpoint",
        "http://127.0.0.1:4191/mcp",
      ],
      { stdio: "pipe" },
    );
    const list = JSON.parse(
      await readFile(path.join(dir, "apps.json"), "utf8"),
    );
    assert.equal(list[0].id, "sibling");
    const review = list.find(
      (a: any) => a.id === "io.openmuse.repository-review",
    );
    for (const [key, value] of Object.entries(grants))
      assert.deepEqual(review[key], value);
    assert.match(review.uiSha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
