import * as THREE from "three";
import gsap from "gsap";
import { config } from "../config";
import { getStage, onStageResize, prefersReducedMotion, clamp, damp } from "../core/stage";
import { assetUrl } from "../core/assets";
import { Starfield, getHeartTexture } from "../core/starfield";

type NeonOptions = {
  onOpenCard: (src: string) => void;
  onCaption: (index: number) => void;
};

type TextSprite = {
  sprite: THREE.Sprite;
  baseZ: number;
  speed: number;
  drift: number;
  phase: number;
  baseOpacity: number;
};

type CardMesh = {
  mesh: THREE.Mesh;
  baseZ: number;
  speed: number;
  phase: number;
  photo: string;
  baseRot: number;
  baseOpacity: number;
};

const TUNNEL_DEPTH = 46;
const TUNNEL_NEAR = 6.2;
const CAMERA_Z = 8;

export class NeonScene {
  readonly group = new THREE.Group();
  readonly starfield: Starfield;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly options: NeonOptions;
  private readonly reduced: boolean;
  private readonly textSprites: TextSprite[] = [];
  private readonly cards: CardMesh[] = [];
  private readonly cardMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly textures: THREE.Texture[] = [];
  private hearts!: THREE.Points;
  private heartBase!: Float32Array;
  private heartSpeed!: Float32Array;
  private heartPhase!: Float32Array;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tilt = new THREE.Group();
  private readonly drag = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 };
  private time = 0;
  private started = false;
  private unsubResize: () => void;
  private captionIndex = -1;
  private captionElapsed = 0;
  private heroCard: CardMesh | null = null;
  private heroTimer = 3.5;
  private baseSpread = new THREE.Vector2(16, 22);
  private readonly revealState = { value: 0 };
  private revealTween: gsap.core.Tween | null = null;

  constructor(camera: THREE.PerspectiveCamera, _renderer: THREE.WebGLRenderer, options: NeonOptions) {
    this.camera = camera;
    this.options = options;
    this.reduced = prefersReducedMotion();
    this.group.visible = false;

    this.starfield = new Starfield(this.reduced ? 240 : 400, this.reduced ? 14 : 26, 34, 30);
    this.starfield.group.position.z = -6;
    this.group.add(this.starfield.group);

    this.tilt.rotation.z = THREE.MathUtils.degToRad(-9.5);
    this.group.add(this.tilt);

    this.buildText();
    this.buildCards();
    this.buildHearts();

    this.unsubResize = onStageResize(() => this.layout());
    this.layout();
  }

  private buildText() {
    const max = this.reduced ? 48 : config.performance.maxNeonPhrases;
    const phrases = config.neonPhrases.length ? config.neonPhrases : ["20/10"];
    const buckets = [0.13, 0.19, 0.3, 0.5];
    const textures = new Map<string, THREE.Texture>();
    const getTex = (phrase: string, bucket: number) => {
      const key = `${phrase}__${bucket}`;
      let tex = textures.get(key);
      if (!tex) {
        tex = makeNeonTexture(phrase, bucket);
        textures.set(key, tex);
        this.textures.push(tex);
      }
      return tex;
    };

    for (let i = 0; i < max; i++) {
      const phrase = phrases[i % phrases.length];
      // Vài cụm lớn nằm gần camera, phần còn lại rải suốt đường hầm.
      const near = i < 9;
      const bucket = near
        ? buckets[i < 4 ? 3 : 2]
        : buckets[Math.floor(Math.random() * buckets.length)];
      const tex = getTex(phrase, bucket);
      const baseOpacity = near ? 0.82 + Math.random() * 0.12 : 0.46 + Math.random() * 0.26;
      const material = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: baseOpacity,
        fog: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      const z = near
        ? -2.5 - Math.random() * 8
        : TUNNEL_NEAR - 7 - Math.random() * (TUNNEL_DEPTH - 7);
      const spread = this.spreadAt(z);
      const x = (Math.random() - 0.5) * spread.x * 0.96;
      const y = (Math.random() - 0.5) * spread.y * 0.9;
      sprite.position.set(x, y, z);
      const aspect = tex.userData.aspect as number;
      const baseH = bucket;
      sprite.scale.set(baseH * aspect, baseH, 1);
      sprite.material.rotation = (Math.random() - 0.5) * 0.1;
      sprite.renderOrder = 2;
      this.tilt.add(sprite);
      this.textSprites.push({
        sprite,
        baseZ: z,
        speed: near ? 0.42 : 0.9 + Math.random() * 2.1,
        drift: (Math.random() - 0.5) * 0.22,
        phase: Math.random() * Math.PI * 2,
        baseOpacity,
      });
    }
  }

  private buildCards() {
    const count = this.reduced ? 6 : config.performance.maxPhotoCards;
    const photos = (config.photos.length ? config.photos : ["/photos/1.jpg"]).map(assetUrl);
    for (let i = 0; i < count; i++) {
      const photo = photos[i % photos.length];
      const tex = makeCardTexture(photo);
      this.textures.push(tex);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.82,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      });
      const aspect = tex.userData.aspect as number;
      const baseH = i === 0 ? 2.15 : 0.95 + Math.random() * 1.15;
      const geo = new THREE.PlaneGeometry(baseH * aspect, baseH);
      const mesh = new THREE.Mesh(geo, mat);
      const z =
        i === 0
          ? -1.2
          : TUNNEL_NEAR - 8 - ((i - 1) / Math.max(1, count - 1)) * (TUNNEL_DEPTH - 9) -
            Math.random() * 2.2;
      const spread = this.spreadAt(z);
      if (i === 0) {
        mesh.position.set(-spread.x * 0.09, -spread.y * 0.13, z);
      } else {
        mesh.position.set(
          (Math.random() - 0.5) * spread.x * 0.9,
          (Math.random() - 0.5) * spread.y * 0.82,
          z,
        );
      }
      const baseRot = (Math.random() - 0.5) * 0.18;
      mesh.rotation.z = baseRot;
      mesh.renderOrder = 3;
      this.tilt.add(mesh);
      this.cardMaterials.push(mat);
      this.cards.push({
        mesh,
        baseZ: z,
        speed: i === 0 ? 0.12 : 0.7 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
        photo,
        baseRot,
        baseOpacity: i === 0 ? 1 : 0.78 + Math.random() * 0.16,
      });
    }
  }

  private buildHearts() {
    const count = this.reduced ? 30 : config.performance.maxHearts;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const base = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = -Math.random() * TUNNEL_DEPTH;
      const spread = this.spreadAt(z);
      const x = (Math.random() - 0.5) * spread.x * 0.92;
      const y = (Math.random() - 0.5) * spread.y * 0.86;
      positions.set([x, y, z], i * 3);
      base.set([x, y, z], i * 3);
      sizes[i] = 0.16 + Math.random() * 0.4;
      speed[i] = 0.4 + Math.random() * 1.1;
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      size: 0.38,
      map: getHeartTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xff2e3a,
      opacity: 0.86,
      sizeAttenuation: true,
      fog: false,
    });
    this.hearts = new THREE.Points(geo, mat);
    this.hearts.frustumCulled = false;
    this.heartBase = base;
    this.heartSpeed = speed;
    this.heartPhase = phase;
    this.tilt.add(this.hearts);
  }

  private spreadAt(z: number) {
    const dist = CAMERA_Z - z;
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
    const stage = getStage();
    return new THREE.Vector2(vh * (stage.width / stage.height), vh);
  }

  private layout() {
    const stage = getStage();
    this.camera.aspect = stage.width / stage.height;
    this.camera.updateProjectionMatrix();
    const s = this.spreadAt(-30);
    this.baseSpread.set(s.x, s.y);
  }

  async preload() {
    await Promise.allSettled(
      config.photos.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = assetUrl(src);
          }),
      ),
    );
  }

  start(revealDuration = 1.9) {
    this.started = true;
    this.group.visible = true;
    this.heroTimer = 3.2;
    this.captionIndex = -1;
    this.captionElapsed = 0;

    // Fade the whole tunnel in instead of popping it on screen.
    this.revealTween?.kill();
    this.revealState.value = 0;
    this.applyReveal(0);
    this.revealTween = gsap.to(this.revealState, {
      value: 1,
      duration: revealDuration,
      ease: "power2.out",
    });
    gsap.fromTo(
      this.tilt.rotation,
      { z: THREE.MathUtils.degToRad(-11.8) },
      {
        z: THREE.MathUtils.degToRad(-9.5),
        duration: revealDuration + 0.5,
        ease: "power3.out",
      },
    );
  }

  private applyReveal(value: number) {
    const r = clamp(value, 0, 1);
    this.starfield.setIntensity(r);
    for (const s of this.textSprites) {
      (s.sprite.material as THREE.SpriteMaterial).opacity = s.baseOpacity * r;
    }
    for (const c of this.cards) {
      (c.mesh.material as THREE.MeshBasicMaterial).opacity = c.baseOpacity * r;
    }
    (this.hearts.material as THREE.PointsMaterial).opacity = 0.86 * r;
  }

  stop() {
    this.started = false;
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  setParallax(x: number, y: number) {
    this.starfield.setParallax(x * 0.6, y * 0.6);
  }

  beginDrag() {
    this.drag.vx = 0;
    this.drag.vy = 0;
  }

  dragBy(dx: number, dy: number) {
    const k = 0.0018;
    this.drag.tx = clamp(this.drag.tx + dx * k, -0.24, 0.24);
    this.drag.ty = clamp(this.drag.ty + dy * k, -0.16, 0.16);
    this.drag.vx = dx * 0.0009;
    this.drag.vy = dy * 0.0009;
  }

  endDrag() {
    // inertia: nudge targets in the direction of the fling
    this.drag.tx = clamp(this.drag.tx + this.drag.vx * 12, -0.28, 0.28);
    this.drag.ty = clamp(this.drag.ty + this.drag.vy * 10, -0.18, 0.18);
  }

  /** trả về true nếu tap trúng thẻ ảnh */
  tap(ndcX: number, ndcY: number): boolean {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const heroMesh = this.heroCard?.mesh.visible ? this.heroCard.mesh : null;
    const meshes = this.cards.map((c) => c.mesh).filter((m) => m.visible);
    if (heroMesh) meshes.push(heroMesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return false;
    const hit = hits[0].object as THREE.Mesh;
    if (heroMesh && hit === heroMesh && this.heroCard) {
      this.options.onOpenCard(this.heroCard.photo);
      return true;
    }
    const card = this.cards.find((c) => c.mesh === hit);
    if (!card) return false;
    this.options.onOpenCard(card.photo);
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.starfield.setIntensity(this.group.visible ? this.revealState.value : 0);
    this.starfield.update(dt);
    if (!this.group.visible) return;

    const reveal = this.revealState.value;
    this.drag.x = damp(this.drag.x, this.drag.tx, 4.2, dt);
    this.drag.y = damp(this.drag.y, this.drag.ty, 4.2, dt);
    this.tilt.rotation.y = this.drag.x;
    this.tilt.rotation.x = this.drag.y;
    this.tilt.position.x = -this.drag.x * 2.2;
    this.tilt.position.y = this.drag.y * 1.8;

    const t = this.time;
    const zNear = TUNNEL_NEAR;
    const zFar = -TUNNEL_DEPTH;

    for (const s of this.textSprites) {
      s.sprite.position.z += s.speed * dt;
      if (s.sprite.position.z > 4.2) {
        s.sprite.position.z = zFar;
        const spread = this.spreadAt(zFar);
        s.sprite.position.x = (Math.random() - 0.5) * spread.x * 0.96;
        s.sprite.position.y = (Math.random() - 0.5) * spread.y * 0.9;
      }
      s.sprite.position.x += Math.sin(t * 0.18 + s.phase) * s.drift * dt;
      s.sprite.position.y += Math.cos(t * 0.22 + s.phase) * 0.035 * dt;
      const depthFade = clamp(1 - (CAMERA_Z - s.sprite.position.z - 26) / 34, 0.16, 1);
      const passFade = clamp((4.2 - s.sprite.position.z) / 1.2, 0.15, 1);
      (s.sprite.material as THREE.SpriteMaterial).opacity =
        s.baseOpacity * depthFade * passFade * reveal;
    }

    for (const c of this.cards) {
      c.mesh.position.z += c.speed * dt;
      if (c.mesh.position.z > 2.8) {
        c.mesh.position.z = zFar;
        const spread = this.spreadAt(zFar);
        c.mesh.position.x = (Math.random() - 0.5) * spread.x * 0.9;
        c.mesh.position.y = (Math.random() - 0.5) * spread.y * 0.82;
        c.mesh.rotation.z = (Math.random() - 0.5) * 0.18;
      }
      // thẻ gần camera phóng to dần, tạo cảm giác bay sát qua
      const dist = zNear - c.mesh.position.z;
      const nearBoost = clamp(1 + (6 - dist) * 0.016, 1, 1.1);
      c.mesh.scale.setScalar(nearBoost);
      c.mesh.rotation.z = c.baseRot + Math.sin(t * 0.3 + c.phase) * 0.018;
      const depthFade = clamp(1 - (CAMERA_Z - c.mesh.position.z - 24) / 40, 0.2, 1);
      const passFade = clamp((2.8 - c.mesh.position.z) / 1.4, 0.12, 1);
      (c.mesh.material as THREE.MeshBasicMaterial).opacity =
        c.baseOpacity * depthFade * passFade * reveal;
    }

    // hero card: một thẻ lớn lướt sát camera mỗi ~9 giây
    this.heroTimer -= dt;
    if (this.heroTimer <= 0 && !this.reduced) {
      this.heroTimer = 9 + Math.random() * 5;
      this.spawnHeroCard();
    }
    if (this.heroCard) {
      this.heroCard.mesh.position.z += dt * 4.2;
      this.heroCard.mesh.position.x += dt * 0.45;
      this.heroCard.mesh.rotation.z += dt * 0.03;
      if (this.heroCard.mesh.position.z > CAMERA_Z + 2) {
        this.heroCard.mesh.visible = false;
        this.heroCard = null;
      }
    }

    const pos = this.hearts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.heartSpeed.length; i++) {
      arr[i * 3 + 1] =
        this.heartBase[i * 3 + 1] + Math.sin(t * this.heartSpeed[i] * 0.6 + this.heartPhase[i]) * 0.7;
      arr[i * 3] =
        this.heartBase[i * 3] + Math.cos(t * this.heartSpeed[i] * 0.4 + this.heartPhase[i]) * 0.45;
      arr[i * 3 + 2] =
        ((this.heartBase[i * 3 + 2] + t * this.heartSpeed[i] * 0.55 + TUNNEL_DEPTH) % TUNNEL_DEPTH) -
        TUNNEL_DEPTH +
        zNear;
    }
    pos.needsUpdate = true;
    (this.hearts.material as THREE.PointsMaterial).opacity =
      (0.72 + Math.sin(t * 0.9) * 0.12) * reveal;

    // caption timing — đếm lại từ đầu mỗi khi vào cảnh neon
    this.captionElapsed += dt;
    const elapsed = this.captionElapsed;
    let idx = 0;
    config.captions.forEach((c, i) => {
      if (elapsed >= c.at) idx = i;
    });
    if (idx !== this.captionIndex) {
      this.captionIndex = idx;
      this.options.onCaption(idx);
    }

    // thẻ ảnh mờ dần khi rất gần để không chặn chữ
  }

  private spawnHeroCard() {
    if (!this.cards.length) return;
    const source = this.cards[Math.floor(Math.random() * this.cards.length)];
    const clone = source.mesh.clone();
    clone.material = source.mesh.material;
    clone.visible = true;
    clone.scale.setScalar(1.9);
    clone.position.set(-3.6, -2.1, -10);
    clone.rotation.z = -0.06;
    this.tilt.add(clone);
    this.heroCard = {
      mesh: clone,
      baseZ: -10,
      speed: 4.2,
      phase: 0,
      photo: source.photo,
      baseRot: -0.06,
      baseOpacity: 0.9,
    };
  }

  get isStarted() {
    return this.started;
  }

  dispose() {
    this.unsubResize();
    this.tilt.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mat = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
      if (obj instanceof THREE.Sprite) obj.material.dispose();
    });
    this.textures.forEach((t) => t.dispose());
    this.starfield.dispose();
  }
}

/** Canvas neon text, glow vẽ sẵn — không cần bloom post-processing. */
function makeNeonTexture(text: string, scale: number): THREE.Texture {
  const pad = 46;
  const font = 104;
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;
  mctx.font = `700 ${font}px Quicksand, sans-serif`;
  const w = Math.ceil(mctx.measureText(text).width) + pad * 2;
  const h = font + pad * 2;
  const c = document.createElement("canvas");
  c.width = Math.max(64, w);
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.font = `700 ${font}px Quicksand, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = c.width / 2;
  const cy = c.height / 2 + 2;

  // glow layers
  ctx.save();
  ctx.shadowColor = "rgba(255, 47, 160, 0.95)";
  ctx.shadowBlur = 48;
  ctx.fillStyle = "rgba(255, 42, 178, 0.55)";
  ctx.fillText(text, cx, cy);
  ctx.fillText(text, cx, cy);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(255, 79, 216, 0.95)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "rgba(255, 122, 214, 0.8)";
  ctx.fillText(text, cx, cy);
  ctx.restore();

  // core
  const grad = ctx.createLinearGradient(0, cy - font * 0.5, 0, cy + font * 0.5);
  grad.addColorStop(0, "#fff4fc");
  grad.addColorStop(0.4, "#ffd2ef");
  grad.addColorStop(1, "#ff8bd7");
  ctx.fillStyle = grad;
  ctx.shadowColor = "rgba(255, 150, 224, 0.95)";
  ctx.shadowBlur = 10;
  ctx.fillText(text, cx, cy);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.userData.aspect = c.width / c.height;
  tex.userData.scale = scale;
  return tex;
}

/** Ảnh thẻ: ảnh cover trong khung giấy kem + viền mảnh. */
function makeCardTexture(src: string): THREE.Texture {
  const W = 512;
  const H = 680;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = new Image();
  img.src = src;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.aspect = W / H;

  const draw = (loaded: boolean) => {
    ctx.clearRect(0, 0, W, H);
    // warm paper card with a soft shadow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#f7eadf";
    roundRect(ctx, 16, 16, W - 32, H - 32, 10);
    ctx.fill();
    ctx.restore();

    // image
    ctx.save();
    roundRect(ctx, 30, 30, W - 60, H - 60, 3);
    ctx.clip();
    if (loaded && img.width > 0) {
      const scale = Math.max((W - 60) / img.width, (H - 60) / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, (W - iw) / 2, 30 + (H - 60 - ih) / 2, iw, ih);

      // pink neon spill on the photo
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "rgba(255, 90, 190, 0.16)");
      grad.addColorStop(0.5, "rgba(255, 60, 170, 0.04)");
      grad.addColorStop(1, "rgba(255, 47, 160, 0.22)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
      shade.addColorStop(0, "rgba(10, 2, 8, 0)");
      shade.addColorStop(1, "rgba(10, 2, 8, 0.26)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#5c3448");
      grad.addColorStop(0.55, "#b47a90");
      grad.addColorStop(1, "#f3c6d3");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255, 240, 246, 0.75)";
      ctx.font = "400 64px Cormorant Garamond, serif";
      ctx.textAlign = "center";
      ctx.fillText("♡", W / 2, H / 2);
    }
    ctx.restore();

    // thin inner line around the photo
    ctx.strokeStyle = "rgba(255, 225, 238, 0.38)";
    ctx.lineWidth = 2;
    roundRect(ctx, 30, 30, W - 60, H - 60, 3);
    ctx.stroke();
    tex.needsUpdate = true;
  };
  draw(false);
  img.onload = () => draw(true);
  img.onerror = () => draw(false);
  return tex;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
