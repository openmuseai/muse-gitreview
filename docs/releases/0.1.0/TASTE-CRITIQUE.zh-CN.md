# tast 渲染批评与修正记录

方向 product-performs，seed1540704789。实际 MCP Apps 页面连接真实插件服务后，通过 CUA 检查默认1280px、768px和390px；本地Web检查不记为Desktop/Android真机通过。

修复：

- 高亮语法库包含 replacement 字符串，最初模板 replace 展开了 `$` 特殊序列并破坏 script 边界；改为函数替换，加入真实构建脚本解析与打包后 stdio UI 逐字节测试。
- MCP App 严格 iframe 不允许原生 form 提交，意见保存改为按钮事件；实际保存、解决、已阅、本地结论已回读成功。
- 390px 原审阅标题易换行挤压，改为可换行容器与保持标题完整；关键顶部操作44px。
- 完整文件按500行分页，保留原始行号；MR按固定SHA补读全文，不以补丁片段冒充完整文件。
- 语法颜色使用五种以上实际 token 色，增删同时有符号与背景；非代码Markdown也保留标题与源码结构，不执行文件HTML。

静态lint原始结果见 evidence/taste-lint.json。格式化源文件后，规则报告9处 hairline（工作台栏、工具栏、代码行号、意见/版本行等结构分隔）、2处 outlined-box 警告和 hex 字节 padStart 警告。此 skill 原生针对展示网站，本任务用户明确要求应用工作台；这些应用结构边界作为有理由的例外保留，没有压缩源文件或改写语法来隐藏提示。未将原始lint结果描述为零失败。

已归档真实截图：统一/并排高亮、非代码全文、390px代码与文档、768px布局、实际Muse-CI MR。当前Mac锁屏阻止原生Desktop与Android镜像，因此其最终视觉与手势交互仍是未完成门禁。
