# Host 与已安装能力核对

2026-11-23。首版优先复用现有能力；此文区分实现存在与公开插件合同可调用，避免重复建设。

补充基线：DSH Desktop 锁定 ui-primitives/tool-fs 0.2.2-rc.1；本机 vendors/deepseek-harness checkout 为 0.1.5-rc.2，仅作历史参考。已下载锁定的 npm 包并核对 SHA-512 与 lockfile 相符，最终选型见 ADR-001-DIFF-AND-VERSION-SELECTION.zh-CN.md。

| 能力 | 已定位实现 | 当前边界 |
| --- | --- | --- |
| 文件版本保存与读取 | Muse-Client `app/openmuse_host/lib/src/host/workspace_controller.dart` 的 LocalVersionStore、captureVersion、versions | 内容寻址、追加保存；读取前等待编辑器 flush |
| 两个保存版本/快照与当前内容比较 | 同文件 openVersionComparison、openDiff | 已有不可变 before/after 与来源标识；不等同 Git 分支或提交比较 |
| 统一/并排 Diff | `app/openmuse_host/lib/src/host/workbench_shell.dart` 的 DiffWorkbench、UnifiedDiff、SideBySideDiff | 已有增删行号、统计与视图切换；当前为 Host 内部 Widget/方法 |
| 文件/资源版本身份 | `packages/openmuse_plugin_sdk/lib/src/resource_capabilities.dart`，ResourceVersion 与只读快照会话 | 原生 SDK 已有；公开 MCP 消费者必须经能力合同获得引用 |
| 文本语言与高亮 | Helix 编辑器插件；文件预览的 duskmoon_highlight | 复用现有语言与配色语义，保留高亮；不能把原生实现直接导入独立 Web 插件 |
| DSH 代码与 Diff 展示 | vendors/deepseek-harness 的 ui-primitives/DiffBlock、CodeBlock 与 Shiki；由 dsh-desktop 使用 Harness UI | 按实际 0.2.2-rc.1 包比较；DiffBlock 已有 jsdiff 上下文、预算和折行，语法高亮仍需组合独立 CodeBlock/useCodeHighlighter；不复制 Agent/Host runtime |
| 跨插件发现与调用 | Resource Extensions v1 的 list_plugin_tools、call_plugin_tool，能力网关 capabilities_list/bind/call | 当前资源 View 的授权/生命周期约束仍生效；不能据此推断任意仓库权限 |
| Workspace 描述 | mcp_workspace_tools.dart 的 workspace_describe | 已有公开工具；未发现同文件声明 Git status/branch/commit/diff 工具 |
| 真实 MR Diff | Muse-CI ci_mr_diff + repository provider | 可复用现有仓库认证、固定 head SHA、分页和 stale 检查。CI 调用通用审阅插件，Diff UI 不再内嵌在 CI 业务中 |

核对结论：Host 的版本与 Diff 实现确实已存在。独立插件应消费已有能力，而非建立第二份文件版本库、替换 Host 编辑器或复制 Git 平台认证。目前定位到的公开 MCP 合同尚未暴露 LocalVersionStore 的列表/比较操作，也尚未定位用户可能另指的 Git 版本管理插件。继续核对实际插件 ID 与 tools/list；只有真实发现的合同才启用对应操作。必要时补通用合同适配，不加入 CI 专属 Host 分支。

首版渲染要求：语法高亮、统一/并排、真实行号、增删底色、行内修改、折叠上下文、文件树与统计、清晰来源。无权限、过期 SHA、二进制、补丁缺失或截断明确显示，不将缺少补丁渲染成“无变更”。查看、CI 验收意见、平台 Review 和合并是不同结果。
