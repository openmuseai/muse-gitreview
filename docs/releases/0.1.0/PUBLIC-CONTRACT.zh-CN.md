# 公开能力合同与安装边界

`capability://repository-review/contracts` 是此候选版实际提供的合同资源。

## 插件工具

| 工具 | 输入与产物 |
|---|---|
| review_sources | 操作方配置授予的 repositoryId、来源类型、分支与 HEAD |
| repository_history | repositoryId、可选 path；最近40条提交，保留 SHA |
| repository_compare | repositoryId、workspace/staged/branch/commit/mr、引用或MR编号；固定比较ID及摘要 |
| repository_read | repositoryId、不可变SHA、path；完整文本/字节摘要。必要时经已配置的 GitHub 服务读取固定提交 |
| review_open | 其他消费者提供的比较合同；不把任意输入路径变成文件授权 |
| review_list / review_read | 比较列表、固定源引用、按文件取得文本或原始补丁、意见与已阅 |
| review_change | 比较ID、expectedDigest、commandId；标记已阅/意见/解决/本地结论 |
| review_export | 固定快照的审阅回执；platformApproval=false、merged=false |

review_list、review_open、repository_compare 声明同一 MCP Apps UI 资源。DSH 可通过已有 apps_list → apps_tools_list → apps_call_tool / apps_open 发现和使用；源码不导入 CI 或 Host 实现。重复打开已有快照会将其置顶，但不会继承其他摘要的已阅与意见。

## Host 通用文件版本合同

- host_versions_list：无参数返回显式授予的 opaque resourceId；指定 resourceId 返回版本事件。事件ID与内容摘要分离。
- host_versions_read：resourceId、可选 versionId；缺省读取已刷新的当前文件，返回完整文本或 base64 字节及 SHA-256。
- host_versions_capture：保存 Host 现有 LocalVersionStore 的版本事件。
- host_versions_restore：resourceId、versionId、expectedSha256；先备份当前文件，摘要不匹配则拒绝，文件被原生编辑器打开时要求先关闭。

权限来自 Host 安装配置的 versions.read / versions.write 和明确的相对文件集合，不来自插件包或页面传入的绝对路径。host_versions_ 为 Host 保留命名空间。账号切换撤销请求；编辑器 flush 中切换账号也不能将旧文件写到新账号版本库。Mobile 通过已授权配对中转调用 Desktop 的同一工具，不复制后端密钥。

当前操作方安装配置属于现有 developer-installed MCP Apps 路径；MCPB 中没有新增 Host 私有 manifest 字段。公开市场审查与通用安装器文件授权 UI 是后续分发工作，当前候选物不冒充已获市场批准。

## 边界

文件历史的 byteLength 读取预算为900,000字节；超过预算明确拒绝。文本比较总输入限制4MiB、最多300文件；Git 单文件900,000字节，过量/缺失不会伪造“无变更”。全文可分段读取展示；未知语言回退原文。二进制只做字节版本，不宣称结构化Office/PDF语义Diff。

恢复操作作用于明确授予的单个文件；Git 来源首版是只读查询与本地审阅。分支创建、commit/push、平台 review submit 和合并仍由拥有相应授权的版本管理/CI Provider 执行。此插件不复制造成第二套Git账号库。
