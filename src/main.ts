import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ReviewStore } from "./store.ts";
import { RepositoryProvider } from "./repository.ts";
import { buildServer } from "./server.ts";

const config = z
  .object({
    actor: z.string().max(160),
    dataDirectory: z.string(),
    repositories: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9._-]+$/),
            title: z.string().max(120),
            root: z.string(),
            github: z
              .object({
                owner: z.string().regex(/^[\w-]+$/),
                repository: z.string().regex(/^[\w.-]+$/),
                tokenFile: z.string(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .parse(
    JSON.parse(
      await readFile(process.env.REVIEW_CONFIG || ".data/config.json", "utf8"),
    ),
  );
const store = new ReviewStore(config.dataDirectory, config.actor);
await store.load();
const provider = new RepositoryProvider(config.repositories),
  html = () => readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const make = () => buildServer(store, provider, html);
if (!process.argv.includes("--http")) await serveStdio(make);
else {
  const token = process.env.REVIEW_MCP_TOKEN;
  if (!token || token.length < 24) throw Error("REVIEW_MCP_TOKEN_REQUIRED");
  const port = Number(process.env.REVIEW_PORT || 4191),
    origin = "http://127.0.0.1:" + port,
    handler = createMcpHandler(make, { legacy: "stateless" });
  const equal = (a: string, b: string) =>
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b));
  createServer(async (req, res) => {
    try {
      if (
        !["127.0.0.1:" + port, "localhost:" + port].includes(
          req.headers.host || "",
        ) ||
        (req.headers.origin && req.headers.origin !== origin)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (
        req.url !== "/mcp" ||
        !equal(req.headers.authorization || "", "Bearer " + token)
      ) {
        res.writeHead(401);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 6 * 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
      const response = await handler.fetch(
        new Request(origin + "/mcp", {
          method: req.method,
          headers: req.headers as Record<string, string>,
          ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        for await (const chunk of response.body as any) res.write(chunk);
      res.end();
    } catch {
      res.writeHead(500);
      res.end("REVIEW_REQUEST_FAILED");
    }
  }).listen(port, "127.0.0.1", () =>
    console.log("Repository Review private MCP ready"),
  );
}
