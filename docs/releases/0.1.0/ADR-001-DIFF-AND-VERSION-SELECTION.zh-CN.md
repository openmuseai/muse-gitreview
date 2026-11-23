# ADR-001：公共版本与 Diff 审阅的选型

状态：建议采用。日期：2026-11-23。本轮为方案选型，不宣称 Repository Review 插件已经完成开发或真机验收。

## 决策

采用分层组合，而不整套搬移任一 Host：

1. **文件版本权威复用 OpenMuse Host**：以 LocalVersionStore 的内容寻址存储、资源身份与 flush 机制为基础，拆出可授权的版本读取/比较服务。
2. **Diff 核心采用 DSH 同源的 jsdiff 路线**：直接消费来源提供的 Git/MR patch；完整文件快照比较使用有预算的 jsdiff。保留原始行号、hunk 起点与精确度状态，不用 Host 当前 `_lineDiff` 作为公共引擎。
3. **代码高亮采用 DSH 的 Shiki 技术路线**：语言白名单、语法状态、主题 Token、加载与耗时预算。高亮与增删背景分层渲染；不整体导入 DSH Desktop、React UI 大包、Helix 进程或另一套 Agent runtime。
4. **Repository Review 是独立通用 MCP/MCP Apps 插件**：归属 `Muse-Plugin-Ecosystem/plugins/repository-review`。版本来源、仓库来源、比较和审阅均有公共合同；Muse-CI 是消费者之一。Desktop、Mobile 共享插件审阅 UI，手机继续使用现有国内公网配对中转。

## 实际对比基线

不能用本地旧 Harness 目录替代 DSH Desktop 的真实依赖：

- 本地 `vendors/deepseek-harness` 是 0.1.5-rc.2。
- `vendors/dsh-desktop` 0.12.1 的 package-lock 锁定 `@deepseek-ai/dsh-client-ui-primitives` 与 `dsh-tool-fs` **0.2.2-rc.1**。
- 本次读取该锁定 npm 包；下载包 SHA-512 与锁文件 integrity 一致。比较源码和纯函数探针结果见 `evidence/selection-probes.json`。

## 能力比较

| 维度 | OpenMuse Host 当前实现 | DSH Desktop 锁定实现 | 抽取选择 |
| --- | --- | --- | --- |
| 文件版本数据 | LocalVersionStore：SHA-256 blob、文件索引、读取前 flush | 此次核对的 DiffBlock/tool-fs 不提供对应独立文件版本库 | Host 作为文件版本来源，保留资源权限 |
| 比较语义 | 保存快照↔当前、两个保存快照；与工作台 Tab 绑定 | 工具修改前后片段，structuredPatch 生成上下文 | 公共模型兼容完整快照与原生 patch，脱离 Tab |
| Diff 算法 | 行级 LCS，O(N×M)；超过 4,000,000 单元退化为全删全增 | jsdiff 9；当前 DiffBlock 限制编辑距离 256，超预算也整片段替换 | 采用 jsdiff，但超预算必须返回显式状态，不能冒充精确结果 |
| 代码语法高亮 | Helix/文件预览有高亮；当前 DiffCell 本身是纯文本 | CodeBlock/useCodeHighlighter 有 Shiki；当前 DiffBlock 行本身仍直接渲染 row.text | 复用高亮路线，做真正的高亮 Diff，不把增删颜色当语法高亮 |
| 统一/并排 | 已有 Flutter 两种视图与行号 | 当前 DiffBlock 是统一片段卡片，带折叠/复制/折行 | 公共审阅工作台支持两种，手机默认统一 |
| 精确审阅锚点 | 完整文件可导出 oldLine/newLine，但无 Git/MR 身份 | FileDiff 的 path/oldText/newText 丢失原始 hunk 起点 | 公共合同必须保留绝对行号、源/目标引用与比较摘要 |
| Git 工作区/分支/提交 | LocalVersionStore 不等于 Git 版本管理 | 上述工具修改 Diff 也不等于完整 Git 仓库 Provider | 单独来源适配 Git；不拿文件快照 hash 充当 commit SHA |
| 可独立安装 | 当前在 Host 内部，尚无对应公开 MCP 版本工具 | UI 包有公开导出，但整体依赖 React、主题与其他组件 | 对外通过独立插件和公开 MCP Profile，不导入 Host 内部类 |
| Desktop/Mobile | Flutter Diff 与桌面工作台耦合；Helix 是原生进程 | Web 技术适合 MCP Apps，但不是现成 OpenMuse 插件 | 公共 MCP Apps 视图；原生旧入口可逐步接入同一合同 |

## 已复现的选型依据

从当前 Host 文件提取原样 `_lineDiff` 纯函数运行：两个完全相同的 **2001 行**文件得到 **2001 新增 + 2001 删除**；3 行相同文件则正确为 0。原因是行数乘积超过阈值后，无论内容是否相同都走整文件替换。这不是公共精确比较应有的行为。

锁定的 DSH 0.2.2-rc.1 `localHunks/diffTotals` 对相同的 2001 行返回 0；但 300 行完全修改会超过它的 256 编辑预算并走整片段替换。因此不能直接发布其片段卡片算法为完整仓库审阅工具：需要 worker/取消、数据量预算，以及 `exact / budget-exceeded / truncated / unavailable / binary` 等显式结果。

Host 的版本存储策略有价值，但目前不是完整版本事件系统：相同内容会返回既有快照；A→B→A 不产生新的 A 保存事件。应继续去重 blob，另建轻量版本事件/来源标识。公共化前还要补索引并发与原子替换、读取摘要校验、二进制/编码边界、资源归属检查。不是另建 Git，也不把路径字符串直接交给插件。

## 目标边界

```text
Host Resource Authority / 既有 LocalVersionStore
  └─ 授权的文件版本来源（opaque ref、bytes、digest、版本事件）
Git / 已有仓库与 MR Provider
  └─ 仓库工作区、暂存区、分支、提交、MR（固定引用、原生 patch）
            ↓ 同一公共比较输入
Repository Review Plugin
  ├─ Diff core：原生 patch / jsdiff → hunks + 精度 + 绝对行号
  ├─ Highlight：Shiki tokens，保留左右语法状态
  ├─ Review UI：统一/并排、文件树、增删/行内变化、意见与已阅
  └─ Review receipt：比较摘要 + head SHA + 意见；不代替平台批准
            ↑ 公共 MCP tools/resources
       Muse-CI / DSH / 其他插件
```

### 公共合同（待实现，不是现有 Host tool 名称）

- `VersionSource`：发现能力、列出已授权资源版本、按不透明引用读取指定版本。Host 保留账号/资源权限与数据权威，拒绝任意路径和越权引用。
- `RepositorySource`：Provider 返回已授权仓库 ID、工作区/暂存区/分支/提交/MR 比较来源及固定版本。仓库权限不强塞到目前要求文件字节绑定的 capability gateway；缺少通用仓库根授权时补授权接缝，或由受信后端的仓库目录授权。Git 和平台认证留在来源 Provider。
- `Comparison`：完整 before/after 或原生 patch；保留 source kind、repository ref、base/head、hash algorithm、old/new path、oldStart/newStart、文件状态、编码/换行及完整性状态。
- `Review`：读取比较、定位文件、按左右行号记录意见、已阅、导出回执。意见固定到比较摘要；来源更新后不自动沿用旧验收。平台 Review/提审/合并是单独操作与回执。

这些是标准 MCP 上的生态业务合同，不添加 MCPB 私有字段，也不假称 MCP 基础规范已经定义这些工具。

## Host 必要改动与不应进入 Host 的业务

Host 需要把**已有**版本能力接到公开发现、授权、读取与生命周期上；抽离服务与原生 Tab 打开行为，使其可返回比较输入而不强制开窗口。必要时补通用已安装插件打开/跨插件调用接缝，关闭、账号切换和配对撤回立即失效。不能把内部 `openVersionComparison` 方法直接包装成第三方可随意传路径的命令。

Host 不增加 CI 版本/需求状态机、GitHub/GitLab MR 审批逻辑、仓库专属页面或 Review 意见数据库。公共插件承载审阅 UI 与意见；Host 保留已有文件版本权威。现有原生 Diff 可先保持兼容入口，再迁移到公共渲染能力，避免破坏工作台恢复和资源关闭流程。

现有 Muse-CI 仓库 Provider 的 API 凭据、固定 SHA、分页和平台门禁应通过适配迁往公共来源能力，保留兼容薄层；不能复制第二份认证和合并状态。

## 首版迭代顺序与验收门禁

1. CAP-01：锁定本 ADR 与公共合同；Host 既有版本来源可发现、可授权、可读、可撤回。先验证两个保存版本与当前内容的比较。
2. VIEW-01：纯 Diff 与 Shiki 高亮；统一/并排、原始行号、行内变化、文件树、折叠上下文。保留缺失/截断/二进制状态，超预算不伪装精确。
3. REVIEW-01：复用仓库 Provider，接工作区/暂存区、分支、提交和真实 MR；Muse-CI 与独立 MCP 客户端使用同一合同。固定 head SHA 与比较摘要。
4. ACCEPT-01：安装后 Desktop、Find N6 展开/外屏，经国内公网中转验收。重点是**真实 MR/仓库 Diff 的语法高亮与增删改审阅**；补丁更新撤销旧意见锚点，不把“已阅”认作批准。

核心用例包括：相同 2001 行为零变更、多处修改与原始行号、只有末尾换行变化、重命名/二进制、非常长单行、大文件取消、过期 head、权限撤回、宽屏并排、外屏统一、意见/回执持久化。产品稿、方案、测试用例与报告继续使用原生 SmartDoc。

## 参考

- 本机权威实现：Muse-Client 工作台的 workspace_controller.dart、workbench_shell.dart 与版本比较测试。
- DSH Desktop 实际 package-lock 的 0.2.2-rc.1 发布包与 MIT 许可证；不是把较旧 checkout 当发布版本。
- [jsdiff 官方 API](https://github.com/kpdecker/jsdiff)：structuredPatch、parsePatch、编辑预算。
- [Shiki 细粒度 bundle](https://shiki.style/guide/bundles)：按需语法与主题，避免把完整编辑器搬进手机。
- [Git diff 官方语义](https://git-scm.com/docs/git-diff)：工作区、暂存区、提交与 merge-base 比较由 Git 来源确定。
