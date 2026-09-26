# 内存问题：诊断与本地防护

整机卡死不能仅凭网页 JavaScript 堆大小判断。应分别记录系统提交量/上限、可用物理内存、内核非分页池，以及进程 Private Bytes。工作集含共享页面，简单相加并不等于实际占用。

## 已实施的资源管理

- 空闲同步保持数据引用、不重复重建学习模型；隐藏标签暂停轮询，请求超时或退出时中止。
- TED/训练按需加载；当前文章媒体流式读取，不预加载整套 PDF/MP3。
- 音频组件退出后暂停、移除媒体源并调用 `load()`；TED 循环计时器仅在实际循环播放时运行。
- 开发文件监听和 ESLint 排除部署产物、运行缓存、本地数据库及私人语料。`build/` 内的插件源仍可触发开发更新。
- 例句解码最多接收 61 秒 PCM，并拒绝超过 60 秒的输入；哈希分块计算，避免整文件复制。错误流不累积在内存中。

这些是可核实的改进，不能据此宣称任何一次整机卡死已经归因或彻底修复。

## Windows 轻量记录器

Windows 下的 `npm run dev`、`npm run build`、`npm start` 自动经过本地守护器。整个任务的用户态提交内存限制为 4 GiB；每 5 秒检查，系统提交量达 85% 或可用物理内存低于 2 GiB 时，仅终止自己启动的任务。启动时已达到阈值则拒绝启动。Windows Job Object 随守护器关闭释放，避免遗留子进程。该限额不限制内核池，也不能防止其他程序耗尽内存。

开发服务最多运行 4 小时，构建最多 30 分钟；超时需重新启动。输出日志达 64 MiB、指标日志达 16 MiB 时停止任务；检查间隔内输出可能短暂超限，结束后输出截断至上限。日志保存在上述诊断目录的 `guarded-runs`，不会公开上传。非 Windows 系统保持原有执行方式。不要通过设置 `KOTOBA_BOUNDED_RUN` 绕过守护器；此变量仅供内部子进程避免递归。

其他离线任务也可显式使用守护器，例如在 `app` 目录运行 `node scripts/run-task.mjs ..\\.venv\\Scripts\\python.exe scripts\\generate_voice_pack.py`（默认仅验证现有音频）。此方式不会自动改写或接管另外启动的工具。

在项目 `app` 目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/diagnostics/Start-MemoryRecording.ps1
```

后台每 10 秒采样，默认 4 小时自动结束。日志位于 `%LOCALAPPDATA%\KotobaStudy\Diagnostics`，不在 OneDrive 项目内。只记录进程名、PID、内存和系统计数，不读取网页 URL、命令行、密码或文件内容，不上传日志。按名称汇总会合并不同应用使用的同名进程，因此还需结合 PID 和时间判断。

日志为 8 个、每个最多 4 MiB 的循环 JSONL 文件。每条请求落盘；重启后保留完整记录，不能保证磁盘或系统已失去响应时仍写入成功。记录器单实例运行，自身私有内存超过 256 MiB 就退出；不关闭用户程序、不设置开机自启。

停止：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/diagnostics/Collect-Memory.ps1 -Stop
```

单次检查可直接运行 `Collect-Memory.ps1 -Once`；已在运行时不会再开第二份。诊断日志可能含个人使用的软件名称，不应上传公开仓库。

## 排查边界

- Windows 的 Kernel-Power 41 只证明非正常重启，不能单独证明内存耗尽。参考 [Microsoft 事件 41 说明](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/event-id-41-restart)。
- 内核非分页池持续增长时，应进一步按池标签定位内核组件；不能归入浏览器 JavaScript 堆。参考 [Microsoft PoolMon 排查方法](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/using-poolmon-to-find-a-kernel-mode-memory-leak)。
- 页面、离线 OCR/词典构建、本地开发服务和浏览器是不同任务。打开正式网站不会自动运行本机 Python OCR。运行这些离线工具应串行、有上限，避免与开发构建并行。
- 长期学习历史仍是整体缓存；大量历史会增加解析/克隆成本。已有模拟测试不替代真实设备长期使用，应先测量再决定迁移存储结构。
- 不通过清空学习记录、关闭安全软件、禁用驱动或改变系统全局设置来猜测原因。
