# 0.2.0 开发与交付计划

1. NATIVE：发布 openmuse.review-viewer/1 被动文档；MCP 资源 SHA 固定；原生 Open File Viewer 处理媒体类型与 .omreview。
2. TREE：通用插件紧凑 Git tree，原生两栏与窄屏抽屉；不重复显示每个文件的全部父目录。
3. NAV：复用 Tree-sitter 与 OpenMuseCodeBody；历史快照行定位、全文浏览、文本查找；未改动部分安全展开与折叠。
4. E2E：协议与模型专项、真实 MCP 资源读取及摘要检查、Desktop 和 PLP110 两种屏幕形态截图与操作回读。

入口、目录、状态机、MCP 鉴权沿用现有实现；文件树与 Diff 渲染位于 open-file-viewer 共用组件，不给 Host 加入 Git 或 CI 专属业务。
