import gsap from "gsap";
import { assetUrl } from "../core/assets";

export type UIState = {
  hint: string;
  hintVisible: boolean;
  caption: string;
  captionVisible: boolean;
  soundMuted: boolean;
  heartButton: boolean;
};

const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h3.2L12 19V5L7.2 9H4Z" fill="currentColor"/><path d="M15.2 8.6a4.6 4.6 0 0 1 0 6.8M17.8 6a8 8 0 0 1 0 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h3.2L12 19V5L7.2 9H4Z" fill="currentColor"/><path d="M16 9.5l4.5 5M20.5 9.5l-4.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;
const ICON_HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.6-4.9-9.5-9.1C1 8.5 3.1 5 6.7 5c2 0 3.6 1.1 4.5 2.7l.8 1.4.8-1.4C13.7 6.1 15.3 5 17.3 5 20.9 5 23 8.5 21.5 11.9 19.6 16.1 12 21 12 21Z" fill="currentColor"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>`;

export class UI {
  readonly stage: HTMLElement;
  readonly hud: HTMLElement;
  readonly hint: HTMLElement;
  readonly caption: HTMLElement;
  readonly soundBtn: HTMLButtonElement;
  readonly heartBtn: HTMLButtonElement;
  readonly loader: HTMLElement;
  readonly copyLayer: HTMLElement;
  readonly lightbox: HTMLElement;
  readonly lightboxImg: HTMLImageElement;
  readonly sceneVeil: HTMLElement;
  private veilTween: gsap.core.Tween | null = null;
  private captionText = "";
  private captionTimer = 0;
  private lightboxClose: HTMLButtonElement;
  private onLightboxClose: (() => void) | null = null;

  constructor() {
    const app = document.getElementById("app")!;
    app.innerHTML = `
      <main class="stage" id="stage">
        <div class="vignette"></div>
        <div class="scene-veil" aria-hidden="true"></div>
        <div class="hud">
          <div class="hud__side">
            <button class="icon-btn icon-btn--sound" type="button" aria-label="Tắt nhạc nền" aria-pressed="false">${ICON_SOUND_ON}</button>
          </div>
          <div class="hud__side hud__right">
            <button class="icon-btn icon-btn--heart is-beating" type="button" aria-label="Mở phong bì">${ICON_HEART}</button>
          </div>
        </div>
        <div class="copy-layer">
          <p class="hint hint--bouquet" aria-live="polite"></p>
          <p class="caption caption--bouquet" aria-live="polite"></p>
        </div>
        <div class="lightbox" role="dialog" aria-modal="true" aria-label="Ảnh phóng to">
          <button class="icon-btn lightbox__close" type="button" aria-label="Đóng ảnh">${ICON_CLOSE}</button>
          <img alt="Ảnh kỷ niệm" />
        </div>
        <div class="loader">
          <div class="loader__dots" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="loader__text">Đang chuẩn bị một chút yêu thương…</p>
        </div>
      </main>
    `;
    this.stage = app.querySelector<HTMLElement>(".stage")!;
    this.hud = app.querySelector<HTMLElement>(".hud")!;
    this.hint = app.querySelector<HTMLElement>(".hint")!;
    this.caption = app.querySelector<HTMLElement>(".caption")!;
    this.copyLayer = app.querySelector<HTMLElement>(".copy-layer")!;
    this.soundBtn = app.querySelector<HTMLButtonElement>(".icon-btn--sound")!;
    this.heartBtn = app.querySelector<HTMLButtonElement>(".icon-btn--heart")!;
    this.loader = app.querySelector<HTMLElement>(".loader")!;
    this.lightbox = app.querySelector<HTMLElement>(".lightbox")!;
    this.lightboxImg = app.querySelector<HTMLImageElement>(".lightbox img")!;
    this.sceneVeil = app.querySelector<HTMLElement>(".scene-veil")!;
    this.lightboxClose = app.querySelector<HTMLButtonElement>(".lightbox__close")!;

    this.lightboxClose.addEventListener("click", () => this.closeLightbox());
    this.lightboxImg.addEventListener("click", () => this.closeLightbox());
    this.lightbox.addEventListener("click", (e) => {
      if (e.target === this.lightbox) this.closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.lightbox.classList.contains("is-open")) this.closeLightbox();
    });
  }

  setLoaderVisible(visible: boolean) {
    this.loader.classList.toggle("is-done", !visible);
  }

  setHint(text: string, visible = true, variant: "bouquet" | "neon" = "bouquet") {
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.toggle("is-hidden", !visible);
    this.hint.classList.toggle("hint--bouquet", variant === "bouquet");
    this.hint.classList.toggle("hint--neon", variant === "neon");
  }

  setCaptionVariant(variant: "bouquet" | "neon" | "envelope") {
    this.caption.classList.toggle("caption--bouquet", variant === "bouquet");
    this.caption.classList.toggle("caption--neon", variant === "neon");
    this.caption.classList.toggle("caption--envelope", variant === "envelope");
  }

  setCaption(text: string, animate = true) {
    if (this.captionText === text) return;
    this.captionText = text;
    window.clearTimeout(this.captionTimer);
    if (!animate) {
      this.caption.textContent = text;
      this.caption.classList.remove("is-changing");
      return;
    }
    this.caption.classList.add("is-changing");
    this.captionTimer = window.setTimeout(() => {
      this.caption.textContent = text;
      this.caption.classList.remove("is-changing");
    }, 320);
  }

  setCaptionVisible(v: boolean) {
    this.caption.style.opacity = v ? "" : "0";
  }

  setSoundMuted(muted: boolean) {
    this.soundBtn.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    this.soundBtn.classList.toggle("is-muted", muted);
    this.soundBtn.setAttribute("aria-label", muted ? "Bật nhạc nền" : "Tắt nhạc nền");
    this.soundBtn.setAttribute("aria-pressed", String(muted));
  }

  setHeartVisible(v: boolean) {
    this.heartBtn.style.display = v ? "" : "none";
  }

  setHudVisible(v: boolean) {
    this.hud.classList.toggle("is-hidden", !v);
  }

  ripple(x: number, y: number) {
    const el = document.createElement("span");
    el.className = "ripple";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.stage.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
    window.setTimeout(() => el.remove(), 1000);
  }

  openLightbox(src: string, onClose?: () => void) {
    this.lightboxImg.src = src;
    this.lightbox.classList.add("is-open");
    this.onLightboxClose = onClose ?? null;
  }

  closeLightbox() {
    if (!this.lightbox.classList.contains("is-open")) return;
    this.lightbox.classList.remove("is-open");
    this.onLightboxClose?.();
    this.onLightboxClose = null;
  }

  get lightboxOpen() {
    return this.lightbox.classList.contains("is-open");
  }

  fadeCopy(v: boolean) {
    this.copyLayer.classList.toggle("is-hidden", !v);
  }

  /** Soft pink bloom that hides the WebGL scene swap. */
  veilIn(duration = 1.1): Promise<void> {
    this.veilTween?.kill();
    this.sceneVeil.classList.add("is-on");
    return new Promise((resolve) => {
      this.veilTween = gsap.fromTo(
        this.sceneVeil,
        { opacity: 0 },
        { opacity: 1, duration, ease: "power2.in", onComplete: resolve },
      );
    });
  }

  veilOut(duration = 1.4): Promise<void> {
    this.veilTween?.kill();
    return new Promise((resolve) => {
      this.veilTween = gsap.to(this.sceneVeil, {
        opacity: 0,
        duration,
        ease: "power2.out",
        onComplete: () => {
          this.sceneVeil.classList.remove("is-on");
          resolve();
        },
      });
    });
  }

  get veilActive() {
    return this.sceneVeil.classList.contains("is-on");
  }

  pulseHeart() {
    gsap.fromTo(
      this.heartBtn,
      { scale: 1 },
      { scale: 1.16, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" },
    );
  }

  /** Pink analogue-glitch burst used for the bouquet → neon transition. */
  glitch(duration = 0.95) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const src = assetUrl("/assets/bouquet.png");
    const overlay = document.createElement("div");
    overlay.className = "glitch-overlay is-active";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <img class="g-main" src="${src}" alt="" />
      <img class="g-r" src="${src}" alt="" />
      <img class="g-c" src="${src}" alt="" />
      <span class="glitch-bar glitch-bar--1"></span>
      <span class="glitch-bar glitch-bar--2"></span>
      <span class="glitch-bar glitch-bar--3"></span>
      <span class="glitch-bar glitch-bar--4"></span>
    `;
    this.stage.appendChild(overlay);
    const imgs = overlay.querySelectorAll("img");
    const bars = overlay.querySelectorAll(".glitch-bar");
    gsap.set(imgs, { xPercent: -50, yPercent: -50, transformOrigin: "50% 50%" });
    const tl = gsap.timeline({
      defaults: { ease: "steps(1)" },
      onComplete: () => overlay.remove(),
    });
    tl.to(overlay, { opacity: 0, duration: 0.18, ease: "power2.in" }, duration - 0.08);
    gsap.to(imgs[0], {
      scale: 1.08,
      duration,
      ease: "power2.in",
    });
    gsap.fromTo(
      imgs[1],
      { x: -18, opacity: 0.75 },
      { x: 14, opacity: 0.35, duration: 0.14, repeat: 5, yoyo: true, ease: "steps(1)" },
    );
    gsap.fromTo(
      imgs[2],
      { x: 16, opacity: 0.6 },
      { x: -12, opacity: 0.25, duration: 0.11, repeat: 7, yoyo: true, ease: "steps(1)" },
    );
    gsap.fromTo(
      imgs,
      { filter: "brightness(1.1) saturate(1.3)" },
      {
        filter: "brightness(1.45) saturate(2.2) hue-rotate(-15deg)",
        duration: 0.16,
        repeat: 4,
        yoyo: true,
        ease: "steps(1)",
      },
    );
    bars.forEach((bar, i) => {
      gsap.fromTo(
        bar,
        { opacity: 0, scaleY: 0.2, xPercent: i % 2 ? 12 : -10 },
        {
          opacity: 0.5,
          scaleY: 1,
          xPercent: i % 2 ? -8 : 6,
          duration: 0.09 + i * 0.02,
          repeat: 7,
          yoyo: true,
          ease: "steps(1)",
          delay: i * 0.03,
        },
      );
    });
  }
}
