# tast skill 设计与应用

使用 Muse-Client/.agents/skills/design-taste-frontend/SKILL.md（tasteskill v2），抽签方向 product-performs，seed 1540704789。用户明确请求插件工作台，因此将该 skill 的构图、节制、阅读优先、渲染批评与静态检查用于应用，省略营销站 hero、图片与 GSAP。

原料盘点：真实 Git 与 Host 历史、原始代码、产品稿 Markdown、二进制图片、现有 OpenMuse MCP Apps 运行时。核心视觉原料是实际 Diff，不使用虚构指标或假仪表盘。

选择：白色阅读面、灰绿来源栏、深绿动作；红绿底仅表达增删，颜色之外同时有符号和行号。系统无衬线用于菜单与材料，仅代码用等宽。标题 19–20px、正文15px、代码13–14px；操作触达至少42px，手机关键动作44px。Desktop 左侧来源和文件、右侧 Diff 与意见；窄屏隐藏侧栏，以来源弹窗和文件选择器进入相同合同。

组件：来源表单、固定摘要页头、Diff 视图切换、带行号锚点的代码区、意见与结论、版本时间线、带当前摘要的恢复确认。没有内联任意 HTML；Shiki token 与源码分别转义。未知语言回退为可读纯文本；极长行跳过高亮保留全文。

验证：skill lint 扫描 web/；渲染以 CUA 实际 Desktop / Android 检查为准。静态 lint 对 hexPreview 的 padStart 提示属于十六进制字节格式，不是装饰编号。后续证据记录实际截图与改动，未渲染前不填写“视觉通过”。
