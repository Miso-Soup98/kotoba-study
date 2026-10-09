# 用云端构建减少本机负担

2026-10-10：配置已准备，尚未启用或在云端运行，正式站点未更新。当前GitHub登录有`repo`权限，没有`workflow`权限；按GitHub要求，新建工作流需额外授权。配置暂存在[cloud-build.workflow.yml](ci/cloud-build.workflow.yml)，不会因为普通代码推送自动运行。

建议使用GitHub Actions标准Linux机器完成安装、串行测试、类型检查和生产构建，现有Sites负责托管。学习记录、ChatGPT登录和私人TED继续留在原站点；云构建只读取已公开的仓库，不需要Sites令牌、生产密钥或私人资料。公开仓库的标准托管runner计算免费；这里只使用标准`ubuntu-24.04`，不选择收费的大型runner，构建包保留1天。[GitHub计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

## 启用前的唯一账号准备

由仓库所有者确认GitHub工作流授权。以下命令会进入官方授权流程，不应把任何令牌发到聊天或写入仓库：

```powershell
gh auth refresh -h github.com -s workflow
```

这是GitHub对新增工作流文件的权限要求，不是网站发布审批，也不是内存限制。授权完成后，将模板移动到`.github/workflows/cloud-build.yml`并提交推送开发分支，首次由限定分支的push事件执行。`workflow_dispatch`需工作流已进入默认分支才可从界面手动运行。[OAuth权限说明](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)、[手动运行说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

工作流仅有源码读取权限；动作版本固定提交、不保留checkout凭据、不读生产secrets，不会自动部署。此模板尚未经过实际Linux云构建，不能把语法检查当作构建验收。

## 构建成功后的发布

1. 下载成功运行的`kotoba-build-<源码SHA>`构建包，核对运行对应的源码SHA及`SHA256SUMS`。
2. 在完全相同源码、没有额外源码变更的工作区恢复`dist`。只接收对应仓库可信工作流的构建包，恢复前检查归档路径，不能覆盖工作区外的文件。
3. 使用既有Sites插件源码/打包流程，`commands: []`省去重复本机构建；保留`dist/.openai`的托管声明与数据库迁移，推送同一源码再保存版本。
4. 用户要求发布时，通过现有Sites发布流程更新原网址并确认部署结果。本模板不连接生产站点，也不迁移数据。

构建产物先打成tar.gz再上传，避免`upload-artifact`默认忽略隐藏目录导致`.openai`丢失。[Artifact说明](https://github.com/actions/upload-artifact)

如果Sites账户支持按源码推送自动私有发布，也可省去本机构建，但这会直接更新正式站点，且仅在平台返回`publish_on_push_accepted: true`时可用。目前没有启用此发布窗口，不能将它作为独立的“只构建”服务。
