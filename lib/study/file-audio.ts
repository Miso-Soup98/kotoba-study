/** One reusable media element keeps a user's playback gesture across a lesson. */
export class FileAudio {
  private element: HTMLAudioElement | null = null;
  private finish: ((error?: Error) => void) | null = null;
  private held = false;
  private attempt = 0;
  private waitingTimer: ReturnType<typeof setTimeout> | undefined;
  private create: () => HTMLAudioElement;
  private timeoutMs: number;

  constructor(create = () => new Audio(), timeoutMs = 15000) {
    this.create = create;
    this.timeoutMs = timeoutMs;
  }
  private clearTimer() {
    clearTimeout(this.waitingTimer);
  }
  private waitForData() {
    this.clearTimer();
    if (!this.held)
      this.waitingTimer = setTimeout(() => {
        this.finish?.(Error("音频加载超时，请检查网络后重新播放。"));
      }, this.timeoutMs);
  }
  stop() {
    this.attempt++;
    this.finish?.();
    this.element?.pause();
    this.held = false;
    this.clearTimer();
  }
  pause() {
    this.attempt++;
    this.held = true;
    this.clearTimer();
    this.element?.pause();
  }
  resume() {
    const attempt = ++this.attempt;
    this.held = false;
    if (!this.finish || !this.element) return;
    this.waitForData();
    const finish = this.finish;
    void this.element.play().catch((error: unknown) => {
      if (this.attempt !== attempt) return;
      if (this.held && error instanceof Error && error.name === "AbortError")
        return;
      if (this.finish === finish)
        finish(Error("浏览器未能继续播放，请重新点击例句播放。"));
    });
  }
  play(src: string, rate: number): Promise<void> {
    this.stop();
    const attempt = ++this.attempt;
    const media = (this.element ??= this.create());
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        if (this.finish !== finish) return;
        this.finish = null;
        this.clearTimer();
        media.onended =
          media.onerror =
          media.onplaying =
          media.onwaiting =
            null;
        media.pause();
        if (error) reject(error);
        else resolve();
      };
      this.finish = finish;
      media.onended = () => finish();
      media.onerror = () =>
        finish(
          Error(
            "音频暂时无法加载，请联网后重试；也可在声音设置中选择浏览器声音。",
          ),
        );
      media.onplaying = () => this.clearTimer();
      media.onwaiting = () => this.waitForData();
      media.src = src;
      media.playbackRate = rate;
      media.preservesPitch = true;
      this.waitForData();
      void media.play().catch((error: unknown) => {
        if (this.finish !== finish || this.attempt !== attempt) return;
        const name = error instanceof Error ? error.name : "";
        if (this.held && name === "AbortError") return;
        finish(
          Error(
            name === "NotAllowedError"
              ? "浏览器暂时阻止了音频播放，请重新点击例句播放。"
              : "音频播放失败，请检查网络后重试。",
          ),
        );
      });
    });
  }
}
