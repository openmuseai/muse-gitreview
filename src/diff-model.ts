import { structuredPatch, parsePatch, diffWordsWithSpace } from "diff";
import type { ChangeFile } from "./contract.ts";
export interface DiffLine {
  kind: "context" | "add" | "delete" | "meta";
  text: string;
  oldLine?: number;
  newLine?: number;
  hunk: number;
  changes?: { start: number; end: number }[];
}
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}
export function buildHunks(file: ChangeFile): {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  partial: boolean;
  warning?: string;
} {
  if (file.binary || file.patchUnavailable)
    return {
      hunks: [],
      additions: 0,
      deletions: 0,
      partial: true,
      warning: file.binary
        ? "二进制文件 · 无文本补丁"
        : "来源未提供补丁，请在来源中核对",
    };
  let source;
  if (file.before !== undefined && file.after !== undefined) {
    source = structuredPatch(
      "before",
      "after",
      file.before,
      file.after,
      undefined,
      undefined,
      { context: 3, timeout: 150, maxEditLength: 25000 },
    );
    if (!source)
      return {
        hunks: [],
        additions: 0,
        deletions: 0,
        partial: true,
        warning: "变更超过比较预算，请缩小范围",
      };
  } else {
    try {
      const raw = file.patch || "";
      const parsed = parsePatch(
        raw.startsWith("diff ") || raw.startsWith("--- ")
          ? raw
          : "--- before\n+++ after\n" + raw,
      );
      if (parsed.length !== 1) throw Error("AMBIGUOUS_PATCH");
      if (
        !parsed[0].hunks.length &&
        !["renamed", "unchanged"].includes(file.status)
      )
        throw Error("PATCH_BODY_MISSING");
      source = parsed[0];
    } catch {
      return {
        hunks: [],
        additions: 0,
        deletions: 0,
        partial: true,
        warning: "补丁不完整或无法解析；请核对来源中的完整变更",
      };
    }
  }
  let additions = 0,
    deletions = 0;
  const hunks = source.hunks.map((h, index) => {
    let oldLine = h.oldStart,
      newLine = h.newStart;
    const lines: DiffLine[] = h.lines.map((raw) => {
      const prefix = raw[0],
        text = raw.slice(1);
      if (prefix === "+") {
        additions++;
        return { kind: "add", text, newLine: newLine++, hunk: index };
      }
      if (prefix === "-") {
        deletions++;
        return { kind: "delete", text, oldLine: oldLine++, hunk: index };
      }
      if (prefix === " ") {
        return {
          kind: "context",
          text,
          oldLine: oldLine++,
          newLine: newLine++,
          hunk: index,
        };
      }
      return { kind: "meta", text: raw, hunk: index };
    });
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].kind !== "delete") continue;
      const removed: DiffLine[] = [],
        added: DiffLine[] = [];
      let end = i;
      while (lines[end]?.kind === "delete") removed.push(lines[end++]);
      while (lines[end]?.kind === "add") added.push(lines[end++]);
      for (let j = 0; j < Math.min(removed.length, added.length, 100); j++) {
        if (removed[j].text.length + added[j].text.length > 10000) continue;
        const parts = diffWordsWithSpace(removed[j].text, added[j].text, {
          timeout: 20,
          maxEditLength: 3000,
        });
        if (!parts) continue;
        let left = 0,
          right = 0;
        removed[j].changes = [];
        added[j].changes = [];
        for (const part of parts) {
          if (part.removed) {
            removed[j].changes!.push({
              start: left,
              end: left + part.value.length,
            });
            left += part.value.length;
          } else if (part.added) {
            added[j].changes!.push({
              start: right,
              end: right + part.value.length,
            });
            right += part.value.length;
          } else {
            left += part.value.length;
            right += part.value.length;
          }
        }
      }
      i = end - 1;
    }
    return {
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines,
    };
  });
  return {
    hunks,
    additions,
    deletions,
    partial: file.truncated,
    warning: file.truncated ? "补丁已截断 · 以下不是完整变更" : undefined,
  };
}
export function pairedRows(lines: DiffLine[]) {
  const rows: { left?: DiffLine; right?: DiffLine }[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (line.kind === "context" || line.kind === "meta") {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }
    const left: DiffLine[] = [],
      right: DiffLine[] = [];
    while (lines[i]?.kind === "delete") left.push(lines[i++]);
    while (lines[i]?.kind === "add") right.push(lines[i++]);
    for (let j = 0; j < Math.max(left.length, right.length); j++)
      rows.push({ left: left[j], right: right[j] });
  }
  return rows;
}
