import gsap from "gsap";

class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private started = false;
  private muted = false;
  private listeners = new Set<(state: { muted: boolean; started: boolean }) => void>();
  private fadeTween: gsap.core.Tween | null = null;
  private warmed = false;
  private playAttempt = 0;

  init(src: string) {
    if (!src) return;
    const audio = new Audio();
    audio.src = src;
    audio.loop = true;
    // Chưa tải file nhạc lúc khởi động: 0.9 MB nhạc sẽ tranh băng thông
    // với ảnh bó hoa và làm màn hình chờ lâu hơn.
    audio.preload = "none";
    audio.volume = 0;
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    // Một số trình duyệt mobile chỉ phát ổn định khi thẻ media nằm trong DOM.
    document.body.appendChild(audio);
    audio.addEventListener("error", () => {
      console.warn("[audio] Không tải được nhạc nền:", src);
    });
    this.el = audio;
  }

  /** Tải nhạc sau khi cảnh đầu đã hiện, để không chặn lúc khởi động. */
  warm() {
    if (!this.el || this.started || this.warmed) return;
    this.warmed = true;
    this.el.preload = "auto";
    try {
      this.el.load();
    } catch {
      /* ignore */
    }
  }

  async start() {
    if (!this.el || this.started) return;
    const attempt = ++this.playAttempt;
    this.started = true;
    this.el.volume = 0;
    // iOS Safari không cho chỉnh volume của thẻ audio, nên trạng thái tắt
    // tiếng phải dựa vào thuộc tính muted/pause thay vì volume.
    this.el.muted = this.muted;
    if (!this.warmed) {
      this.warmed = true;
      this.el.preload = "auto";
    }
    try {
      await this.el.play();
      if (attempt !== this.playAttempt) return;
      this.fadeTo(this.muted ? 0 : 0.55, 1.3);
    } catch (error) {
      if (attempt !== this.playAttempt) return;
      // Autoplay bị chặn hoặc file chưa sẵn sàng - thử lại ở lần chạm kế tiếp.
      if (!this.muted && this.el.paused) this.started = false;
      console.warn("[audio] Chưa phát được nhạc nền:", error);
    }
    this.emit();
  }

  private fadeTo(value: number, duration = 0.6) {
    if (!this.el) return;
    this.fadeTween?.kill();
    this.fadeTween = gsap.to(this.el, { volume: value, duration, ease: "sine.out" });
  }

  /** Tắt tiếng bằng muted + pause: volume không đáng tin trên iOS. */
  private setMutedState(muted: boolean) {
    if (!this.el) return;
    this.el.muted = muted;
    if (muted) {
      this.playAttempt++;
      this.fadeTween?.kill();
      this.el.pause();
      return;
    }
    if (this.started) {
      this.playAttempt++;
      void this.el.play().catch((error) => {
        console.warn("[audio] Chưa phát lại được nhạc nền:", error);
      });
      this.fadeTo(0.55, 0.45);
    }
  }

  toggle(): boolean {
    this.muted = !this.muted;
    this.setMutedState(this.muted);
    if (!this.started && !this.muted) void this.start();
    this.emit();
    return this.muted;
  }

  setMuted(m: boolean) {
    if (this.muted === m) return;
    this.muted = m;
    this.setMutedState(m);
    this.emit();
  }

  duck(amount = 0.22, duration = 0.8) {
    if (!this.el || this.muted) return;
    this.fadeTo(amount, duration);
  }

  unduck(duration = 1.2) {
    if (!this.el || this.muted) return;
    this.fadeTo(0.55, duration);
  }

  get isMuted() {
    return this.muted;
  }

  get hasStarted() {
    return this.started;
  }

  subscribe(fn: (state: { muted: boolean; started: boolean }) => void) {
    this.listeners.add(fn);
    fn({ muted: this.muted, started: this.started });
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const state = { muted: this.muted, started: this.started };
    this.listeners.forEach((fn) => fn(state));
  }
}

export const audio = new AudioEngine();
