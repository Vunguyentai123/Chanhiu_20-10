import * as THREE from "three";
import gsap from "gsap";
import { config } from "./config";
import { audio } from "./core/audio";
import { assetUrl } from "./core/assets";
import { getStage, initStage, onStageResize, prefersReducedMotion } from "./core/stage";
import { BouquetScene } from "./scenes/bouquet";
import { NeonScene } from "./scenes/neon";
import { EnvelopeScene } from "./scenes/envelope";
import { UI } from "./ui/ui";
import "./styles.css";
import "./fonts.css";

type SceneName = "bouquet" | "neon" | "envelope";

class App {
  private readonly ui: UI;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly scene = new THREE.Scene();
  private readonly clock = new THREE.Clock();
  private bouquet!: BouquetScene;
  private neon: NeonScene | null = null;
  private envelope: EnvelopeScene | null = null;
  private neonReady: Promise<NeonScene> | null = null;
  private envelopeReady: Promise<EnvelopeScene> | null = null;
  private backgroundPrepScheduled = false;
  private sceneName: SceneName = "bouquet";
  private transitioning = false;
  private autoOpenTimer = 0;
  private neonElapsed = 0;
  private press: { x: number; y: number; t: number; active: boolean; moved: boolean } = {
    x: 0,
    y: 0,
    t: 0,
    active: false,
    moved: false,
  };
  private lastDrag = { x: 0, y: 0 };
  private dragging = false;
  private captionIndex = -1;
  private readonly reduced = prefersReducedMotion();
  // Giới hạn DPR thấp hơn trên thiết bị cảm ứng để giữ 60fps.
  private readonly dprCap = window.matchMedia("(pointer: coarse)").matches
    ? Math.min(1.5, config.performance.maxPixelRatio)
    : config.performance.maxPixelRatio;
  private onResize: () => void;
  private destroyed = false;

  constructor() {
    this.ui = new UI();
    const stage = initStage();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(stage.width, stage.height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.ui.stage.insertBefore(this.renderer.domElement, this.ui.stage.querySelector(".vignette"));

    this.camera = new THREE.PerspectiveCamera(48, stage.width / stage.height, 0.1, 120);
    this.camera.position.set(0, 0, 6);

    this.onResize = () => this.resize();
    onStageResize(this.onResize);

    this.buildScenes();
    this.bindInput();
    this.bindHud();

    audio.init(assetUrl(config.music));
    audio.subscribe(({ muted }) => this.ui.setSoundMuted(muted));
    this.ui.setSoundMuted(audio.isMuted);
    this.ui.setHeartVisible(false);
    if (import.meta.env.DEV) {
      const debugWindow = window as unknown as { __app: App; __config: typeof config };
      debugWindow.__app = this;
      debugWindow.__config = config;
    }

    void this.boot();
  }

  private buildScenes() {
    this.bouquet = new BouquetScene(this.camera, this.renderer, {
      onProgress: (filled) => {
        if (filled >= 6) {
          this.ui.setHint(config.hints.bouquet2, true, "bouquet");
        }
      },
      onTap: (point) => {
        this.ui.ripple(point.x, point.y);
      },
      onHold: () => void this.goToNeon(),
      onHoldStart: () => {
        this.ui.fadeCopy(false);
      },
      onHoldCancel: () => {
        this.ui.fadeCopy(true);
        this.ui.setHint(config.hints.bouquet2, true, "bouquet");
      },
      onFilled: () => {
        this.ui.setHint(config.hints.bouquet2, true, "bouquet");
        this.ui.pulseHeart();
      },
      onCaption: (index) => {
        const caption = config.captions[index] ?? config.captions[config.captions.length - 1];
        if (caption) {
          this.ui.setCaption(caption.text);
          this.ui.setCaptionVisible(true);
        }
      },
    });
    this.scene.add(this.bouquet.group);
  }

  /** Dựng neon đúng một lần, sau khi cảnh bó hoa đã hiện. */
  private buildNeonScene() {
    return new NeonScene(this.camera, this.renderer, {
      onOpenCard: (src) => {
        audio.duck();
        this.ui.openLightbox(src, () => audio.unduck());
      },
      onCaption: (index) => {
        if (this.captionIndex === index) return;
        this.captionIndex = index;
        const caption = config.captions[index];
        if (caption) this.ui.setCaption(caption.text);
      },
    });
  }

  private ensureNeon(): Promise<NeonScene> {
    if (this.neon) return Promise.resolve(this.neon);
    if (!this.neonReady) {
      this.neonReady = (async () => {
        // Chỉ chờ đúng font dùng để vẽ chữ neon, không chờ toàn bộ font của thiệp.
        await loadNeonFont();
        const neon = this.buildNeonScene();
        neon.group.visible = false;
        this.scene.add(neon.group);
        this.neon = neon;
        return neon;
      })();
    }
    return this.neonReady;
  }

  private ensureEnvelope(): Promise<EnvelopeScene> {
    if (this.envelope) return Promise.resolve(this.envelope);
    if (!this.envelopeReady) {
      this.envelopeReady = Promise.resolve().then(() => {
        const envelope = new EnvelopeScene({
          onClose: () => this.closeEnvelope(),
          onOpenLetter: () => {
            audio.duck(0.18, 1.2);
          },
          onCaption: (text) => {
            this.ui.setCaption(text);
            this.ui.setCaptionVariant("envelope");
            this.ui.setCaptionVisible(true);
          },
        });
        this.ui.stage.appendChild(envelope.el);
        this.envelope = envelope;
        return envelope;
      });
    }
    return this.envelopeReady;
  }

  private async boot() {
    this.ui.setHint(config.hints.bouquet1, true, "bouquet");
    this.ui.setCaption("", false);
    this.ui.setCaptionVisible(false);
    this.ui.setCaptionVariant("bouquet");

    // Chỉ chờ đúng tài nguyên của cảnh đầu. Neon, phong bì, font trang trí
    // và nhạc được chuẩn bị sau khi màn hình chờ đã tắt.
    await this.bouquet.preload();

    this.ui.setLoaderVisible(false);
    this.bouquet.start();
    this.animate();

    this.scheduleBackgroundPrep();
    window.setTimeout(() => audio.warm(), 1500);
  }

  private scheduleBackgroundPrep() {
    if (this.backgroundPrepScheduled) return;
    this.backgroundPrepScheduled = true;
    const run = () => {
      void this.ensureNeon();
      void this.ensureEnvelope();
    };
    const idle = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    // Ưu tiên khung hình đầu của bó hoa, rồi mới dựng cảnh sau trong lúc rảnh.
    window.setTimeout(() => {
      if (idle) idle(run, { timeout: 1600 });
      else run();
    }, 500);
  }

  private bindHud() {
    const unlockAudio = (event: Event) => {
      // Để nút loa tự xử lý: chạm lần đầu vào nút sẽ bật nhạc,
      // không bị handler toàn cục bật rồi click lại tắt ngay.
      if ((event.target as HTMLElement | null)?.closest(".hud, button")) return;
      if (!audio.hasStarted && !audio.isMuted) void audio.start();
    };

    this.ui.soundBtn.addEventListener("click", () => {
      if (!audio.hasStarted && !audio.isMuted) {
        void audio.start();
      } else {
        audio.toggle();
      }
    });
    this.ui.heartBtn.addEventListener("click", () => {
      if (this.sceneName === "neon") void this.goToEnvelope();
    });

    // Mobile cần một cử chỉ thật để mở khóa audio. Đăng ký cả pointer,
    // touch và click vì từng loại máy/trình duyệt phát sinh sự kiện khác nhau.
    window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
    window.addEventListener("click", unlockAudio, { once: true });
  }

  private bindInput() {
    const stage = this.ui.stage;
    stage.addEventListener("pointerdown", this.handlePointerDown);
    stage.addEventListener("pointermove", this.handlePointerMove);
    stage.addEventListener("pointerup", this.handlePointerUp);
    stage.addEventListener("pointercancel", this.handlePointerCancel);
    stage.addEventListener("pointerleave", this.handlePointerCancel);
    stage.addEventListener("contextmenu", (e) => e.preventDefault());
    stage.addEventListener(
      "touchmove",
      (e) => {
        if (this.sceneName === "neon" && !this.ui.lightboxOpen) e.preventDefault();
      },
      { passive: false },
    );

    // Chặn bôi đen/kéo ảnh khi nhấn giữ trên mobile.
    document.addEventListener("selectstart", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("dragstart", (e) => e.preventDefault());
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (this.transitioning) return;
    if ((e.target as HTMLElement).closest(".hud, .envelope-scene, .lightbox, button")) return;
    if (!audio.hasStarted && !audio.isMuted) void audio.start();
    const rect = this.ui.stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.press = { x, y, t: performance.now(), active: true, moved: false };
    this.lastDrag = { x, y };
    if (this.sceneName === "bouquet") {
      this.bouquet.startHold();
    } else if (this.sceneName === "neon") {
      this.dragging = true;
      this.neon?.beginDrag();
      stageSetPointerCapture(this.ui.stage, e.pointerId);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    const rect = this.ui.stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const nx = (x / rect.width) * 2 - 1;
    const ny = -((y / rect.height) * 2 - 1);
    this.bouquet.setParallax(nx, ny);
    this.neon?.setParallax(nx, ny);

    if (!this.press.active) return;
    const dx = x - this.lastDrag.x;
    const dy = y - this.lastDrag.y;
    if (Math.hypot(x - this.press.x, y - this.press.y) > 18) {
      this.press.moved = true;
      if (this.sceneName === "bouquet") this.bouquet.endHold();
    }
    this.lastDrag = { x, y };
    if (this.sceneName === "neon" && this.dragging) {
      this.neon?.dragBy(dx, dy);
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.press.active) return;
    this.press.active = false;
    if (this.dragging) {
      this.dragging = false;
      this.neon?.endDrag();
      stageReleasePointerCapture(this.ui.stage, e.pointerId);
    }
    if (this.sceneName === "bouquet") this.bouquet.endHold();
    if (this.press.moved || this.transitioning) return;
    const elapsed = performance.now() - this.press.t;
    if (elapsed > 650) return;

    const rect = this.ui.stage.getBoundingClientRect();
    const x = this.press.x;
    const y = this.press.y;
    const ndcX = (x / rect.width) * 2 - 1;
    const ndcY = -((y / rect.height) * 2 - 1);

    if (this.ui.lightboxOpen) return;

    if (this.sceneName === "bouquet") {
      if (this.bouquet.canHold) {
        // tap khi đã đủ ảnh: chỉ ripple nhẹ
        this.ui.ripple(x, y);
      } else {
        this.bouquet.tap(x, y);
      }
    } else if (this.sceneName === "neon") {
      if (!this.neon?.tap(ndcX, ndcY)) {
        this.ui.ripple(x, y);
      }
    }
  };

  private handlePointerCancel = (e: PointerEvent) => {
    this.press.active = false;
    this.bouquet.endHold();
    if (this.dragging) {
      this.dragging = false;
      this.neon?.endDrag();
      stageReleasePointerCapture(this.ui.stage, e.pointerId);
    }
  };

  private resize() {
    const stage = getStage();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(stage.width, stage.height, false);
    this.camera.aspect = stage.width / stage.height;
    this.camera.updateProjectionMatrix();
  }

  private async goToNeon() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.ui.setHint("", false);
    this.ui.setCaptionVisible(false);
    this.ui.fadeCopy(false);
    audio.duck(0.32, 0.7);

    try {
      // Thường đã dựng xong trong lúc người xem chạm 6 bức ảnh.
      await this.ensureNeon();
    } catch (error) {
      console.warn("[neon] Không dựng được cảnh neon:", error);
      this.transitioning = false;
      return;
    }

    if (this.reduced) {
      await this.bouquet.exit();
      this.enterNeon(0.5);
      this.showNeonCopy();
      this.transitioning = false;
      this.armAutoEnvelope();
      return;
    }

    // Bó hoa tan dần; màn flash chỉ vừa đủ che lúc đổi cảnh.
    await Promise.all([this.bouquet.exit(), this.ui.veilIn(1.15)]);
    this.enterNeon(2.1, true);
    void this.ui.veilOut(0.85);
    audio.unduck(2.6);

    await wait(620);
    if (this.sceneName !== "neon") return;
    this.showNeonCopy();
    this.ui.pulseHeart();
    this.transitioning = false;
    this.armAutoEnvelope();
  }

  private enterNeon(revealDuration: number, settleCamera = false) {
    const neon = this.neon;
    if (!neon) return;
    gsap.killTweensOf(this.camera.position);
    this.sceneName = "neon";
    // NeonScene tự đặt camera orbit quanh cụm không gian.
    neon.start(revealDuration, settleCamera);
    neon.setVisible(true);
    this.neonElapsed = 0;
    this.captionIndex = -1;
    this.ui.setCaptionVariant("neon");
    this.ui.setHeartVisible(true);
  }

  private showNeonCopy() {
    this.ui.setHint(config.hints.neon, true, "neon");
    this.ui.setCaptionVisible(true);
    this.ui.fadeCopy(true);
  }

  private armAutoEnvelope() {
    window.clearTimeout(this.autoOpenTimer);
    if (!config.autoOpenEnvelopeAfterMs) return;
    this.autoOpenTimer = window.setTimeout(() => {
      if (this.sceneName !== "neon") return;
      if (this.ui.lightboxOpen) {
        this.armAutoEnvelope();
        return;
      }
      void this.goToEnvelope();
    }, config.autoOpenEnvelopeAfterMs);
  }

  private async goToEnvelope() {
    if (this.transitioning || this.sceneName === "envelope") return;
    this.transitioning = true;
    window.clearTimeout(this.autoOpenTimer);
    this.ui.setHint("", false);
    this.ui.fadeCopy(true);
    this.ui.setCaptionVariant("envelope");
    this.ui.setCaptionVisible(true);
    let envelope: EnvelopeScene;
    try {
      envelope = await this.ensureEnvelope();
    } catch (error) {
      console.warn("[envelope] Không dựng được phong bì:", error);
      this.transitioning = false;
      return;
    }
    if (this.destroyed) return;
    envelope.show();
    this.sceneName = "envelope";
    this.ui.setHeartVisible(false);
    this.ui.setHudVisible(false);
    this.transitioning = false;
  }

  private closeEnvelope() {
    this.envelope?.hide();
    this.ui.setHudVisible(true);
    if (config.closeLetterTo === "bouquet") {
      this.neon?.setVisible(false);
      this.bouquet.reset();
      this.bouquet.start();
      this.sceneName = "bouquet";
      this.ui.setHint(config.hints.bouquet2, true, "bouquet");
      this.ui.setCaptionVariant("bouquet");
      this.ui.fadeCopy(true);
      this.ui.setCaptionVisible(false);
      this.ui.setHeartVisible(false);
    } else {
      this.enterNeon(1.3, false);
      this.showNeonCopy();
    }
    window.setTimeout(() => this.envelope?.reset(), 900);
    audio.unduck(1.6);
  }

  private animate = () => {
    if (this.destroyed) return;
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.sceneName === "bouquet") {
      this.bouquet.update(dt);
    } else if (this.sceneName === "neon") {
      this.neonElapsed += dt;
      this.neon?.update(dt);
    } else {
      this.neon?.starfield.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.destroyed = true;
    window.clearTimeout(this.autoOpenTimer);
    this.bouquet.dispose();
    this.neon?.dispose();
    this.envelope?.dispose();
    this.renderer.dispose();
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Canvas không tự kích hoạt @font-face như DOM, nên phải tải đúng font
 * Quicksand 700 (kèm dấu tiếng Việt) trước khi vẽ texture neon.
 */
async function loadNeonFont() {
  if (!document.fonts?.load) return;
  const sample = config.neonPhrases.join(" ") || "Chúc mừng ngày 20/10";
  try {
    await Promise.race([document.fonts.load('700 104px "Quicksand"', sample), wait(3000)]);
  } catch {
    /* fallback font vẫn dùng được */
  }
}

function stageSetPointerCapture(el: HTMLElement, id: number) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* ignore */
  }
}

function stageReleasePointerCapture(el: HTMLElement, id: number) {
  try {
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  } catch {
    /* ignore */
  }
}

const reduced = prefersReducedMotion();
if (reduced) document.documentElement.classList.add("reduced-motion");

new App();

export { gsap };
