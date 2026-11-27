import { App } from "@modelcontextprotocol/ext-apps";
import { buildHunks, pairedRows, type DiffLine } from "../src/diff-model.ts";
import type { ChangeFile } from "../src/contract.ts";
import { escape as e, tokenize, lineHtml } from "./highlight.ts";

const app = new App({ name: "Repository Review", version: "0.2.0" }, {});
function applyHostContext(context = app.getHostContext()) {
  if (context?.theme) {
    document.documentElement.dataset.hostTheme = context.theme;
    document.documentElement.style.colorScheme = context.theme;
  }
  if (context?.locale) document.documentElement.lang = context.locale;
}
app.onhostcontextchanged = () => applyHostContext();
const root = document.querySelector<HTMLElement>("#app")!,
  dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
let sources: any[] = [],
  sessions: any[] = [],
  review: any = null,
  file: ChangeFile | null = null;
let repositoryId = "",
  kind = "workspace",
  baseRef = "main",
  headRef = "HEAD",
  mrNumber = "3",
  view = "unified",
  page = 0,
  busy = false,
  mode = "diff";
let hostResources: any[] = [],
  hostWritable = false,
  resourceId = "",
  versions: any[] = [],
  beforeVersion = "",
  afterVersion = "",
  current: any = null;
const collapsedDirectories = new Set<string>();
let sidebarVisible = window.innerWidth >= 768,
  fileFilter = "",
  treeMode = false;
let treeFiles: any[] = [],
  treeRef = "",
  treeRepository = "",
  treeTruncated = false;
let notesVisible = false;
const sourceLabels: Record<string, string> = {
  workspace: "工作区 · 未提交",
  staged: "暂存区",
  branch: "分支比较",
  commit: "提交比较",
  mr: "MR",
};
let directorySources: any[] = [],
  directoryAvailable = false,
  directoryEpoch = 0;
let sourceDraftBackup: {
  repositoryId: string;
  kind: string;
  baseRef: string;
  headRef: string;
  mrNumber: string;
} | null = null;
function cancelSourceDraft() {
  if (!sourceDraftBackup) return;
  ({ repositoryId, kind, baseRef, headRef, mrNumber } = sourceDraftBackup);
  sourceDraftBackup = null;
}
async function browseDirectories(
  source?: any,
  nodeRef = "root",
  breadcrumbs: any[] = [],
  cursor?: string,
  previous: any[] = [],
) {
  const epoch = ++directoryEpoch;
  modal(
    `<h2>选择远程 Git 仓库</h2><p>正在读取首页已授权目录…</p><button data-action="close">取消</button>`,
  );
  if (!directoryAvailable) {
    dialog.querySelector("p")!.textContent =
      "当前应用尚未获得目录访问权限。请使用已授权仓库，或由工作区管理员授权。";
    return;
  }
  if (!source) {
    try {
      directorySources = (await call("host_directory_sources")).sources;
      if (epoch !== directoryEpoch) return;
      modal(
        `<h2>选择设备与目录</h2><p>复用首页已授权来源。离线设备不会扩大或恢复授权。</p>${directorySources.map((s, i) => `<button class="history-item" data-directory-source="${i}" ${!s.available ? "disabled" : ""}>${e(s.device)} / ${e(s.name)}<span>${s.local ? "服务设备" : "远程"} · ${s.available ? "在线" : "离线"}</span></button>`).join("") || "<p>尚未向此插件授权目录来源。</p>"}<button data-action="close">取消</button>`,
      );
      dialog
        .querySelectorAll<HTMLElement>("[data-directory-source]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              void browseDirectories(
                directorySources[Number(b.dataset.directorySource)],
              )),
        );
    } catch (error) {
      if (epoch === directoryEpoch)
        directoryError(error, () => void browseDirectories());
    }
    return;
  }
  try {
    const page = await call("host_directory_list", {
      sourceKey: source.sourceKey,
      nodeRef,
      ...(cursor ? { cursor } : {}),
    });
    const binding = await call("host_directory_repository", {
      sourceKey: source.sourceKey,
      nodeRef,
    });
    if (epoch !== directoryEpoch) return;
    const entries = [...previous, ...page.directories];
    const granted = sources.find((r) => r.id === binding.repositoryId);
    modal(
      `<div class="row"><h2>选择 Git 仓库</h2><button data-action="close">取消</button></div><p>${e(source.device)} / ${e(source.name)} ${breadcrumbs.map((b) => " / " + e(b.name)).join("")}</p><button id="directory-up" ${!breadcrumbs.length ? "disabled" : ""}>返回上一级</button><div>${entries.map((d, i) => `<button class="history-item" data-directory-index="${i}">${e(d.name)} <span>文件夹 ›</span></button>`).join("") || '<p class="muted">此目录下没有子目录。</p>'}</div>${page.nextCursor ? '<button id="directory-more">加载更多目录</button>' : ""}<p>${granted ? "已关联授权仓库：" + e(granted.title) + "。确认时验证 Git 并读取比较。" : "此目录尚未关联已授权 Git 仓库。可继续浏览，不能仅凭目录可见扩大仓库权限。"}</p><button class="primary" data-action="select-repository" data-id="${e(granted?.id || "")}" ${!granted ? "disabled" : ""}>使用此仓库</button>`,
    );
    dialog.querySelectorAll<HTMLElement>("[data-directory-index]").forEach(
      (b) =>
        (b.onclick = () => {
          const d = entries[Number(b.dataset.directoryIndex)];
          void browseDirectories(source, d.nodeRef, [
            ...breadcrumbs,
            { nodeRef, name: d.name },
          ]);
        }),
    );
    dialog.querySelector<HTMLElement>("#directory-up")!.onclick = () => {
      const parent = breadcrumbs.at(-1);
      if (parent)
        void browseDirectories(
          source,
          parent.nodeRef,
          breadcrumbs.slice(0, -1),
        );
    };
    const more = dialog.querySelector<HTMLElement>("#directory-more");
    if (more)
      more.onclick = () =>
        void browseDirectories(
          source,
          nodeRef,
          breadcrumbs,
          page.nextCursor,
          entries,
        );
  } catch (error) {
    if (epoch === directoryEpoch)
      directoryError(
        error,
        () => void browseDirectories(source, nodeRef, breadcrumbs),
      );
  }
}
function directoryError(error: unknown, retry: () => void) {
  modal(
    `<h2>无法读取目录</h2><p>设备离线、权限失效或目录已不可用。当前审阅保持不变。</p><p class="muted">${e(error instanceof Error ? error.message : "DIRECTORY_REQUEST_FAILED")}</p><button id="directory-retry">重试</button><button data-action="close">返回审阅</button>`,
  );
  dialog.querySelector<HTMLElement>("#directory-retry")!.onclick = retry;
}
function compactMenu(type: "repository" | "file") {
  const old = root.querySelector(".popup-menu");
  const same = old?.getAttribute("data-menu") === type;
  old?.remove();
  if (same) return;
  const menu = document.createElement("div");
  menu.className = "popup-menu " + type + "-menu";
  menu.dataset.menu = type;
  menu.setAttribute("role", "menu");
  menu.innerHTML =
    type === "repository"
      ? `<small>已授权仓库</small>${sources.map((r) => `<button role="menuitem" data-action="select-repository" data-id="${e(r.id)}">${r.id === repositoryId ? "✓ " : ""}${e(r.title)}</button>`).join("")}<hr><button role="menuitem" data-action="source">比较来源与分支…</button><button role="menuitem" data-action="history" ${!repositoryId ? "disabled" : ""}>提交历史…</button><button role="menuitem" data-action="sessions">最近审阅…</button><button role="menuitem" data-action="remote-repository">浏览远程目录…</button><hr><button role="menuitem" data-action="versions-mode">Host 文件版本…</button>`
      : `<small>当前文件视图</small>${[
          ["unified", "统一 Diff"],
          ["split", "并排 Diff"],
          ["before", "原版本"],
          ["after", "新版本"],
        ]
          .map(
            ([id, label]) =>
              `<button role="menuitemradio" aria-checked="${view === id}" data-action="view" data-view="${id}">${view === id ? "✓ " : ""}${label}</button>`,
          )
          .join(
            "",
          )}<hr><button role="menuitem" data-action="viewed" ${!review?.files.some((f: any) => f.path === file?.path) ? "disabled" : ""}>${review?.viewed.includes(file?.path) ? "取消已阅" : "标记已阅"}</button><button role="menuitem" data-action="native-viewer">原生 Diff / 代码浏览…</button><button role="menuitem" data-action="notes">意见与审阅结论…</button><button role="menuitem" data-action="export">审阅回执…</button>`;
  root.append(menu);
  menu.querySelector<HTMLElement>("button")?.focus();
}
function restoreSidebarState() {
  const side = root.querySelector(".sidebar") as HTMLElement | null;
  const content = root.querySelector(".content") as HTMLElement | null;
  return { side: side?.scrollTop || 0, content: content?.scrollTop || 0 };
}
let desktopPresentation = "",
  desktopInput: Record<string, any> = {},
  desktopReady = false,
  desktopSequence = 0,
  desktopLast = "";
async function applyDesktopInput() {
  const input = desktopInput._openmuse;
  if (!input) return;
  desktopPresentation =
    input.presentation === "navigation" ? "navigation" : "workspace";
  document.documentElement.classList.toggle(
    "review-desktop-navigation",
    desktopPresentation === "navigation",
  );
  document.documentElement.classList.toggle(
    "review-desktop-workspace",
    desktopPresentation === "workspace",
  );
  if (!desktopReady) return;
  const selection = input.navigation || {},
    key = JSON.stringify(selection);
  if (key === desktopLast) return;
  desktopLast = key;
  const sequence = ++desktopSequence;
  const deadline = Date.now() + 95000;
  while (busy && sequence === desktopSequence && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 50));
  if (sequence !== desktopSequence) return;
  if (busy) throw Error("NAVIGATION_WAIT_TIMEOUT");
  if (
    typeof selection.repositoryId === "string" &&
    sources.some((r) => r.id === selection.repositoryId)
  )
    repositoryId = selection.repositoryId;
  if (["unified", "split", "before", "after"].includes(selection.view))
    view = selection.view;
  if (
    selection.comparisonId &&
    (review?.id !== selection.comparisonId || file?.path !== selection.path)
  ) {
    await loadReview(selection.comparisonId, selection.path || undefined);
    if (sequence !== desktopSequence) return;
  } else render();
}
async function publishDesktopSelection() {
  if (desktopPresentation !== "navigation" || !desktopReady) return;
  await call("openmuse_navigation_select", {
    repositoryId,
    comparisonId: review?.id || "",
    path: file?.path || "",
    view,
  });
}
app.ontoolinput = (params) => {
  desktopInput = params.arguments || {};
  void applyDesktopInput().catch(() => toast("无法同步导航，请重试。", true));
};

const statusNames: Record<string, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  copied: "C",
  unchanged: "·",
};
const decisionNames: Record<string, string> = {
  pending: "审阅中",
  changes_requested: "需要修改",
  accepted: "本地审阅完成",
};
const selectedRepo = () => sources.find((s) => s.id === repositoryId);
const uid = () => crypto.randomUUID();
async function call(
  name: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  const r = await app.callServerTool(
    { name, arguments: args },
    { timeout: 60000 },
  );
  if (r.isError)
    throw Error(
      r.content
        .filter((c) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n"),
    );
  if (!r.structuredContent) throw Error("服务未返回结构化结果");
  return r.structuredContent;
}
const errors: Record<string, string> = {
  REVIEW_NOT_COMPLETE: "请审阅全部文件并解决意见；来源不完整时不能完成审阅。",
  VERSION_CURRENT_CHANGED: "文件已被其他人修改，请刷新后重新比较。",
  VERSION_CLOSE_EDITOR_BEFORE_RESTORE:
    "请先关闭此文件的原生编辑器，再恢复版本，避免未保存内容覆盖恢复结果。",
  VERSION_RESOURCE_NOT_GRANTED: "该文件没有授权给此插件。",
  GIT_SOURCE_UNAVAILABLE: "无法读取该 Git 来源，请检查引用与仓库授权。",
  MR_SOURCE_UNAVAILABLE: "无法读取 MR，请检查账号授权与 MR 编号。",
  VERSION_FILE_BUDGET_EXCEEDED:
    "文件超过首版的安全读取上限，请使用原生应用查看。",
};
function toast(message: string, error = false) {
  const t = document.querySelector<HTMLElement>("#toast")!;
  t.textContent = errors[message] || message;
  t.className = error ? "error" : "";
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 6500);
}
async function action(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  root.classList.add("busy");
  root.setAttribute("aria-busy", "true");
  try {
    await fn();
  } catch (error) {
    toast(error instanceof Error ? error.message : "操作失败", true);
  } finally {
    busy = false;
    root.classList.remove("busy");
    root.removeAttribute("aria-busy");
    await publishDesktopSelection().catch(() =>
      toast("无法同步导航，请重试。", true),
    );
  }
}
const option = (value: string, label: string, selected: string) =>
  `<option value="${e(value)}"${value === selected ? " selected" : ""}>${e(label)}</option>`;
function sourceForm() {
  const s = selectedRepo();
  return `<div class="sources"><label><span class="sr-only">仓库</span><select data-field="repositoryId" aria-label="仓库">${sources.map((r) => option(r.id, r.title, repositoryId)).join("")}</select></label><select data-field="kind" aria-label="比较来源">${(s?.sources || []).map((k: string) => option(k, ({ workspace: "工作区 · 当前未提交", staged: "暂存区", branch: "分支比较", commit: "提交比较", mr: "MR / Pull Request" } as any)[k], kind)).join("")}</select>${kind === "branch" ? `<label><small>基准分支</small><input data-field="baseRef" aria-label="基准分支" value="${e(baseRef)}"></label>` : ""}${["branch", "commit"].includes(kind) ? `<label><small>${kind === "commit" ? "提交 SHA / 引用" : "目标分支"}</small><input data-field="headRef" aria-label="目标引用" value="${e(headRef)}"></label>` : ""}${kind === "mr" ? `<label><small>MR 编号</small><input type="number" min="1" data-field="mrNumber" aria-label="MR 编号" value="${e(mrNumber)}"></label>` : ""}<button class="primary" data-action="compare">读取真实变更</button><button data-action="history">浏览提交历史</button></div>`;
}
function fileList() {
  const seen = new Set<string>();
  const list = treeMode ? treeFiles : review?.files || [];
  return `<ul class="files git-tree">${[...list]
    .filter((f: any) =>
      f.path.toLocaleLowerCase().includes(fileFilter.toLocaleLowerCase()),
    )
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f: any) => {
      const parts = f.path.split("/");
      let parents = "";
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts.slice(0, i + 1).join("/");
        if (!seen.has(key)) {
          seen.add(key);
          parents += `<li><button class="tree-directory" data-action="folder" data-path="${e(key)}" aria-expanded="${!collapsedDirectories.has(key)}" style="padding-left:${8 + i * 12}px">${collapsedDirectories.has(key) ? "›" : "⌄"} ${e(parts[i])}</button></li>`;
        }
        if (collapsedDirectories.has(key)) return parents;
      }
      return (
        parents +
        `<li><button style="padding-left:${8 + (parts.length - 1) * 12}px" class="file-button ${file?.path === f.path ? "active" : ""}" data-action="file" data-path="${e(f.path)}" title="${e(f.path)}"><span class="badge ${e(f.status)}">${statusNames[f.status] || "M"}</span><span class="file-name">${e(parts.at(-1))}</span><span aria-label="${review.viewed.includes(f.path) ? "已阅" : "未阅"}">${review.viewed.includes(f.path) ? "✓" : ""}</span></button></li>`
      );
    })
    .join("")}</ul>`;
}
function render() {
  const saved = restoreSidebarState();
  root.classList.toggle("sidebar-hidden", !sidebarVisible);
  root.innerHTML = `<header class="compact-top"><button class="icon-button" data-action="toggle-sidebar" aria-label="${sidebarVisible ? "收起" : "展开"}文件树" aria-expanded="${sidebarVisible}">☰</button><button class="repository-trigger" data-action="repository-menu" aria-haspopup="menu">${e(selectedRepo()?.title || "选择仓库")} <span aria-hidden="true">⌄</span></button><button class="source-trigger" data-action="source">${e(sourceLabels[kind] || kind)}${review ? " · " + e((review.source.headSha || review.digest).slice(0, 7)) : ""}</button><span class="top-spacer"></span><button class="icon-button" data-action="compare" aria-label="刷新比较" ${!repositoryId ? "disabled" : ""}>↻</button></header><div class="workspace"><button class="sidebar-scrim" data-action="toggle-sidebar" aria-label="收起文件树"></button><aside class="sidebar"><div class="tree-tabs"><button class="${!treeMode ? "active" : ""}" data-action="changes-tree">变更 <small>${review?.fileCount ?? "—"}</small></button><button class="${treeMode ? "active" : ""}" data-action="repository-tree" ${!repositoryId ? "disabled" : ""}>文件树</button></div><input class="filter" data-field="filter" aria-label="筛选文件" placeholder="筛选文件…" value="${e(fileFilter)}">${fileList()}${treeMode ? `<p class="tree-context">提交 ${e(treeRef.slice(0, 7))}${treeTruncated ? " · 结果已截断" : ""}</p>` : ""}<footer class="sidebar-progress">${review ? `${review.viewed.length} / ${review.fileCount} 个文件已阅` : "选择比较来源后开始审阅"}</footer></aside><section class="content" aria-label="审阅内容">${mode === "versions" ? versionView() : diffView()}</section></div>`;
  const side = root.querySelector(".sidebar") as HTMLElement;
  const content = root.querySelector(".content") as HTMLElement;
  side.scrollTop = saved.side;
  content.scrollTop = saved.content;
}
function diffView() {
  if (!review)
    return `<div class="empty"><h2>选择仓库，开始审阅。</h2><p>选择已授权仓库与比较来源。代码和文档使用同一个阅读工作台。</p><button class="primary" data-action="source">选择比较来源</button></div>`;
  return `${review.incomplete ? '<div class="notice">来源不完整，不能作为完整审阅通过。</div>' : ""}${file ? fileView() : '<div class="empty"><h2>没有变更</h2><p>当前比较与基准一致，可切换来源或浏览固定提交的文件树。</p></div>'}${notesVisible ? reviewPanel() : ""}`;
}
function fileView() {
  const f = file!,
    model = buildHunks(f);
  return `<div class="file-head"><h3 title="${e(f.path)}">${e(f.path)}</h3><div class="stats"><span class="added-text">+${model.additions}</span><span class="removed-text">−${model.deletions}</span>${f.previousPath ? `<small>原路径 ${e(f.previousPath)}</small>` : ""}</div><button data-action="viewed" ${!review.files.some((f: any) => f.path === file?.path) ? "disabled" : ""} class="${review.viewed.includes(f.path) ? "active" : ""}">${review.viewed.includes(f.path) ? "已阅" : "标记已阅"}</button><button class="icon-button" data-action="file-menu" aria-label="当前文件操作" aria-haspopup="menu">⋯</button></div>${model.warning ? `<div class="notice">${e(model.warning)}</div>` : ""}${f.binary ? binaryView(f) : view === "before" || view === "after" ? fullView(f) : diffTable(f)}`;
}
function binaryView(f: ChangeFile) {
  return `<div class="binary">${(["before", "after"] as const)
    .map((side) => {
      const info = side === "before" ? f.beforeInfo : f.afterInfo;
      let image = "";
      if (info?.base64) {
        const b = info.base64;
        const mime = b.startsWith("iVBORw0KGgo")
          ? "image/png"
          : b.startsWith("/9j/")
            ? "image/jpeg"
            : b.startsWith("UklGR")
              ? "image/webp"
              : null;
        if (mime)
          image = `<img alt="${side === "before" ? "原" : "新"}版本图片" src="data:${mime};base64,${e(b)}">`;
      }
      return `<figure><h3>${side === "before" ? "原版本" : "新版本"}</h3><div class="version-meta">${info ? `${info.byteLength} 字节<br>SHA-256 ${e(info.sha256)}` : "来源未提供原始字节"}</div>${image || '<p class="muted">该格式使用字节摘要比较，不生成文本 Diff。</p>'}${info?.base64 ? `<pre>${e(hexPreview(info.base64))}</pre>` : ""}</figure>`;
    })
    .join("")}</div>`;
}
function hexPreview(base64: string) {
  try {
    return Array.from(atob(base64).slice(0, 128))
      .map(
        (c, i) =>
          (i % 16 === 0 ? "\n" : "") +
          c.charCodeAt(0).toString(16).padStart(2, "0"),
      )
      .join(" ")
      .trim();
  } catch {
    return "无法读取预览";
  }
}
function fullView(f: ChangeFile) {
  const text = view === "before" ? f.before : f.after;
  if (text === undefined)
    return '<div class="notice">此来源仅提供变更补丁，没有完整文件。请使用文件版本、工作区或提交来源读取全文。</div>';
  const lines = text.split("\n"),
    tokens = tokenize(text, f.path),
    start = page * 500,
    end = Math.min(start + 500, lines.length);
  return `<div class="diff-scroll"><table class="diff-table"><tbody>${lines
    .slice(start, end)
    .map(
      (text, i) =>
        `<tr><td class="gutter">${start + i + 1}</td><td class="code"><code>${lineHtml({ kind: "context", text, hunk: 0 }, tokens?.[start + i])}</code></td></tr>`,
    )
    .join("")}</tbody></table>${pager(lines.length)}</div>`;
}
function pager(length: number) {
  return length > 500
    ? `<div class="pager"><button data-action="page" data-page="${page - 1}"${page === 0 ? " disabled" : ""}>上一段</button><small>${page * 500 + 1}–${Math.min((page + 1) * 500, length)} / ${length} 行</small><button data-action="page" data-page="${page + 1}"${(page + 1) * 500 >= length ? " disabled" : ""}>下一段</button></div>`
    : "";
}
function diffTable(f: ChangeFile) {
  const model = buildHunks(f);
  if (!model.hunks.length)
    return `<div class="empty"><p>${f.patchUnavailable ? "补丁不可用。" : f.status === "renamed" ? "文件仅重命名，内容一致。" : "没有文本变化。"}</p></div>`;
  const oldTokens =
      f.before !== undefined
        ? tokenize(f.before, f.previousPath || f.path)
        : null,
    newTokens = f.after !== undefined ? tokenize(f.after, f.path) : null;
  // Native MR patches retain their absolute line anchors. Tokenize each full
  // hunk as a bounded fallback; never renumber the source to fragment offsets.
  const rows: {
    hunk?: any;
    line?: DiffLine;
    pair?: ReturnType<typeof pairedRows>[number];
    patchOld?: any[];
    patchNew?: any[];
  }[] = [];
  for (const h of model.hunks) {
    const patchOld = oldTokens
        ? null
        : tokenize(
            h.lines
              .filter((l) => l.kind === "context" || l.kind === "delete")
              .map((l) => l.text)
              .join("\n"),
            f.path,
          ),
      patchNew = newTokens
        ? null
        : tokenize(
            h.lines
              .filter((l) => l.kind === "context" || l.kind === "add")
              .map((l) => l.text)
              .join("\n"),
            f.path,
          );
    const oldMap = new Map<number, any>(),
      newMap = new Map<number, any>();
    let oi = 0,
      ni = 0;
    for (const l of h.lines) {
      if (l.oldLine !== undefined) oldMap.set(l.oldLine, patchOld?.[oi++]);
      if (l.newLine !== undefined) newMap.set(l.newLine, patchNew?.[ni++]);
    }
    rows.push({ hunk: h });
    for (const row of view === "split"
      ? pairedRows(h.lines).map((pair) => ({ pair }))
      : h.lines.map((line) => ({ line })))
      rows.push({ ...row, patchOld: oldMap as any, patchNew: newMap as any });
  }
  function cell(
    line: DiffLine | undefined,
    side: "left" | "right",
    extra = "",
    patch?: any,
  ) {
    if (!line) return `<td class="gutter ${extra}"></td><td class="code"></td>`;
    const number = side === "left" ? line.oldLine : line.newLine;
    const tokens =
      number === undefined
        ? undefined
        : (side === "left"
            ? oldTokens?.[number - 1]
            : newTokens?.[number - 1]) || patch?.get(number);
    return `<td class="gutter ${extra} line-${line.kind}">${number === undefined ? "" : `<button class="anchor" data-action="note" data-side="${side}" data-line="${number}" aria-label="在${side === "left" ? "原" : "新"}版本第 ${number} 行添加意见">${number}</button>`}</td><td class="code line-${line.kind}"><code>${lineHtml(line, tokens)}</code></td>`;
  }
  const html = rows
    .slice(page * 500, (page + 1) * 500)
    .map((row) => {
      if (row.hunk) {
        const h = row.hunk;
        return `<tr class="hunk"><td colspan="${view === "split" ? 4 : 4}">@@ −${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@</td></tr>`;
      }
      if (row.pair)
        return `<tr>${cell(row.pair.left, "left", "", row.patchOld)}${cell(row.pair.right, "right", "split-divider", row.patchNew)}</tr>`;
      const l = row.line!,
        side = l.kind === "delete" ? "left" : "right",
        n = side === "left" ? l.oldLine : l.newLine,
        tokens =
          n === undefined
            ? undefined
            : side === "left"
              ? oldTokens?.[n - 1] || (row.patchOld as any)?.get(n)
              : newTokens?.[n - 1] || (row.patchNew as any)?.get(n);
      return `<tr class="line-${l.kind}"><td class="gutter">${l.oldLine === undefined ? "" : `<button class="anchor" data-action="note" data-side="left" data-line="${l.oldLine}" aria-label="在原版本第 ${l.oldLine} 行添加意见">${l.oldLine}</button>`}</td><td class="gutter">${l.newLine === undefined ? "" : `<button class="anchor" data-action="note" data-side="right" data-line="${l.newLine}" aria-label="在新版本第 ${l.newLine} 行添加意见">${l.newLine}</button>`}</td><td class="sign">${l.kind === "add" ? "+" : l.kind === "delete" ? "−" : ""}</td><td class="code"><code>${lineHtml(l, tokens)}</code></td></tr>`;
    })
    .join("");
  return `<div class="diff-scroll"><table class="diff-table ${view === "split" ? "split" : ""}"><colgroup>${view === "split" ? '<col style="width:52px"><col><col style="width:52px"><col>' : '<col class="gutter"><col class="gutter"><col class="sign"><col>'}</colgroup><tbody>${html}</tbody></table>${pager(rows.length)}</div>`;
}
function reviewPanel() {
  return `<div class="review-panel"><div class="review-title"><h3>审阅意见</h3><small>点击 Diff 行号添加 · ${e(review.actor)}</small></div>${review.notes.length ? review.notes.map((n: any) => `<article class="note ${n.resolved ? "resolved" : ""}"><div class="note-meta">${e(n.path)} · ${n.side === "left" ? "原" : "新"}版本 L${n.line} · ${e(n.actor)}</div><p>${e(n.body)}</p><button data-action="resolve" data-id="${n.id}" data-resolved="${!n.resolved}">${n.resolved ? "重新打开" : "解决意见"}</button></article>`).join("") : '<p class="muted">还没有意见。已阅状态与意见固定在此份变更快照中。</p>'}<div class="review-actions"><small>这里记录本地审阅结论，不会向代码平台提交批准或执行合并。</small><div class="row"><button data-action="decision" data-decision="changes_requested">需要修改</button><button class="primary" data-action="decision" data-decision="accepted">完成审阅</button></div></div></div>`;
}
function versionView() {
  return `<div class="version-area"><div><span class="label">HOST VERSION AUTHORITY</span><h2>文件版本</h2><p class="version-meta">复用 OpenMuse 的版本库。代码、文本、图片及其他文件以完整字节保存；恢复前自动保留当前版本。</p></div>${hostResources.length ? `<label>已授权文件<select data-field="resourceId" aria-label="版本文件">${hostResources.map((r) => option(r.id, r.path, resourceId)).join("")}</select></label><div class="row"><button data-action="capture" class="primary"${!hostWritable ? " disabled" : ""}>保存当前版本</button><button data-action="reload-versions">刷新历史</button></div><div class="version-meta">${current ? `当前 ${current.byteLength} 字节 · ${e(current.sha256.slice(0, 16))}${current.binary ? " · 二进制" : ""}` : ""}</div><div class="version-grid"><label>原版本<select data-field="beforeVersion" aria-label="原版本">${versions.map((v) => option(v.id, versionLabel(v), beforeVersion)).join("")}</select></label><label>新版本<select data-field="afterVersion" aria-label="新版本">${option("", "当前文件", afterVersion)}${versions.map((v) => option(v.id, versionLabel(v), afterVersion)).join("")}</select></label></div><button data-action="compare-versions"${!beforeVersion ? " disabled" : ""}>比较所选版本</button><div><h3>版本历史 · ${versions.length}</h3>${versions.map((v) => `<div class="version-row"><div><strong>${e(v.sha256.slice(0, 12))}</strong><div class="version-meta">${e(new Date(v.createdAt).toLocaleString())}<br>${v.byteLength} 字节 · 事件 ${e(v.id.slice(0, 8))}</div></div><div class="row"><button data-action="read-version" data-id="${e(v.id)}">查看</button><button data-action="restore" data-id="${e(v.id)}"${!hostWritable ? " disabled" : ""}>恢复</button></div></div>`).join("")}</div>` : '<div class="notice">当前 Host 没有向此插件授予文件版本能力。请由安装方选择文件并授予 versions.read；写入还需要 versions.write。仓库 Diff 可以独立使用。</div>'}</div>`;
}
function versionLabel(v: any) {
  return `${new Date(v.createdAt).toLocaleString()} · ${v.sha256.slice(0, 8)} · ${v.byteLength}B`;
}
let reviewLoadSequence = 0;
async function loadReview(id: string, path?: string) {
  const sequence = ++reviewLoadSequence;
  const nextReview = await call("review_read", { comparisonId: id });
  const selected =
    path && nextReview.files.some((f: any) => f.path === path)
      ? path
      : nextReview.files[0]?.path;
  const nextFile = selected
    ? (await call("review_read", { comparisonId: id, path: selected })).file
    : null;
  const nextSessions = (await call("review_list")).comparisons;
  if (sequence !== reviewLoadSequence) return;
  review = nextReview;
  if (
    ["workspace", "staged", "branch", "commit", "mr"].includes(
      review.source.kind,
    )
  ) {
    kind = review.source.kind;
    baseRef = review.source.baseRef || baseRef;
    headRef = review.source.headRef || headRef;
    if (review.source.number) mrNumber = String(review.source.number);
  }
  if (nextReview.source.repository) repositoryId = nextReview.source.repository;
  file = nextFile;
  sessions = nextSessions;
  page = 0;
  render();
}
async function refreshVersions() {
  if (!resourceId) return;
  versions = (await call("host_versions_list", { resourceId })).versions;
  current = await call("host_versions_read", { resourceId });
  if (!versions.some((v) => v.id === beforeVersion))
    beforeVersion = versions[0]?.id || "";
  if (afterVersion && !versions.some((v) => v.id === afterVersion))
    afterVersion = "";
  render();
}
async function hostComparison(before: any, after: any, title: string) {
  return call("review_open", {
    schema: "openmuse.repository-review/1",
    title,
    source: {
      kind: "versions",
      provider: "openmuse.host-versions/1",
      baseRef: before.versionId || before.sha256,
      headRef: after.versionId || after.sha256,
    },
    files: [
      {
        path: after.path,
        status: "modified",
        before: before.text,
        after: after.text,
        binary: before.binary || after.binary,
        beforeInfo: {
          sha256: before.sha256,
          byteLength: before.byteLength,
          base64: before.base64,
        },
        afterInfo: {
          sha256: after.sha256,
          byteLength: after.byteLength,
          base64: after.base64,
        },
      },
    ],
  });
}
function modal(html: string) {
  dialog.className = "";
  dialog.innerHTML = html;
  dialog.showModal();
  dialog.querySelector<HTMLElement>("input,textarea,button")?.focus();
}
root.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement;
  if (el.dataset.field !== "filter") return;
  fileFilter = el.value;
  const tree = root.querySelector(".git-tree");
  if (tree) tree.outerHTML = fileList();
});
root.addEventListener("change", (event) => {
  const el = event.target as HTMLInputElement;
  const field = el.dataset.field;
  if (!field) return;
  if (field === "file")
    return void action(async () => {
      file = (
        await call("review_read", { comparisonId: review.id, path: el.value })
      ).file;
      page = 0;
      render();
    });
  if (field === "resourceId") {
    resourceId = el.value;
    return void action(refreshVersions);
  }
  const values: Record<string, (s: string) => void> = {
    repositoryId: (s) => {
      repositoryId = s;
      if (!selectedRepo()?.sources.includes(kind)) kind = "workspace";
    },
    kind: (s) => (kind = s),
    baseRef: (s) => (baseRef = s),
    headRef: (s) => (headRef = s),
    mrNumber: (s) => (mrNumber = s),
    beforeVersion: (s) => (beforeVersion = s),
    afterVersion: (s) => (afterVersion = s),
  };
  values[field]?.(el.value);
  if (["repositoryId", "kind"].includes(field)) render();
});
dialog.addEventListener("change", (event) => {
  const el = event.target as HTMLInputElement;
  const field = el.dataset.field;
  if (!field) return;
  const values: Record<string, (s: string) => void> = {
    repositoryId: (s) => (repositoryId = s),
    kind: (s) => (kind = s),
    baseRef: (s) => (baseRef = s),
    headRef: (s) => (headRef = s),
    mrNumber: (s) => (mrNumber = s),
  };
  values[field]?.(el.value);
  if (["kind", "repositoryId"].includes(field))
    dialog.querySelector(".source-form")!.innerHTML = sourceForm();
});
async function change(args: Record<string, unknown>) {
  await call("review_change", {
    comparisonId: review.id,
    expectedDigest: review.digest,
    commandId: uid(),
    ...args,
  });
  await loadReview(review.id, file?.path);
}
async function click(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-action]",
  );
  if (!button) return;
  const a = button.dataset.action;
  if (a === "close") {
    directoryEpoch++;
    cancelSourceDraft();
    dialog.close();
    return;
  }
  if (a === "repository-menu" || a === "file-menu") {
    compactMenu(a === "repository-menu" ? "repository" : "file");
    return;
  }
  root.querySelector(".popup-menu")?.remove();
  if (a === "toggle-sidebar") {
    sidebarVisible = !sidebarVisible;
    render();
    return;
  }
  if (a === "notes") {
    notesVisible = !notesVisible;
    render();
    root.querySelector(".review-panel")?.scrollIntoView();
    return;
  }
  if (a === "changes-tree") {
    treeMode = false;
    render();
    return;
  }
  if (a === "sessions") {
    modal(
      `<h2>最近审阅</h2>${sessions.map((r) => `<button class="history-item" data-action="session" data-id="${e(r.id)}">${e(r.title)}<span>${e(decisionNames[r.decision])} · ${r.viewed.length}/${r.fileCount}</span></button>`).join("")}<button data-action="close">关闭</button>`,
    );
    return;
  }
  if (a === "remote-repository") {
    void browseDirectories();
    return;
  }
  if (a === "select-repository") {
    await action(async () => {
      const target = button.dataset.id!;
      const repo = sources.find((r) => r.id === target);
      if (!repo) throw Error("REPOSITORY_NOT_GRANTED");
      if (target === repositoryId) {
        directoryEpoch++;
        dialog.close();
        return;
      }
      // Repository identity changes invalidate repository-specific MR numbers
      // and refs; open its workspace instead of carrying another repo's MR.
      const nextKind = "workspace";
      const result = await call("repository_compare", {
        repositoryId: target,
        kind: nextKind,
      });
      await loadReview(result.id);
      repositoryId = target;
      kind = nextKind;
      treeMode = false;
      treeFiles = [];
      collapsedDirectories.clear();
      fileFilter = "";
      mode = "diff";
      directoryEpoch++;
      dialog.close();
      render();
    });
    return;
  }
  if (a === "repository-tree") {
    await action(async () => {
      if (!review || review.source.repository !== repositoryId) {
        const compared = await call("repository_compare", {
          repositoryId,
          kind: "workspace",
        });
        await loadReview(compared.id);
      }
      const ref =
        review?.source.repository === repositoryId
          ? review.source.headSha
          : undefined;
      const result = await call("repository_tree", {
        repositoryId,
        ...(ref ? { ref } : {}),
      });
      treeFiles = result.files;
      treeRef = result.ref;
      treeRepository = repositoryId;
      treeTruncated = result.truncated;
      treeMode = true;
      render();
    });
    return;
  }

  if (a === "source") {
    sourceDraftBackup = { repositoryId, kind, baseRef, headRef, mrNumber };
    modal(
      `<div class="sources-dialog"><div class="row"><h2>选择比较来源</h2><button class="quiet" data-action="close">关闭</button></div><div class="source-form">${sourceForm()}</div></div>`,
    );
    return;
  }
  if (busy) return;
  if (a === "view") {
    const next = button.dataset.view!;
    if (
      file &&
      ((next === "before" && file.status === "added") ||
        (next === "after" && file.status === "deleted"))
    ) {
      file[next] = "";
      view = next;
      page = 0;
      render();
      return;
    }
    if (
      (next === "before" || next === "after") &&
      file &&
      file[next] === undefined &&
      review?.source.repository &&
      review.source.provider !== "openmuse.host-versions/1"
    ) {
      await action(async () => {
        const side = next === "before" ? "baseRef" : "headRef";
        const saved = await call("repository_read", {
          repositoryId: review.source.repository,
          ref: review.source[side],
          path:
            next === "before" ? file!.previousPath || file!.path : file!.path,
        });
        if (saved.binary) {
          file!.binary = true;
          file![next === "before" ? "beforeInfo" : "afterInfo"] = {
            sha256: saved.sha256,
            byteLength: saved.byteLength,
            base64: saved.base64,
          };
        } else file![next] = saved.text;
        view = next;
        page = 0;
        render();
      });
      return;
    }
    view = next;
    page = 0;
    render();
    return;
  }
  if (a === "page") {
    page = Number(button.dataset.page);
    render();
    return;
  }
  if (a === "diff-mode") {
    mode = "diff";
    render();
    return;
  }
  if (a === "note") {
    modal(
      `<h2>添加审阅意见</h2><p class="version-meta">${e(file!.path)} · ${button.dataset.side === "left" ? "原" : "新"}版本 L${button.dataset.line}</p><div id="note-form" role="form" aria-label="审阅意见表单"><label class="sr-only" for="note-body">审阅意见</label><textarea id="note-body" name="body" required maxlength="10000" placeholder="说明问题、影响与建议…"></textarea><div class="row"><button class="primary" type="button" id="save-note">保存意见</button><button type="button" data-action="close">取消</button></div></div>`,
    );
    dialog.querySelector("#save-note")!.addEventListener("click", (event) => {
      event.preventDefault();
      const body = (dialog.querySelector("textarea") as HTMLTextAreaElement)
        .value;
      if (!body.trim()) {
        toast("请填写审阅意见", true);
        return;
      }
      void action(async () => {
        await change({
          path: file!.path,
          side: button.dataset.side,
          line: Number(button.dataset.line),
          body,
        });
        dialog.close();
        toast("意见已保存到此变更快照");
      });
    });
    return;
  }
  await action(async () => {
    if (a === "folder") {
      const path = button.dataset.path!;
      collapsedDirectories.has(path)
        ? collapsedDirectories.delete(path)
        : collapsedDirectories.add(path);
      render();
    }
    if (a === "compare") {
      const previous = sourceDraftBackup;
      sourceDraftBackup = null;
      dialog.close();
      try {
        const result = await call("repository_compare", {
          repositoryId,
          kind,
          ...(kind === "branch"
            ? { baseRef, headRef }
            : kind === "commit"
              ? { headRef }
              : kind === "mr"
                ? { number: Number(mrNumber) }
                : {}),
        });
        mode = "diff";
        treeMode = false;
        treeFiles = [];
        await loadReview(result.id);
      } catch (error) {
        if (previous)
          ({ repositoryId, kind, baseRef, headRef, mrNumber } = previous);
        render();
        throw error;
      }
    }
    if (a === "session") {
      dialog.close();
      treeMode = false;
      mode = "diff";
      await loadReview(button.dataset.id!);
    }
    if (
      a === "file" &&
      treeMode &&
      !review?.files.some((f: any) => f.path === button.dataset.path)
    ) {
      if (treeRepository !== repositoryId)
        throw Error("REPOSITORY_NOT_GRANTED");
      const saved = await call("repository_read", {
        repositoryId,
        ref: treeRef,
        path: button.dataset.path,
      });
      file = {
        path: button.dataset.path!,
        status: "unchanged",
        before: saved.text,
        after: saved.text,
        binary: saved.binary,
        beforeInfo: saved,
        afterInfo: saved,
      } as ChangeFile;
      view = "after";
      page = 0;
      if (window.innerWidth < 768) sidebarVisible = false;
      render();
      return;
    }
    if (a === "file") {
      file = (
        await call("review_read", {
          comparisonId: review.id,
          path: button.dataset.path,
        })
      ).file;
      page = 0;
      if (window.innerWidth < 768) sidebarVisible = false;
      render();
    }
    if (a === "viewed")
      await change({
        path: file!.path,
        viewed: !review.viewed.includes(file!.path),
      });
    if (a === "resolve")
      await change({
        noteId: button.dataset.id,
        resolved: button.dataset.resolved === "true",
      });
    if (a === "decision") {
      await change({ decision: button.dataset.decision });
      toast("本地审阅结论已归档");
    }
    if (a === "export") {
      const receipt = await call("review_export", { comparisonId: review.id });
      modal(
        `<h2>审阅回执</h2><p class="version-meta">可由 Muse-CI 等调用方通过 review_export 获取。</p><pre class="full-source"><code>${e(JSON.stringify(receipt, null, 2))}</code></pre><button data-action="close">关闭</button>`,
      );
    }
    if (a === "native-viewer") {
      const snapshot = await call("review_viewer", { comparisonId: review.id });
      const key =
        btoa(snapshot.uri)
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "") +
        "." +
        snapshot.sha256;
      await app.openLink({
        url: "mcp-resource://io.openmuse.repository-review/" + key,
      });
    }
    if (a === "history") {
      const history = await call("repository_history", { repositoryId });
      modal(
        `<h2>提交历史</h2><p class="version-meta">${e(selectedRepo()?.title)}</p>${history.commits.map((c: any) => `<button class="history-item" data-action="commit" data-sha="${e(c.sha)}">${e(c.title)}<span>${c.sha.slice(0, 12)} · ${e(c.at)}</span></button>`).join("")}<button data-action="close">关闭</button>`,
      );
    }
    if (a === "commit") {
      headRef = button.dataset.sha!;
      kind = "commit";
      dialog.close();
      const result = await call("repository_compare", {
        repositoryId,
        kind,
        headRef,
      });
      mode = "diff";
      await loadReview(result.id);
    }
    if (a === "versions-mode") {
      mode = "versions";
      await refreshVersions();
      render();
    }
    if (a === "reload-versions") await refreshVersions();
    if (a === "capture") {
      const result = await call("host_versions_capture", { resourceId });
      await refreshVersions();
      beforeVersion = result.versionId;
      render();
      toast("已保存到 Host 版本库");
    }
    if (a === "compare-versions") {
      const before = await call("host_versions_read", {
          resourceId,
          versionId: beforeVersion,
        }),
        after = await call("host_versions_read", {
          resourceId,
          ...(afterVersion ? { versionId: afterVersion } : {}),
        });
      const result = await hostComparison(
        before,
        after,
        "文件版本 · " + after.path,
      );
      mode = "diff";
      await loadReview(result.id);
    }
    if (a === "read-version") {
      const saved = await call("host_versions_read", {
        resourceId,
        versionId: button.dataset.id,
      });
      const result = await hostComparison(
        saved,
        saved,
        "完整版本 · " + saved.path,
      );
      mode = "diff";
      view = "after";
      await loadReview(result.id);
    }
    if (a === "restore") {
      const savedId = button.dataset.id!;
      current = await call("host_versions_read", { resourceId });
      const expected = current.sha256;
      modal(
        `<h2>恢复此文件版本？</h2><p class="version-meta">${e(current.path)}<br>恢复会替换当前完整文件；Host 会先保留当前版本。文件变化后，本次恢复会被拒绝。</p><div class="row"><button class="primary" id="confirm-restore">恢复并保留备份</button><button data-action="close">取消</button></div>`,
      );
      dialog.querySelector("#confirm-restore")!.addEventListener(
        "click",
        () =>
          void action(async () => {
            await call("host_versions_restore", {
              resourceId,
              versionId: savedId,
              expectedSha256: expected,
            });
            dialog.close();
            await refreshVersions();
            toast("版本已恢复，原文件已保留为历史版本");
          }),
        { once: true },
      );
    }
  });
}
root.addEventListener("click", (event) => void click(event));
dialog.addEventListener("click", (event) => void click(event));
app.ontoolresult = (result) => {
  const r = result.structuredContent as any;
  if (r?.id && r?.digest)
    void action(async () => {
      await loadReview(r.id);
    });
};
async function boot() {
  await app.connect();
  applyHostContext();
  if (!app.getHostCapabilities()?.serverTools)
    throw Error("Host 尚未提供 MCP 工具能力");
  sources = (await call("review_sources")).repositories;
  repositoryId = sources[0]?.id || "";
  sessions = (await call("review_list")).comparisons;
  try {
    const h = await call("host_versions_list");
    hostResources = h.resources;
    hostWritable = h.writable;
    resourceId = h.resources[0]?.id || "";
  } catch {
    /* Optional negotiated Host capability. */
  }
  try {
    const directory = await call("host_directory_sources");
    directoryAvailable = directory.contract === "openmuse.host-directories/1";
    directorySources = directory.sources || [];
  } catch {
    directoryAvailable = false;
  }
  desktopReady = true;
  if (sessions[0]) await loadReview(sessions[0].id);
  else render();
  await applyDesktopInput();
}
void boot().catch((error) => {
  root.innerHTML = `<div class="error-box"><h2>尚未连接审阅服务</h2><p>${e(error.message)}</p><p class="muted">请从 OpenMuse 的应用入口打开已安装插件，并确认 Desktop 在线。</p></div>`;
});

document.addEventListener("pointerdown", (event) => {
  if (
    !(event.target as HTMLElement).closest(
      '.popup-menu,[data-action="repository-menu"],[data-action="file-menu"]',
    )
  )
    root.querySelector(".popup-menu")?.remove();
});
document.addEventListener("keydown", (event) => {
  const menu = root.querySelector(".popup-menu");
  if (!menu) return;
  if (event.key === "Escape") {
    const type = menu.getAttribute("data-menu");
    menu.remove();
    root
      .querySelector<HTMLElement>(
        `[data-action="${type === "file" ? "file-menu" : "repository-menu"}"]`,
      )
      ?.focus();
  }
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    const items = [
      ...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[
      (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
    ]?.focus();
    event.preventDefault();
  }
});

dialog.addEventListener("cancel", () => {
  directoryEpoch++;
  cancelSourceDraft();
});
