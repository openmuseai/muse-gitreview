import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewStore } from "./store.ts";
import type { viewerSnapshot } from "./viewer.ts";
export type ViewerSnapshot = Awaited<ReturnType<typeof viewerSnapshot>>;
const caches = new WeakMap<ReviewStore, Map<string, ViewerSnapshot>>();
export function viewerResources(store: ReviewStore) {
  let cache = caches.get(store);
  if (!cache) {
    cache = new Map();
    caches.set(store, cache);
  }
  return cache;
}
export async function loadViewerResources(store: ReviewStore) {
  const directory = path.join(store.directory, "viewer-resources");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error: any) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const name of names
    .filter((n) => /^[a-f0-9]{64}\.json$/.test(n))
    .slice(0, 100)) {
    const text = await readFile(path.join(directory, name), "utf8"),
      hash = name.slice(0, -5);
    if (
      Buffer.byteLength(text) > 8 * 1024 * 1024 ||
      createHash("sha256").update(text).digest("hex") !== hash
    )
      throw Error("VIEWER_RESOURCE_INTEGRITY");
    const doc = JSON.parse(text);
    if (
      doc.schema !== "openmuse.review-viewer/1" ||
      !/^[a-f0-9-]{36}$/.test(doc.comparisonId)
    )
      throw Error("VIEWER_RESOURCE_INTEGRITY");
    const uri = `review://snapshot/${hash}`;
    viewerResources(store).set(uri, {
      uri,
      text,
      sha256: hash,
      name: `Review-${doc.comparisonId.slice(0, 8)}.omreview`,
      mimeType: "application/vnd.openmuse.review-viewer+json",
    });
  }
}
export async function saveViewerResource(
  store: ReviewStore,
  snapshot: ViewerSnapshot,
) {
  const cache = viewerResources(store);
  if (cache.has(snapshot.uri)) return;
  if (cache.size >= 100) throw Error("VIEWER_RESOURCE_LIMIT");
  const directory = path.join(store.directory, "viewer-resources");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tmp = path.join(directory, randomUUID() + ".tmp");
  await writeFile(tmp, snapshot.text, { mode: 0o600, flush: true });
  await rename(tmp, path.join(directory, snapshot.sha256 + ".json"));
  cache.set(snapshot.uri, snapshot);
}
