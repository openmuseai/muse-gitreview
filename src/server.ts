import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { comparisonSchema, publicContract } from "./contract.ts";
import { ReviewStore } from "./store.ts";
import { RepositoryProvider } from "./repository.ts";

export const uri = "ui://repository-review/main";
const uuid = z.string().uuid(),
  filePath = z.string().min(1).max(1024);
const compareInput = z
  .object({
    repositoryId: z.string().min(1).max(100),
    kind: z.enum(["workspace", "staged", "branch", "commit", "mr"]),
    baseRef: z.string().max(200).optional(),
    headRef: z.string().max(200).optional(),
    number: z.number().int().positive().optional(),
  })
  .strict();
export function buildServer(
  store: ReviewStore,
  provider: RepositoryProvider,
  html: () => Promise<string>,
) {
  const server = new McpServer(
    { name: "io.openmuse.repository-review", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } },
  );
  server.registerResource(
    "Repository Review",
    uri,
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri,
          mimeType: "text/html;profile=mcp-app",
          text: await html(),
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
        },
      ],
    }),
  );
  server.registerResource(
    "Public contracts",
    "capability://repository-review/contracts",
    { mimeType: "application/vnd.openmuse.capabilities+json" },
    async () => ({
      contents: [
        {
          uri: "capability://repository-review/contracts",
          mimeType: "application/vnd.openmuse.capabilities+json",
          text: JSON.stringify(publicContract),
        },
      ],
    }),
  );
  const register = (
    name: string,
    inputSchema: any,
    fn: (a: any) => unknown,
    readOnly = true,
    description = name,
  ) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        outputSchema: z.object({}).catchall(z.unknown()),
        annotations: { readOnlyHint: readOnly, openWorldHint: false },
        ...(["review_list", "review_open", "repository_compare"].includes(name)
          ? { _meta: { ui: { resourceUri: uri } } }
          : {}),
      },
      async (a: any) => {
        try {
          const result = (await fn(a)) as Record<string, unknown>;
          return {
            structuredContent: result,
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          };
        } catch (e) {
          const code =
            e instanceof Error && /^[A-Z0-9_]+$/.test(e.message)
              ? e.message
              : "REVIEW_REQUEST_FAILED";
          return {
            isError: true,
            content: [{ type: "text" as const, text: code }],
          };
        }
      },
    );
  register("review_sources", z.object({}).strict(), () => provider.list());
  register(
    "repository_history",
    z.object({ repositoryId: z.string(), path: filePath.optional() }).strict(),
    (a) => provider.history(a.repositoryId, a.path),
  );
  register(
    "repository_read",
    z
      .object({
        repositoryId: z.string(),
        ref: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/),
        path: filePath,
      })
      .strict(),
    (a) => provider.read(a.repositoryId, a.ref, a.path),
  );
  register(
    "repository_compare",
    compareInput,
    async (a) => store.open(await provider.compare(a)),
    false,
    "Pin a granted repository workspace, index, branch, commit or MR into an immutable review snapshot.",
  );
  register(
    "review_open",
    comparisonSchema,
    (a) => store.open(a),
    false,
    "Open externally supplied Host versions or provider patches; never resolves arbitrary filesystem paths.",
  );
  register("review_list", z.object({}).strict(), () => store.list());
  register(
    "review_read",
    z.object({ comparisonId: uuid, path: filePath.optional() }).strict(),
    (a) => store.read(a.comparisonId, a.path),
  );
  register(
    "review_change",
    z
      .object({
        comparisonId: uuid,
        expectedDigest: z.string().regex(/^[a-f\d]{64}$/),
        commandId: uuid,
        path: filePath.optional(),
        viewed: z.boolean().optional(),
        side: z.enum(["left", "right"]).optional(),
        line: z.number().int().min(1).max(1000000).optional(),
        body: z.string().max(10000).optional(),
        noteId: uuid.optional(),
        resolved: z.boolean().optional(),
        decision: z
          .enum(["pending", "changes_requested", "accepted"])
          .optional(),
      })
      .strict(),
    (a) => store.change(a),
    false,
    "Record attributed, hash-bound local review state. This is not code-platform approval or merge.",
  );
  register("review_export", z.object({ comparisonId: uuid }).strict(), (a) =>
    store.export(a.comparisonId),
  );
  return server;
}
