import gsap from "gsap";

class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private started = false;
  private muted = false;
  private listeners = new Set<(state: { muted: boolean; started: boolean }) => void>();
  private fadeTween: gsap.core.Tween | null = null;

  init(src: string) {
    if (!src) return;
    const audio = new Audio();
    audio.src = src;
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audio.crossOrigin = "anonymous";
    audio.addEventListener("error", () => {
      console.warn("[audio] Không tải được nhạc nền:", src);
    });
    this.el = audio;
  }

  async start() {
    if (!this.el || this.started) return;
    this.started = true;
    try {
      await this.el.play();
      this.fadeTo(this.muted ? 0 : 0.55, 2.4);
    } catch {
      // Autoplay bị chặn — thử lại ở lần chạm kế tiếp.
      this.started = false;
    }
    this.emit();
  }

  private fadeTo(value: number, duration = 0.6) {
    if (!this.el) return;
    this.fadeTween?.kill();
    this.fadeTween = gsap.to(this.el, { volume: value, duration, ease: "sine.out" });
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.el) {
      if (!this.started) void this.start();
      else this.fadeTo(this.muted ? 0 : 0.55, 0.45);
    }
    this.emit();
    return this.muted;
  }

  setMuted(m: boolean) {
    if (this.muted === m) return;
    this.muted = m;
    if (this.el) this.fadeTo(m ? 0 : 0.55, 0.35);
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
