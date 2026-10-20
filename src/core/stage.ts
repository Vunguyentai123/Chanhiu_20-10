export type StageInfo = {
  el: HTMLElement;
  width: number;
  height: number;
  scale: number;
  dpr: number;
};

type ResizeListener = (info: StageInfo) => void;

const listeners = new Set<ResizeListener>();
let info: StageInfo | null = null;

function measure(): StageInfo {
  const el = document.querySelector<HTMLElement>(".stage");
  if (!el) throw new Error("Missing .stage element");
  const rect = el.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const scale = Math.min(1.28, Math.max(0.76, width / 390));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.style.setProperty("--scale", scale.toFixed(4));
  el.style.setProperty("--stage-w", `${width}px`);
  el.style.setProperty("--stage-h", `${height}px`);
  return { el, width, height, scale, dpr };
}

export function initStage(): StageInfo {
  info = measure();
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const next = measure();
      const changed =
        !info ||
        Math.abs(next.width - info.width) > 0.5 ||
        Math.abs(next.height - info.height) > 0.5 ||
        next.dpr !== info.dpr;
      info = next;
      if (changed) listeners.forEach((fn) => fn(next));
    });
  };
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  if ("ResizeObserver" in window && info.el) {
    const ro = new ResizeObserver(schedule);
    ro.observe(info.el);
  }
  return info;
}

export function getStage(): StageInfo {
  if (!info) return initStage();
  return info;
}

export function onStageResize(fn: ResizeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
