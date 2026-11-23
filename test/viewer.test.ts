import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { ReviewStore } from "../src/store.ts";
import { viewerSnapshot } from "../src/viewer.ts";

test("native viewer document pins exact snapshots and absolute diff anchors without executable instructions", async () => {
  const dir = await mkdtemp(tmpdir() + "/review-viewer-");
  try {
    const store = new ReviewStore(dir);
    const before = Array.from(
      { length: 80 },
      (_, i) => `const line${i + 1} = ${i + 1};`,
    ).join("\n");
    const after = before.replace("line40 = 40", "line40 = 400");
    const r = await store.open({
      schema: "openmuse.repository-review/1",
      title: "Pinned native diff",
      source: { kind: "versions", provider: "Host" },
      files: [
        { path: "src/nested/code.ts", status: "modified", before, after },
      ],
    });
    const value = await viewerSnapshot(store, r.id),
      doc = JSON.parse(value.text);
    assert.equal(
      value.sha256,
      createHash("sha256").update(value.text).digest("hex"),
    );
    assert.equal(doc.files[0].before, before);
    assert.equal(doc.files[0].after, after);
    assert.equal(
      doc.files[0].hunks[0].lines.find((l: any) => l.kind === "add").newLine,
      40,
    );
    assert.equal(doc.files[0].additions, 1);
    assert.equal(doc.files[0].deletions, 1);
    assert.equal(value.mimeType, "application/vnd.openmuse.review-viewer+json");
    assert.ok(value.name.endsWith(".omreview"));
    assert.equal("command" in doc, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP data resources survive stateless server reconstruction", async () => {
  const { Client } = await import("@modelcontextprotocol/client");
  const { InMemoryTransport } = await import("@modelcontextprotocol/server");
  const { buildServer } = await import("../src/server.ts");
  const { RepositoryProvider } = await import("../src/repository.ts");
  const dir = await mkdtemp(tmpdir() + "/review-resource-");
  const store = new ReviewStore(dir),
    provider = new RepositoryProvider([]);
  const r = await store.open({
    schema: "openmuse.repository-review/1",
    title: "Native",
    source: { kind: "versions", provider: "Host" },
    files: [{ path: "a.txt", status: "modified", before: "a", after: "b" }],
  });
  async function connect() {
    const server = buildServer(store, provider, async () => "<html></html>");
    const client = new Client({
      name: "independent-native-viewer",
      version: "1",
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return { server, client };
  }
  let value: any;
  const first = await connect();
  try {
    const r = await first.client.callTool({
      name: "review_viewer",
      arguments: { comparisonId: store.list().comparisons[0].id },
    });
    assert.equal(r.isError, undefined);
    value = r.structuredContent;
  } finally {
    await first.client.close();
    await first.server.close();
  }
  const second = await connect();
  try {
    const list = await second.client.listResources();
    assert.ok(list.resources.some((r) => r.uri === value.uri));
    const r = await second.client.readResource({ uri: value.uri });
    assert.equal(
      createHash("sha256")
        .update((r.contents[0] as any).text)
        .digest("hex"),
      value.sha256,
    );
  } finally {
    await second.client.close();
    await second.server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("frozen native resources survive process restart and reject tampered disk bytes", async () => {
  const { loadViewerResources, saveViewerResource, viewerResources } =
    await import("../src/viewer-resources.ts");
  const { writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(tmpdir() + "/review-durable-resource-");
  try {
    const first = new ReviewStore(dir);
    const r = await first.open({
      schema: "openmuse.repository-review/1",
      title: "Durable native",
      source: { kind: "versions", provider: "Host" },
      files: [
        { path: "a.txt", status: "modified", before: "old", after: "new" },
      ],
    });
    const snapshot = await viewerSnapshot(first, r.id);
    await saveViewerResource(first, snapshot);
    const restored = new ReviewStore(dir);
    await restored.load();
    await loadViewerResources(restored);
    assert.equal(
      viewerResources(restored).get(snapshot.uri)?.text,
      snapshot.text,
    );
    await writeFile(
      dir + "/viewer-resources/" + snapshot.sha256 + ".json",
      snapshot.text + " ",
    );
    await assert.rejects(
      () => loadViewerResources(new ReviewStore(dir)),
      /VIEWER_RESOURCE_INTEGRITY/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
