import { z } from "zod";
export const fileSchema = z
  .object({
    path: z.string().min(1).max(1024),
    previousPath: z.string().max(1024).optional(),
    status: z.enum([
      "added",
      "deleted",
      "modified",
      "renamed",
      "copied",
      "unchanged",
    ]),
    before: z.string().max(1_000_000).optional(),
    after: z.string().max(1_000_000).optional(),
    patch: z.string().max(1_000_000).optional(),
    binary: z.boolean().default(false),
    truncated: z.boolean().default(false),
    patchUnavailable: z.boolean().default(false),
    beforeInfo: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteLength: z.number().int().min(0),
        base64: z.string().max(1_200_000).optional(),
      })
      .strict()
      .optional(),
    afterInfo: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteLength: z.number().int().min(0),
        base64: z.string().max(1_200_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((f, c) => {
    if (
      !f.binary &&
      !f.patchUnavailable &&
      f.patch === undefined &&
      (f.before === undefined || f.after === undefined)
    )
      c.addIssue({
        code: "custom",
        message: "A comparison needs both native snapshots or a supplied patch",
      });
  });
export const comparisonSchema = z
  .object({
    schema: z.literal("openmuse.repository-review/1"),
    title: z.string().min(1).max(200),
    source: z
      .object({
        kind: z.enum([
          "versions",
          "workspace",
          "staged",
          "branch",
          "commit",
          "mr",
        ]),
        provider: z.string().min(1).max(160),
        repository: z.string().max(300).optional(),
        baseRef: z.string().max(200).optional(),
        headRef: z.string().max(200).optional(),
        headSha: z
          .string()
          .regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/)
          .optional(),
        number: z.number().int().positive().optional(),
      })
      .strict(),
    files: z.array(fileSchema).max(300),
    incomplete: z.boolean().default(false),
  })
  .strict();
export type Comparison = z.infer<typeof comparisonSchema>;
export type ChangeFile = z.infer<typeof fileSchema>;
export const publicContract = {
  profile: "openmuse-capabilities/1",
  contracts: [
    {
      id: "https://plugins.openmuseai.com/contracts/repository-review/v1",
      version: "1.0.0",
      title: "Repository Review · immutable comparison review",
      mediaType: "application/vnd.openmuse.repository-review+json",
      operations: {
        sources: "review_sources",
        compare: "repository_compare",
        history: "repository_history",
        readFile: "repository_read",
        open: "review_open",
        readSnapshot: "review_read",
        list: "review_list",
        annotate: "review_change",
        export: "review_export",
        openFileViewer: "review_viewer",
      },
      tools: [
        "review_sources",
        "repository_compare",
        "repository_history",
        "repository_read",
        "review_open",
        "review_read",
        "review_list",
        "review_change",
        "review_export",
        "review_viewer",
      ],
      semantics:
        "Granted repository sources and immutable Host-supplied snapshots; attributed local review. Host remains the file-version authority. No platform approval, merge or arbitrary shell.",
    },
  ],
};
