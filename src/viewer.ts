import { createHash } from "node:crypto";
import type { ReviewStore } from "./store.ts";
import { buildHunks } from "./diff-model.ts";
import type { RepositoryProvider } from "./repository.ts";

/** Immutable, passive document consumed by Open File Viewer. No paths or commands. */
export async function viewerSnapshot(
  store: ReviewStore,
  id: string,
  provider?: RepositoryProvider,
) {
  const review = store.read(id);
  const files = [];
  let usedBytes = 0;
  for (const meta of review.files) {
    const file = structuredClone(store.read(id, meta.path).file!);
    if (
      provider &&
      review.source.repository &&
      ["branch", "commit", "mr"].includes(review.source.kind)
    ) {
      for (const side of ["before", "after"] as const) {
        if (file[side] !== undefined || file.binary) continue;
        if (
          (side === "before" && file.status === "added") ||
          (side === "after" && file.status === "deleted")
        ) {
          file[side] = "";
          continue;
        }
        const ref =
          side === "before" ? review.source.baseRef : review.source.headSha;
        if (!ref || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(ref)) continue;
        try {
          const content = await provider.read(
            review.source.repository,
            ref,
            side === "before" ? file.previousPath || file.path : file.path,
          );
          if (
            content.text !== undefined &&
            usedBytes + content.byteLength <= 2 * 1024 * 1024
          ) {
            file[side] = content.text;
            usedBytes += content.byteLength;
          }
        } catch {
          /* Keep the original patch and explicit missing-fulltext state. */
        }
      }
    }
    const full = file.before !== undefined && file.after !== undefined;
    files.push({
      ...file,
      ...buildHunks(full ? { ...file, patchUnavailable: false } : file),
    });
  }
  const text = JSON.stringify({
    schema: "openmuse.review-viewer/1",
    comparisonId: id,
    digest: review.digest,
    title: review.title,
    source: review.source,
    incomplete: review.incomplete,
    viewed: review.viewed,
    notes: review.notes,
    files,
  });
  if (Buffer.byteLength(text) > 8 * 1024 * 1024)
    throw Error("VIEWER_BUDGET_EXCEEDED");
  const sha256 = createHash("sha256").update(text).digest("hex");
  const uri = `review://snapshot/${sha256}`;
  return {
    text,
    uri,
    sha256,
    name: `Review-${id.slice(0, 8)}.omreview`,
    mimeType: "application/vnd.openmuse.review-viewer+json",
  };
}
