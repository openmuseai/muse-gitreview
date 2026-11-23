# Open File Viewer 集成合同

review_viewer({comparisonId}) 返回 uri、sha256、mimeType 与文件名。MIME 为 application/vnd.openmuse.review-viewer+json，扩展名 .omreview；schema 为 openmuse.review-viewer/1。

内容包括固定比较摘要、来源、文件前后完整文本（若可取得）、原始行号补丁、意见与已阅快照。MR 用固定 base/head SHA 补读全文，最多补读2MiB；缺失和超预算不伪造全文。文档无命令、脚本、任意本机路径与可执行动作。审阅写入继续通过原有工具及权限完成，原生内容只读。

同一资源通过 resources/list 声明 MIME 与 _meta.sha256，resources/read 提供精确字节。插件使用标准 ui/open-link 与现有 mcp-resource 摘要定位；ResourceCenter 二次读取并核对摘要，再交给 Open File Viewer。URI 既不选后端也不授予新权限。

资源在独立插件数据目录按内容摘要原子归档，进程重启后重新登记；磁盘内容摘要不符则拒绝载入。单资源上限8MiB，缓存上限100份；Host 不复制版本库或加入仓库业务。
