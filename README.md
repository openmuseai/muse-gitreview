# Repository Review

OpenMuse 的独立 MCP / MCP Apps 插件。用同一审阅界面查看仓库工作区、暂存区、分支、提交、MR，以及 Host 授权的文件历史。

- `src/`：公开合同、Git / MR 来源、持久审阅状态与独立 MCP 服务。
- `web/`：共享高亮、统一 / 并排 Diff、全文、意见与文件版本管理。
- `docs/releases/0.1.0/`：产品、选型、设计、用例、Muse-CI 运行与端到端证据。
此前选型研究保留在 Muse-Plugin-Ecosystem/plugins/repository-review/spikes；不复制到发布工程。

`npm ci && npm test && npm run typecheck && npm run pack`。

运行需要操作方提供的私有 `REVIEW_CONFIG`（参考 `config.example.json`）；凭据和授权仓库路径不进入插件包。默认 stdio；`--http` 启用受 bearer 保护的本机 Streamable HTTP，由已登录国内账号的 Desktop 经现有公网中转授权 Mobile 使用。Host 离线时手机不能读取该 Desktop 的本地仓库。

Host 文件版本沿用 LocalVersionStore。首版额外要求公开 `host_versions_*` 能力及明确文件授权，旧 Host 仍可使用仓库来源。审阅结论属于固定快照的本地记录，不冒充 GitHub 批准或合并。MR 补丁不保证完整文件；缺失数据明确提示并阻止完整通过。

0.2.0 adds compact directory trees and digest-pinned `.omreview` resources for Open File Viewer. The native viewer reuses OpenMuse Tree-sitter highlighting and full-source rendering, with unified/split views, unchanged-context folding, snapshot line navigation and text search. Product and protocol: `docs/releases/0.2.0/`.
