import { config } from "../config";
import { assetUrl } from "../core/assets";
import gsap from "gsap";

type EnvelopeOptions = {
  onClose: () => void;
  onOpenLetter: () => void;
  onCaption: (text: string) => void;
};

const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.6-4.9-9.5-9.1C1 8.5 3.1 5 6.7 5c2 0 3.6 1.1 4.5 2.7l.8 1.4.8-1.4C13.7 6.1 15.3 5 17.3 5 20.9 5 23 8.5 21.5 11.9 19.6 16.1 12 21 12 21Z" fill="currentColor"/></svg>`;
const CLOSE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>`;

export class EnvelopeScene {
  readonly el: HTMLElement;
  private readonly envelope: HTMLElement;
  private readonly flap: HTMLElement;
  private readonly seal: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly letter: HTMLElement;
  private readonly letterBody: HTMLElement;
  private readonly letterPaper: HTMLElement;
  private readonly options: EnvelopeOptions;
  private opened = false;
  private letterShown = false;
  private timeline: gsap.core.Timeline | null = null;
  private lineTimers: number[] = [];

  constructor(options: EnvelopeOptions) {
    this.options = options;
    this.el = document.createElement("section");
    this.el.className = "envelope-scene";
    this.el.setAttribute("aria-label", "Phong bì và lá thư");
    this.el.innerHTML = `
      <button class="close-btn" type="button" aria-label="Đóng và quay lại">${CLOSE_SVG}</button>
      <div class="env-wrap">
        <div class="envelope" role="button" tabindex="0" aria-label="${escapeHtml(config.hints.envelope)}">
          <div class="env-back"></div>
          <div class="env-front"></div>
          <img class="env-floral env-floral--left" src="${assetUrl("/assets/corner-left.png")}" alt="" aria-hidden="true" />
          <img class="env-floral env-floral--right" src="${assetUrl("/assets/corner-right.png")}" alt="" aria-hidden="true" />
          <div class="env-text">
            <p class="to">${escapeHtml(config.envelope.to)}</p>
            <div class="env-rule"><i></i>${HEART_SVG}<i></i></div>
            <p class="date">${escapeHtml(config.envelope.date)}</p>
            <p class="sub">${escapeHtml(config.envelope.sub)}</p>
          </div>
          <div class="env-flap">
            <div class="env-flap__face"></div>
          </div>
          <div class="seal" role="button" tabindex="0" aria-label="Dấu sáp: ${escapeHtml(config.sealText)}">
            <span class="seal__text">${escapeHtml(config.sealText)}</span>
          </div>
          <div class="seal-fragments" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
        <p class="env-hint">${escapeHtml(config.hints.envelope)}</p>
      </div>
      <article class="letter" aria-label="Lá thư chúc mừng">
        <div class="letter-paper">
          <img class="letter-top" src="${assetUrl("/assets/corner-right.png")}" alt="" aria-hidden="true" />
          <h2 class="letter-title">${escapeHtml(config.letter.title)}</h2>
          <div class="letter-body"></div>
          <img class="letter-flowers" src="${assetUrl("/assets/corner-left.png")}" alt="" aria-hidden="true" />
          <div class="letter-portrait">
            <img src="${assetUrl(config.portraitCutout)}" alt="Chân dung người nhận" />
          </div>
        </div>
      </article>
    `;
    this.envelope = this.el.querySelector<HTMLElement>(".envelope")!;
    this.flap = this.el.querySelector<HTMLElement>(".env-flap")!;
    this.seal = this.el.querySelector<HTMLElement>(".seal")!;
    this.wrap = this.el.querySelector<HTMLElement>(".env-wrap")!;
    this.hint = this.el.querySelector<HTMLElement>(".env-hint")!;
    this.letter = this.el.querySelector<HTMLElement>(".letter")!;
    this.letterBody = this.el.querySelector<HTMLElement>(".letter-body")!;
    this.letterPaper = this.el.querySelector<HTMLElement>(".letter-paper")!;

    this.envelope.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".seal")) return;
      this.open();
    });
    this.envelope.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.open();
      }
    });
    this.seal.addEventListener("click", (e) => {
      e.stopPropagation();
      this.open();
    });
    this.seal.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.open();
      }
    });
    this.el.querySelector<HTMLElement>(".close-btn")!.addEventListener("click", () => this.close());
    document.addEventListener("keydown", this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.isVisible) this.close();
  };

  get isVisible() {
    return this.el.classList.contains("is-visible");
  }

  get isOpened() {
    return this.opened;
  }

  show() {
    this.el.classList.add("is-visible");
    this.el.classList.remove("is-leaving");
    if (!this.opened) {
      gsap.fromTo(
        this.wrap,
        { y: 26, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 1.1, ease: "power3.out", delay: 0.15 },
      );
      this.options.onCaption(config.captions[1]?.text ?? config.captions[0]?.text ?? "");
    }
  }

  hide() {
    this.el.classList.remove("is-visible");
    this.el.classList.add("is-leaving");
  }

  private open() {
    if (this.opened) {
      if (!this.letterShown) this.revealLetter();
      return;
    }
    this.opened = true;
    this.hint.style.opacity = "0";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // seal crack
    this.seal.classList.add("is-cracked");
    const frags = this.el.querySelectorAll<HTMLElement>(".seal-fragments span");
    frags.forEach((f, i) => {
      const angle = (i / frags.length) * Math.PI * 2 + 0.4;
      gsap.set(f, { x: 0, y: 0, rotate: 0, opacity: 1 });
      gsap.to(f, {
        x: Math.cos(angle) * (36 + Math.random() * 30),
        y: Math.sin(angle) * (28 + Math.random() * 26) - 14,
        rotate: (Math.random() - 0.5) * 160,
        opacity: 0,
        duration: 0.8,
        delay: 0.08 + i * 0.02,
        ease: "power2.out",
      });
    });

    this.timeline?.kill();
    const envText = this.el.querySelector<HTMLElement>(".env-text");
    if (envText) gsap.set(envText, { opacity: 1 });
    this.timeline = gsap.timeline();
    if (!reduced) {
      this.timeline.to(envText, { opacity: 0, duration: 0.32, ease: "power2.out" }, 0.2);
      this.timeline.to(this.flap, {
        rotateX: -168,
        duration: 1.05,
        ease: "power3.inOut",
        delay: 0.28,
      });
    } else {
      this.timeline.set(envText, { opacity: 0 }, 0.2);
      this.timeline.set(this.flap, { rotateX: -168 }, 0.2);
    }
    this.timeline.to(
      this.wrap,
      { y: "82%", scale: 0.98, duration: 1.1, ease: "power2.inOut" },
      0.62,
    );
    this.timeline.call(() => this.revealLetter(), undefined, 1.15);
  }

  private revealLetter() {
    if (this.letterShown) return;
    this.letterShown = true;
    this.letter.classList.add("is-visible");
    this.el.classList.add("is-letter-open");
    this.el.closest(".stage")?.classList.add("letter-open");
    this.el.querySelector<HTMLElement>(".env-wrap")!.classList.add("is-open");
    gsap.fromTo(
      this.letter,
      { y: 48, opacity: 0, scale: 0.94 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 1.2,
        ease: "power3.out",
        onComplete: () => {
          this.letterPaper.scrollTop = 0;
        },
      },
    );
    this.renderLetterLines();
    this.options.onOpenLetter();
    this.options.onCaption(config.captions[config.captions.length - 1]?.text ?? "");
  }

  private renderLetterLines() {
    this.letterBody.innerHTML = "";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let delay = 0.65;
    config.letter.body.forEach((paragraph, pIndex) => {
      const p = document.createElement("p");
      // tách theo câu để hiện dần từng dòng
      const sentences = paragraph.match(/[^.!?]+[.!?]?/g) ?? [paragraph];
      sentences.forEach((sentence) => {
        const span = document.createElement("span");
        span.className = "letter-line";
        span.textContent = sentence.trim() + (sentence.trim().endsWith(".") ? " " : " ");
        p.appendChild(span);
        const timer = window.setTimeout(
          () => span.classList.add("is-in"),
          reduced ? 0 : delay * 1000,
        );
        this.lineTimers.push(timer);
        delay += 0.45;
      });
      this.letterBody.appendChild(p);
      if (pIndex === 0) delay += 0.1;
    });
  }

  close() {
    this.timeline?.kill();
    this.lineTimers.forEach((t) => clearTimeout(t));
    this.lineTimers = [];
    this.hide();
    this.options.onClose();
  }

  reset() {
    this.opened = false;
    this.letterShown = false;
    this.seal.classList.remove("is-cracked");
    this.letter.classList.remove("is-visible");
    this.wrap.classList.remove("is-open");
    this.el.classList.remove("is-letter-open");
    this.el.closest(".stage")?.classList.remove("letter-open");
    this.hint.style.opacity = "";
    this.flap.style.transform = "";
    this.letterBody.innerHTML = "";
    gsap.killTweensOf([this.wrap, this.letter, this.flap]);
    gsap.set(this.wrap, { clearProps: "all" });
    gsap.set(this.letter, { clearProps: "all" });
    gsap.set(this.flap, { clearProps: "all" });
    this.el.querySelectorAll<HTMLElement>(".seal-fragments span").forEach((f) =>
      gsap.set(f, { clearProps: "all" }),
    );
    const envText = this.el.querySelector<HTMLElement>(".env-text");
    if (envText) gsap.set(envText, { clearProps: "opacity" });
  }

  dispose() {
    this.timeline?.kill();
    this.lineTimers.forEach((t) => clearTimeout(t));
    document.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
