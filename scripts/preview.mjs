// Development-only web inspection of the actual MCP App. Backend credentials
// stay here. This harness is not Desktop or Mobile acceptance evidence.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
const token = (await readFile(".data/backend.token", "utf8")).trim(),
  client = new Client({ name: "local-web-inspection", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:4191/mcp"), {
    requestInit: { headers: { authorization: "Bearer " + token } },
  }),
);
const script = (
  await build({
    entryPoints: ["web/preview-host.ts"],
    bundle: true,
    format: "esm",
    write: false,
  })
).outputFiles[0].text;
const origin = "http://127.0.0.1:4192";
createServer(async (req, res) => {
  try {
    if (req.headers.host !== "127.0.0.1:4192") {
      res.writeHead(403);
      return res.end();
    }
    if (req.method === "GET" && req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Repository Review · Web inspection</title></head><body style="margin:0"><iframe title="Repository Review" style="width:100%;height:100dvh;border:0" sandbox="allow-scripts allow-same-origin"></iframe><script type="module">' +
          script.replace(/<\/script/gi, "<\\/script") +
          "</script></body></html>",
      );
    } else if (req.method === "GET" && req.url === "/view") {
      res.setHeader("Content-Type", "text/html");
      res.end(await readFile("dist/index.html"));
    } else if (
      req.method === "POST" &&
      req.url === "/tool" &&
      req.headers.origin === origin
    ) {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 6 * 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      const args = JSON.parse(body),
        result = await client.callTool(args);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch {
    res.writeHead(502);
    res.end("REVIEW_INSPECTION_FAILED");
  }
}).listen(4192, "127.0.0.1", () =>
  console.log("Actual MCP App inspection http://127.0.0.1:4192"),
);
