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
  baseY: number;
  speed: number;
  phase: number;
  baseOpacity: number;
};

type CardMesh = {
  mesh: THREE.Mesh;
  baseY: number;
  speed: number;
  phase: number;
  photo: string;
  baseRot: number;
  tiltX: number;
  tiltY: number;
  baseOpacity: number;
};

/** Tâm cụm không gian 3D; camera quay quanh tâm này. */
const ORBIT_CENTER = new THREE.Vector3(0, 0, -13);
const ORBIT_RADIUS = 21;
/** Vị trí camera ban đầu (khi yaw = pitch = 0). */
const START_CAMERA = new THREE.Vector3(0, 0, ORBIT_CENTER.z + ORBIT_RADIUS);
/** Ống kính rộng hơn để thấy nhiều lớp ảnh/chữ khi xoay quanh cụm. */
const NEON_FOV = 62;
const TAU = Math.PI * 2;
/** Giới hạn ngẩng/cúi để không bị lộn ngược, vẫn nhìn gần như trọn 360°. */
const PITCH_LIMIT = THREE.MathUtils.degToRad(84);

export class NeonScene {
  readonly group = new THREE.Group();
  readonly starfield: Starfield;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly options: NeonOptions;
  private readonly reduced: boolean;
  private readonly textSprites: TextSprite[] = [];
  private readonly cards: CardMesh[] = [];
  private readonly nebulaMaterials: THREE.SpriteMaterial[] = [];
  private readonly textures: THREE.Texture[] = [];
  private hearts!: THREE.Points;
  private heartBase!: Float32Array;
  private heartSpeed!: Float32Array;
  private heartPhase!: Float32Array;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tilt = new THREE.Group();
  private readonly drag = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 };
  private orbitDistance = ORBIT_RADIUS;
  private time = 0;
  private started = false;
  private unsubResize: () => void;
  private captionIndex = -1;
  private captionElapsed = 0;
  private readonly revealState = { value: 0 };
  private revealTween: gsap.core.Tween | null = null;

  constructor(camera: THREE.PerspectiveCamera, _renderer: THREE.WebGLRenderer, options: NeonOptions) {
    this.camera = camera;
    this.options = options;
    this.reduced = prefersReducedMotion();
    this.group.visible = false;

    // Vũ trụ sao bao quanh cụm không gian; camera quay quanh cụm nên luôn nằm trong.
    this.starfield = new Starfield(
      this.reduced ? 300 : config.performance.maxStars,
      this.reduced ? 18 : 34,
      34,
      72,
      true,
    );
    this.starfield.group.position.copy(ORBIT_CENTER);
    this.group.add(this.starfield.group);

    // Cả cụm ảnh/chữ nằm quanh tâm; camera orbit quanh tâm để xoay 360°.
    this.tilt.position.copy(ORBIT_CENTER);
    this.tilt.rotation.z = THREE.MathUtils.degToRad(-3.5);
    this.group.add(this.tilt);

    this.addNebula();
    this.buildText();
    this.buildCards();
    this.buildHearts();

    this.unsubResize = onStageResize(() => this.layout());
    this.layout();
  }

  /** Những đám sương hồng tím phía sau cụm, giúp không gian có chiều sâu. */
  private addNebula() {
    const tex = makeNebulaTexture();
    this.textures.push(tex);
    const specs = [
      { x: 0, y: 0, z: -2, scale: 48, color: 0xff3d9a, opacity: 0.34 },
      { x: -13, y: 5, z: -8, scale: 30, color: 0x8a5cff, opacity: 0.2 },
      { x: 12, y: -6, z: -6, scale: 26, color: 0xff78c8, opacity: 0.16 },
    ];
    for (const spec of specs) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: spec.color,
        opacity: 0,
        toneMapped: false,
        fog: false,
      });
      mat.userData.baseOpacity = spec.opacity;
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(spec.x, spec.y, spec.z);
      sprite.scale.set(spec.scale, spec.scale, 1);
      sprite.renderOrder = 0;
      this.tilt.add(sprite);
      this.nebulaMaterials.push(mat);
    }
  }

  private buildText() {
    const max = this.reduced ? 48 : config.performance.maxNeonPhrases;
    const phrases = config.neonPhrases.length ? config.neonPhrases : ["20/10"];
    const buckets = [0.16, 0.23, 0.36, 0.6];
    // Mỗi câu chỉ cần một texture; trước đây texture được tạo lại cho từng
    // "bucket" dù nội dung giống hệt, làm tăng gấp nhiều lần thời gian dựng.
    const textures = new Map<string, THREE.Texture>();
    const getTex = (phrase: string) => {
      let tex = textures.get(phrase);
      if (!tex) {
        tex = makeNeonTexture(phrase);
        textures.set(phrase, tex);
        this.textures.push(tex);
      }
      return tex;
    };

    for (let i = 0; i < max; i++) {
      const phrase = phrases[i % phrases.length];
      // 12 cung quanh tâm, mỗi cung một cụm lớn; phần còn lại rải thành các lớp sâu.
      const near = i < 12;
      const sector = (near ? i : i - 12) % 12;
      let pitch = 0;
      let radius = 0;
      let bucket = buckets[Math.floor(Math.random() * buckets.length)];
      if (near) {
        pitch = THREE.MathUtils.degToRad(
          i % 2 === 0 ? 8 + Math.random() * 24 : -38 + Math.random() * 26,
        );
        radius = 6.2 + Math.random() * 3;
        bucket = i < 4 || Math.random() < 0.35 ? buckets[3] : buckets[2];
      } else {
        pitch = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * 72);
        radius = 3.5 + Math.random() * 8;
      }
      const yaw = (sector / 12) * TAU + (Math.random() - 0.5) * 0.3;
      const tex = getTex(phrase);
      const baseOpacity = near ? 0.8 + Math.random() * 0.14 : 0.46 + Math.random() * 0.24;
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
      sprite.position.copy(pointOnSphere(radius, yaw, pitch));
      const aspect = tex.userData.aspect as number;
      const baseH = bucket;
      sprite.scale.set(baseH * aspect, baseH, 1);
      sprite.material.rotation = (Math.random() - 0.5) * 0.1;
      sprite.renderOrder = 2;
      this.tilt.add(sprite);
      this.textSprites.push({
        sprite,
        baseY: sprite.position.y,
        speed: near ? 0.002 + Math.random() * 0.005 : 0.005 + Math.random() * 0.014,
        phase: Math.random() * Math.PI * 2,
        baseOpacity,
      });
    }
  }

  private buildCards() {
    const count = this.reduced
      ? Math.min(config.photos.length, 10)
      : config.performance.maxPhotoCards;
    const photos = (config.photos.length ? config.photos : ["/photos/1.webp"]).map(assetUrl);
    const cardTextures = new Map<string, THREE.Texture>();
    // Rải ảnh theo các cung 30°, giữ độ cao vừa phải để không bị cắt quá nhiều.
    const pitchPattern = [-30, 14, -8, 36, -36, 6, 28, -20, 0, 34, -32, 18, -16, 38, -6, 24];
    const radiusPattern = [8.5, 10.2, 7.2, 9.6, 8, 11, 9, 10.8, 7.8, 9.4, 10.6, 8.2, 11.2, 7, 9.8, 10];
    for (let i = 0; i < count; i++) {
      const photo = photos[i % photos.length];
      // Nhiều thẻ có thể dùng chung một ảnh: chia sẻ texture để không vẽ lại canvas.
      let tex = cardTextures.get(photo);
      if (!tex) {
        tex = makeCardTexture(photo);
        cardTextures.set(photo, tex);
        this.textures.push(tex);
      }
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
      const hero = i === 0;
      const baseH = hero ? 2.38 : 0.99 + Math.random() * 1.32;
      const geo = new THREE.PlaneGeometry(baseH * aspect, baseH);
      const mesh = new THREE.Mesh(geo, mat);

      // Rải ảnh thành nhiều lớp trong cụm; mỗi cung 30° đều có ảnh.
      let yaw = Math.PI + 0.1;
      let pitch = THREE.MathUtils.degToRad(-7);
      let radius = 8.4;
      if (!hero) {
        const sector = (i - 1) % 12;
        yaw = (sector / 12) * TAU + (Math.random() - 0.5) * 0.2;
        pitch = THREE.MathUtils.degToRad(pitchPattern[i % pitchPattern.length]);
        radius = radiusPattern[i % radiusPattern.length];
      }
      mesh.position.copy(pointOnSphere(radius, yaw, pitch));

      const baseRot = (Math.random() - 0.5) * 0.16;
      const tiltX = hero ? 0 : (Math.random() - 0.5) * 0.24;
      const tiltY = hero ? 0 : (Math.random() - 0.5) * 0.3;
      mesh.renderOrder = 3;
      this.tilt.add(mesh);
      mesh.lookAt(START_CAMERA);
      mesh.rotateX(tiltX);
      mesh.rotateY(tiltY);
      mesh.rotateZ(baseRot);

      this.cards.push({
        mesh,
        baseY: mesh.position.y,
        speed: hero ? 0.0015 : 0.003 + Math.random() * 0.012,
        phase: Math.random() * Math.PI * 2,
        photo,
        baseRot,
        tiltX,
        tiltY,
        baseOpacity: hero ? 1 : 0.64 + Math.random() * 0.28,
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
      const yaw = Math.random() * TAU;
      const pitch = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * 76);
      const radius = 4 + Math.random() * 8.5;
      const p = pointOnSphere(radius, yaw, pitch);
      positions.set([p.x, p.y, p.z], i * 3);
      base.set([p.x, p.y, p.z], i * 3);
      sizes[i] = 0.16 + Math.random() * 0.4;
      speed[i] = 0.012 + Math.random() * 0.035;
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      size: 1.35,
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

  private layout() {
    const stage = getStage();
    this.camera.aspect = stage.width / stage.height;
    this.camera.updateProjectionMatrix();
  }

  start(revealDuration = 1.9, settleCamera = false) {
    this.started = true;
    this.group.visible = true;
    this.captionIndex = -1;
    this.captionElapsed = 0;

    // Mỗi lần vào lại đều bắt đầu hướng nhìn chính giữa.
    this.drag.x = 0;
    this.drag.y = 0;
    this.drag.tx = 0;
    this.drag.ty = 0;
    this.drag.vx = 0;
    this.drag.vy = 0;
    if (this.camera.fov !== NEON_FOV) {
      this.camera.fov = NEON_FOV;
      this.camera.updateProjectionMatrix();
    }
    this.orbitDistance = settleCamera ? ORBIT_RADIUS + 1.2 : ORBIT_RADIUS;
    this.camera.position.set(
      ORBIT_CENTER.x,
      ORBIT_CENTER.y,
      ORBIT_CENTER.z + this.orbitDistance,
    );
    this.camera.lookAt(ORBIT_CENTER);

    // Fade the whole space in instead of popping it on screen.
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
      { z: THREE.MathUtils.degToRad(-6) },
      {
        z: THREE.MathUtils.degToRad(-3.5),
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
    for (const m of this.nebulaMaterials) {
      m.opacity = (m.userData.baseOpacity as number) * r;
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
    const k = 0.0031;
    // Ngang: quay không giới hạn 360°; dọc: ngẩng/cúi gần trọn vòng.
    this.drag.tx += dx * k;
    this.drag.ty = clamp(this.drag.ty + dy * k, -PITCH_LIMIT, PITCH_LIMIT);
    this.drag.vx = dx * 0.00038;
    this.drag.vy = dy * 0.00038;
  }

  endDrag() {
    // Quán tính nhẹ sau khi thả tay.
    this.drag.tx += this.drag.vx * 8;
    this.drag.ty = clamp(this.drag.ty + this.drag.vy * 8, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** trả về true nếu tap trúng thẻ ảnh */
  tap(ndcX: number, ndcY: number): boolean {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.cards.map((c) => c.mesh).filter((m) => m.visible);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return false;
    const hit = hits[0].object as THREE.Mesh;
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
    this.drag.x = damp(this.drag.x, this.drag.tx, 5.4, dt);
    this.drag.y = damp(this.drag.y, this.drag.ty, 5.4, dt);

    // Camera bay quanh cụm không gian: ngang 360°, dọc gần trọn vòng.
    this.orbitDistance = damp(this.orbitDistance, ORBIT_RADIUS, 3.2, dt);
    const cp = Math.cos(this.drag.y);
    this.camera.position.set(
      ORBIT_CENTER.x - Math.sin(this.drag.x) * cp * this.orbitDistance,
      ORBIT_CENTER.y + Math.sin(this.drag.y) * this.orbitDistance,
      ORBIT_CENTER.z + Math.cos(this.drag.x) * cp * this.orbitDistance,
    );
    this.camera.lookAt(ORBIT_CENTER);

    const t = this.time;

    for (const s of this.textSprites) {
      orbitAroundY(s.sprite.position, s.speed * dt);
      s.sprite.position.y = s.baseY + Math.sin(t * 0.24 + s.phase) * 0.24;
      (s.sprite.material as THREE.SpriteMaterial).opacity = s.baseOpacity * reveal;
    }

    for (const c of this.cards) {
      orbitAroundY(c.mesh.position, c.speed * dt);
      c.mesh.position.y = c.baseY + Math.sin(t * 0.28 + c.phase) * 0.12;
      c.mesh.lookAt(this.camera.position);
      c.mesh.rotateX(c.tiltX);
      c.mesh.rotateY(c.tiltY);
      c.mesh.rotateZ(c.baseRot + Math.sin(t * 0.3 + c.phase) * 0.026);
      (c.mesh.material as THREE.MeshBasicMaterial).opacity = c.baseOpacity * reveal;
    }

    const pos = this.hearts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.heartSpeed.length; i++) {
      const angle = t * this.heartSpeed[i];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const bx = this.heartBase[i * 3];
      const by = this.heartBase[i * 3 + 1];
      const bz = this.heartBase[i * 3 + 2];
      arr[i * 3] = bx * cos + bz * sin;
      arr[i * 3 + 1] = by + Math.sin(t * (0.35 + this.heartSpeed[i] * 3) + this.heartPhase[i]) * 0.5;
      arr[i * 3 + 2] = -bx * sin + bz * cos;
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

function makeNebulaTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.72)");
  g.addColorStop(0.22, "rgba(255,120,200,0.34)");
  g.addColorStop(0.52, "rgba(150,60,210,0.14)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Toạ độ trên mặt cầu quanh tâm; yaw = 0, pitch = 0 nằm phía sau tâm. */
function pointOnSphere(radius: number, yaw: number, pitch: number) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(
    Math.sin(yaw) * cp * radius,
    Math.sin(pitch) * radius,
    -Math.cos(yaw) * cp * radius,
  );
}

function orbitAroundY(p: THREE.Vector3, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = p.x * cos + p.z * sin;
  const z = -p.x * sin + p.z * cos;
  p.x = x;
  p.z = z;
}

/** Canvas neon text, glow vẽ sẵn — không cần bloom post-processing. */
function makeNeonTexture(text: string): THREE.Texture {
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
