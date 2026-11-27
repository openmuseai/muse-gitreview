import type { ChangeFile } from "./contract.ts";
import type { DiffHunk, DiffLine } from "./diff-model.ts";

export interface ContextGap {
  id: string;
  oldStart: number;
  newStart: number;
  lines: string[];
}
export type DiffSection = { hunk: DiffHunk } | { gap: ContextGap };

const sourceLines = (text: string) => {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

/** Add only context verified against both immutable texts and patch anchors. */
export function contextSections(
  file: ChangeFile,
  hunks: DiffHunk[],
): DiffSection[] {
  if (file.before === undefined || file.after === undefined)
    return hunks.map((hunk) => ({ hunk }));
  const old = sourceLines(file.before),
    next = sourceLines(file.after);
  const sections: DiffSection[] = [];
  let oldEnd = 0,
    newEnd = 0;
  const gap = (oldStop: number, newStop: number) => {
    const left = old.slice(oldEnd, oldStop),
      right = next.slice(newEnd, newStop);
    if (
      oldStop < oldEnd ||
      newStop < newEnd ||
      left.length !== right.length ||
      left.some((line, i) => line !== right[i])
    )
      throw Error("CONTEXT_SNAPSHOT_MISMATCH");
    if (left.length)
      sections.push({
        gap: {
          id: `${oldEnd}:${newEnd}`,
          oldStart: oldEnd + 1,
          newStart: newEnd + 1,
          lines: left,
        },
      });
  };
  for (const hunk of hunks) {
    // jsdiff normalizes an empty side to line 1; Git patches can use line 0.
    const oldStart = Math.min(
      old.length,
      Math.max(0, hunk.oldStart - (hunk.oldLines ? 1 : 0)),
    );
    const newStart = Math.min(
      next.length,
      Math.max(0, hunk.newStart - (hunk.newLines ? 1 : 0)),
    );
    gap(oldStart, newStart);
    for (const line of hunk.lines) {
      if (line.kind === "meta") continue;
      if (
        (line.oldLine !== undefined && old[line.oldLine - 1] !== line.text) ||
        (line.newLine !== undefined && next[line.newLine - 1] !== line.text)
      )
        throw Error("CONTEXT_SNAPSHOT_MISMATCH");
    }
    sections.push({ hunk });
    oldEnd = oldStart + hunk.oldLines;
    newEnd = newStart + hunk.newLines;
  }
  gap(old.length, next.length);
  return sections;
}

export function contextLines(gap: ContextGap): DiffLine[] {
  return gap.lines.map((text, i) => ({
    kind: "context",
    text,
    oldLine: gap.oldStart + i,
    newLine: gap.newStart + i,
    hunk: -1,
  }));
}
