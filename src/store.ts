import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { comparisonSchema, type Comparison } from "./contract.ts";
import { buildHunks } from "./diff-model.ts";

export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface Note {
  id: string;
  path: string;
  side: "left" | "right";
  line: number;
  body: string;
  at: string;
  actor: string;
  resolved: boolean;
}
interface RecordState {
  id: string;
  digest: string;
  comparison: Comparison;
  createdAt: string;
  notes: Note[];
  viewed: string[];
  decision: "pending" | "changes_requested" | "accepted";
  commands: Record<string, { fingerprint: string; result: unknown }>;
}
export class ReviewStore {
  private records = new Map<string, RecordState>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly directory: string,
    readonly actor = "workspace-owner (delegated)",
  ) {}
  async load() {
    try {
      const data = JSON.parse(
        await readFile(path.join(this.directory, "reviews.json"), "utf8"),
      );
      if (
        data.schema !== "openmuse.review-store/1" ||
        !Array.isArray(data.records) ||
        data.records.length > 100
      )
        throw Error("REVIEW_STORE_INVALID");
      for (const raw of data.records) {
        const comparison = comparisonSchema.parse(raw.comparison);
        if (raw.digest !== digest(comparison))
          throw Error("REVIEW_STORE_INTEGRITY");
        this.records.set(raw.id, { ...raw, comparison });
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  private async save() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const tmp = path.join(this.directory, randomUUID() + ".tmp");
    await writeFile(
      tmp,
      JSON.stringify({
        schema: "openmuse.review-store/1",
        records: [...this.records.values()],
      }),
      { mode: 0o600, flush: true },
    );
    await rename(tmp, path.join(this.directory, "reviews.json"));
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
  async open(input: unknown) {
    return this.serial(async () => {
      const comparison = comparisonSchema.parse(input);
      if (Buffer.byteLength(JSON.stringify(comparison)) > 4 * 1024 * 1024)
        throw Error("COMPARISON_BUDGET_EXCEEDED");
      const hash = digest(comparison),
        existing = [...this.records.values()].find((r) => r.digest === hash);
      if (existing) {
        const previous = [...this.records.entries()];
        this.records.delete(existing.id);
        this.records.set(existing.id, existing);
        try {
          await this.save();
        } catch (e) {
          this.records = new Map(previous);
          throw e;
        }
        return this.summary(existing);
      }
      if (this.records.size >= 100) throw Error("COMPARISON_LIMIT_REACHED");
      const r: RecordState = {
        id: randomUUID(),
        digest: hash,
        comparison,
        createdAt: new Date().toISOString(),
        notes: [],
        viewed: [],
        decision: "pending",
        commands: {},
      };
      this.records.set(r.id, r);
      try {
        await this.save();
      } catch (e) {
        this.records.delete(r.id);
        throw e;
      }
      return this.summary(r);
    });
  }
  private get(id: string) {
    const r = this.records.get(id);
    if (!r) throw Error("COMPARISON_NOT_FOUND");
    return r;
  }
  private summary(r: RecordState) {
    return {
      id: r.id,
      digest: r.digest,
      title: r.comparison.title,
      source: r.comparison.source,
      createdAt: r.createdAt,
      fileCount: r.comparison.files.length,
      incomplete: r.comparison.incomplete,
      viewed: r.viewed,
      noteCount: r.notes.length,
      decision: r.decision,
      actor: this.actor,
      platformApproval: false,
    };
  }
  list() {
    return {
      comparisons: [...this.records.values()]
        .reverse()
        .map((r) => this.summary(r)),
    };
  }
  read(id: string, filePath?: string) {
    const r = this.get(id);
    const file = filePath
      ? r.comparison.files.find((f) => f.path === filePath)
      : undefined;
    if (filePath && !file) throw Error("FILE_NOT_IN_COMPARISON");
    return {
      ...this.summary(r),
      files: r.comparison.files.map(
        ({ before, after, patch, ...meta }) => meta,
      ),
      ...(file ? { file } : {}),
      notes: r.notes,
    };
  }
  async change(a: {
    comparisonId: string;
    expectedDigest: string;
    commandId: string;
    path?: string;
    viewed?: boolean;
    side?: "left" | "right";
    line?: number;
    body?: string;
    noteId?: string;
    resolved?: boolean;
    decision?: RecordState["decision"];
  }) {
    return this.serial(async () => {
      const r = this.get(a.comparisonId),
        previous = structuredClone(r);
      if (r.digest !== a.expectedDigest) throw Error("COMPARISON_CHANGED");
      const hash = digest(a),
        old = r.commands[a.commandId];
      if (old) {
        if (old.fingerprint !== hash) throw Error("COMMAND_ID_REUSED");
        return old.result;
      }
      if (Object.keys(r.commands).length >= 2000)
        throw Error("REVIEW_COMMAND_LIMIT");
      if (a.decision) {
        if (
          a.decision === "accepted" &&
          (r.comparison.incomplete ||
            r.comparison.files.some(
              (f) =>
                f.truncated ||
                f.patchUnavailable ||
                (f.binary
                  ? !f.beforeInfo || !f.afterInfo
                  : buildHunks(f).partial),
            ) ||
            r.viewed.length !== r.comparison.files.length ||
            r.notes.some((n) => !n.resolved))
        )
          throw Error("REVIEW_NOT_COMPLETE");
        r.decision = a.decision;
      } else if (a.noteId) {
        const note = r.notes.find((n) => n.id === a.noteId);
        if (!note || a.resolved === undefined) throw Error("NOTE_NOT_FOUND");
        note.resolved = a.resolved;
        r.decision = "pending";
      } else {
        const file = r.comparison.files.find((f) => f.path === a.path);
        if (!file) throw Error("FILE_NOT_IN_COMPARISON");
        if (a.viewed !== undefined) {
          r.viewed = r.viewed.filter((p) => p !== a.path);
          if (a.viewed) r.viewed.push(a.path!);
        } else {
          if (!a.body?.trim() || !a.line || !a.side)
            throw Error("NOTE_ANCHOR_REQUIRED");
          const model = buildHunks(file),
            line = model.hunks
              .flatMap((h) => h.lines)
              .find(
                (l) => (a.side === "left" ? l.oldLine : l.newLine) === a.line,
              );
          if (!line) throw Error("NOTE_ANCHOR_INVALID");
          if (r.notes.length >= 500) throw Error("REVIEW_NOTE_LIMIT");
          r.notes.push({
            id: randomUUID(),
            path: a.path!,
            side: a.side,
            line: a.line,
            body: a.body.trim(),
            at: new Date().toISOString(),
            actor: this.actor,
            resolved: false,
          });
        }
        r.decision = "pending";
      }
      const result = {
        comparisonId: r.id,
        digest: r.digest,
        commandId: a.commandId,
        applied: true,
        decision: r.decision,
      };
      r.commands[a.commandId] = { fingerprint: hash, result };
      try {
        await this.save();
      } catch (e) {
        this.records.set(r.id, previous);
        throw e;
      }
      return result;
    });
  }
  export(id: string) {
    const r = this.get(id);
    return {
      schema: "openmuse.repository-review-receipt/1",
      comparison: this.summary(r),
      viewed: r.viewed,
      notes: r.notes,
      platformApproval: false,
      merged: false,
    };
  }
}
