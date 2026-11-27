import type { Comparison } from "../src/contract.ts";

/** Source identity stays visible while the content occupies the workspace. */
export function comparisonLabel(source?: Comparison["source"]): string {
  if (!source) return "选择比较来源";
  const short = (ref?: string) =>
    ref
      ? /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(ref)
        ? ref.slice(0, 7)
        : ref
      : "未指定";
  if (source.kind === "mr")
    return `MR #${source.number ?? "—"} · ${short(source.headSha || source.headRef)}`;
  if (source.kind === "branch")
    return `分支 · ${short(source.baseRef)} ← ${short(source.headRef)}`;
  if (source.kind === "commit")
    return `提交 · ${short(source.headSha || source.headRef)}`;
  const name = {
    workspace: "工作区 · 未提交",
    staged: "暂存区",
    versions: "文件版本",
  }[source.kind];
  return source.headSha ? `${name} · ${short(source.headSha)}` : name;
}
