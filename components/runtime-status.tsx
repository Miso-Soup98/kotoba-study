"use client";
import { useEffect, useState } from "react";
import type { useStudy } from "@/lib/study/use-study";

export function RuntimeStatus({
  study,
}: {
  study: ReturnType<typeof useStudy>;
}) {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState({ heap: "", online: true });
  useEffect(() => {
    if (!open) return;
    const read = () => {
      const memory = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory;
      setSample({
        heap: memory
          ? `${Math.round(memory.usedJSHeapSize / 1048576)} MB`
          : "此浏览器不提供",
        online: navigator.onLine,
      });
    };
    read();
    const timer = setInterval(read, 5000);
    return () => clearInterval(timer);
  }, [open]);
  return (
    <details
      className="panel runtime-status"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>运行状态与设备检查</summary>
      {open && (
        <div>
          <dl className="runtime-grid">
            <div>
              <dt>网络</dt>
              <dd>{sample.online ? "在线" : "离线"}</dd>
            </div>
            <div>
              <dt>同步</dt>
              <dd>{study.status}</dd>
            </div>
            <div>
              <dt>本机记录</dt>
              <dd>
                {study.cache.events.length} 条 · 待上传{" "}
                {study.cache.pending.length} 条
              </dd>
            </div>
            <div>
              <dt>页面 JavaScript 内存</dt>
              <dd>{sample.heap}</dd>
            </div>
          </dl>
          <p className="footnote">
            内存数值仅包含 JavaScript
            堆，不包含全部音频、图片或浏览器进程。关闭此面板即停止采样。
          </p>
          <p>
            在 iPhone / iPad 上，可依次试用：播放例句 → TED 循环 → 切换页面 →
            重新打开查看标记。另一台设备登录同一账号后，应能看到相同记录。
          </p>
          <button className="secondary" onClick={() => void study.sync()}>
            重新同步
          </button>
          <p className="footnote">
            若发生卡顿，请记下这里的数值和当时操作。无需清除网站数据。
          </p>
        </div>
      )}
    </details>
  );
}
