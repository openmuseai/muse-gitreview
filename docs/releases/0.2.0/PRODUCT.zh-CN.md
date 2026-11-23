# Repository Review 0.2.0 · 原生 Diff 与代码浏览

项目 repository-review-plugin，独立工程 Muse-Repository-Review。0.1.0 的实测证据保留；本轮对应用户提供的 IDE Git tree 与并排对比参考图。

## 功能与交互

- 文件树：目录层级、折叠/展开、单行文件名、增删改标记、当前文件高亮。Desktop/展开屏固定树和内容；窄屏用文件树抽屉，不挤压 Diff。Desktop 行高30px，触摸目录/文件44px。
- 原生浏览：插件产生摘要固定的 .omreview 资源，经已有 MCP ResourceSource 与 ResourceCenter 打开 Open File Viewer；不传本机绝对路径、token 或任意命令。两端同一原生组件与 Tree-sitter 语法高亮。
- 对比：统一/并排、原始行号、增删背景与符号、前后全文、上一/下一变更、未改动区展开与折叠。仅完整原文能够展开隐藏部分，补丁缺失必须提示。
- 导航：点击 Diff 行进入同一快照的原/新全文并定位该行；跳转行、跨文件快照文本查找、选择结果跳转。固定快照的文本导航不冒充当前工作区 LS 定义/引用结果；既有工作区 Open File Viewer 的 ResourceCodeNavigation 能力继续使用原来的授权与版本合同。
- 审阅与管理：已阅、意见、解决/重开、本地结论仍由独立插件保存并导出；原生文档是只读内容快照，返回插件继续修改审阅状态，不在文件里执行批准/合并或可执行动作。
- 非代码：Markdown/TXT/JSON 保留完整字节来源与全文行号；图片原/新预览；不宣称 Office/PDF 语义合并。

## 归档与验收

Muse-CI 版本根 .muse-project-repository-review-plugin/versions/0.2.0，分为 native-viewer、compact-tree、snapshot-navigation、foldable-acceptance 四个需求。每个需求包含 PRD、UI、方案、实现、用例与真实测试报告；生产市场未发布。

端到端使用用户指定的 PLP110。实际协议、账号、国内公网中转，普通 QA 主入口进入插件，再打开 Open File Viewer，验收代码与非代码、展开屏/外屏、折叠上下文、原/新全文和跳转。设备或物理折叠未完成时门禁保留，不能用浏览器替代。
