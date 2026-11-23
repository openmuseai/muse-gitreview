import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

test("portable MCPB serves the exact self-contained UI through an independent stdio client", async () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "pipe" });
  execFileSync(process.execPath, ["scripts/pack.mjs"], { stdio: "pipe" });
  const html = await readFile("dist/index.html", "utf8");
  assert.equal(
    (html.match(/<\/script\s*>/gi) || []).length,
    1,
    "grammar replacement patterns must not inject the surrounding HTML",
  );
  const script = html.slice(
    html.indexOf("<script>") + 8,
    html.lastIndexOf("</script>"),
  );
  assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(
    html.includes("RR-WEB-01") === false,
    "inspection notes must not be bundled",
  );
  const dir = await mkdtemp(path.join(tmpdir(), "review-package-"));
  let client: Client | undefined;
  try {
    const config = path.join(dir, "config.json");
    await writeFile(
      config,
      JSON.stringify({
        actor: "package-test",
        dataDirectory: path.join(dir, "reviews"),
        repositories: [],
      }),
    );
    client = new Client({ name: "standalone-packed-consumer", version: "1" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.resolve("dist/package/server.mjs")],
        env: { PATH: process.env.PATH || "", REVIEW_CONFIG: config },
      }),
    );
    const resource = await client.readResource({
      uri: "ui://repository-review/main",
    });
    assert.equal((resource.contents[0] as any).text, html);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "repository_compare"));
    assert.ok(tools.tools.some((t) => t.name === "review_change"));
    const sources = await client.callTool({
      name: "review_sources",
      arguments: {},
    });
    assert.deepEqual((sources.structuredContent as any).repositories, []);
  } finally {
    await client?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
