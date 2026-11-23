# 能力复用

已核实 openmuse_file_viewer_flutter 的 OpenMuseCodeBody、Tree-sitter syntax.dart、showViewerCodeNavigation 与 ResourceCodeNavigation；原生入口由 Open File Viewer ResourceHandler 提供。MCP Runtime 已支持 digest-pinned data resources 和 ui/open-link，无需新增任意路径打开 API。

本轮新增被动 review-viewer 数据格式及原生复用组件，Host 不新增仓库读取、审核或 CI 业务。历史文本导航与工作区的 LS 导航分别保持版本语义。
