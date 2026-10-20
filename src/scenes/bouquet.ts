import * as THREE from "three";
import gsap from "gsap";
import { config } from "../config";
import {
  clamp,
  damp,
  getStage,
  onStageResize,
  prefersReducedMotion,
} from "../core/stage";
import { assetUrl } from "../core/assets";
import { Starfield } from "../core/starfield";

type BouquetOptions = {
  onProgress: (filled: number) => void;
  onTap: (point: { x: number; y: number }) => void;
  onHold: () => void;
  onHoldStart: () => void;
  onHoldCancel: () => void;
  onFilled: () => void;
  onCaption: (index: number) => void;
};

const HOLD_MS = 950;
const EXIT_SECONDS = 1.5;
const BOUQUET_FOV = 48;

type PhotoLayer = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  base: THREE.Vector3;
  filled: boolean;
};

/** Vị trí 6 bông hồng, chuẩn hoá theo ảnh bó hoa (gốc trên-trái). */
const SLOTS = [
  { x: 0.296, y: 0.195, r: 0.15, z: 0.34 },
  { x: 0.5, y: 0.173, r: 0.152, z: 0.36 },
  { x: 0.722, y: 0.246, r: 0.148, z: 0.32 },
  { x: 0.265, y: 0.375, r: 0.145, z: 0.3 },
  { x: 0.8, y: 0.386, r: 0.145, z: 0.28 },
  { x: 0.5, y: 0.446, r: 0.172, z: 0.4 },
];

const BOUQUET_WIDTH_RATIO = 0.5;
const IMAGE_ASPECT = 810 / 960;
const BOUQUET_Y = -0.09;

export class BouquetScene {
  readonly group = new THREE.Group();
  readonly starfield: Starfield;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly bouquet: THREE.Mesh;
  private readonly bouquetMaterial: THREE.MeshBasicMaterial;
  private readonly bouquetGlow: THREE.Sprite;
  private readonly glowMaterial: THREE.SpriteMaterial;
  private readonly glowBase = new THREE.Vector2(1, 1);
  private readonly photoLayers: PhotoLayer[] = [];
  private readonly preloads: Promise<unknown>[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly options: BouquetOptions;
  private readonly reduced: boolean;
  private readonly shatter: THREE.Points;
  private readonly shatterMaterial: THREE.PointsMaterial;
  private readonly shatterBase: Float32Array;
  private readonly shatterVel: Float32Array;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly planeSize = new THREE.Vector2(1, 1);
  private readonly baseCamZ = 6;
  private holding = false;
  private holdCompleted = false;
  private holdProgress = 0;
  private holdTime = 0;
  private exiting = false;
  private exitTime = 0;
  private exitResolve: (() => void) | null = null;
  private exitFromCamZ = 6;
  private exitFromCamY = BOUQUET_Y;
  private exitFromScale = 1;
  private exitFromY = BOUQUET_Y;
  private exitFromColor = 1;
  private exitFromGlowScale = 1;
  private filled = 0;
  private time = 0;
  private started = false;
  private unsubResize: () => void;
  private camTween: gsap.core.Tween | null = null;

  constructor(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    options: BouquetOptions,
  ) {
    this.camera = camera;
    this.options = options;
    this.reduced = prefersReducedMotion();
    this.starfield = new Starfield(this.reduced ? 230 : 380, this.reduced ? 16 : 30, 30, 26);
    this.group.add(this.starfield.group);

    this.planeSize.copy(this.visibleSize(this.baseCamZ));
    const bw = this.planeSize.x * BOUQUET_WIDTH_RATIO;
    const bh = bw / IMAGE_ASPECT;

    this.bouquetMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.bouquet = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), this.bouquetMaterial);
    this.bouquet.position.set(0, BOUQUET_Y, 0);
    this.bouquet.renderOrder = 2;
    this.group.add(this.bouquet);

    // Halo hồng phía sau bó hoa: lớn dần khi giữ, bung ra lúc chuyển cảnh.
    const glowTexture = makeGlowTexture();
    this.textures.push(glowTexture);
    this.glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xff74c4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.bouquetGlow = new THREE.Sprite(this.glowMaterial);
    this.glowBase.set(bw * 1.85, bh * 1.5);
    this.bouquetGlow.scale.set(this.glowBase.x, this.glowBase.y, 1);
    this.bouquetGlow.position.set(0, BOUQUET_Y, -0.2);
    this.bouquetGlow.renderOrder = 1;
    this.group.add(this.bouquetGlow);

    const loader = new THREE.TextureLoader();
    const bouquet = loadTexture(
      loader,
      assetUrl("/assets/bouquet.webp"),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      },
      () => console.warn("[bouquet] Không tải được ảnh bó hoa"),
    );
    bouquet.texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(bouquet.texture);
    this.bouquetMaterial.map = bouquet.texture;
    this.bouquetMaterial.needsUpdate = true;
    this.preloads.push(bouquet.loaded);

    const ovalMask = makeOvalMask();
    this.textures.push(ovalMask);
    config.photos.slice(0, 6).forEach((src, i) => {
      const photoSrc = assetUrl(src);
      const photo = loadTexture(loader, photoSrc, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      });
      const texture = photo.texture;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(texture);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        alphaMap: ovalMask,
        transparent: true,
        opacity: 0,
        alphaTest: 0.02,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const slot = SLOTS[i];
      const size = this.slotSize(slot.r, bw);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), material);
      mesh.position.copy(this.slotPosition(slot, bw, bh));
      mesh.renderOrder = 3;
      mesh.visible = false;
      this.group.add(mesh);
      this.photoLayers.push({
        mesh,
        material,
        base: mesh.position.clone(),
        filled: false,
      });
      this.preloads.push(photo.loaded);
    });

    const count = this.reduced ? 240 : 620;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const base = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const palette = [
      new THREE.Color(0xff7ec8),
      new THREE.Color(0xff4fb0),
      new THREE.Color(0xffd9e4),
      new THREE.Color(0xff2f7a),
    ];
    for (let i = 0; i < count; i++) {
      const sx = (Math.random() - 0.5) * bw * 0.9;
      const sy = (Math.random() - 0.5) * bh * 0.9 + 0.02;
      const sz = (Math.random() - 0.5) * 0.4;
      positions.set([sx, sy, sz], i * 3);
      base.set([sx, sy, sz], i * 3);
      vel.set(
        [(Math.random() - 0.5) * 0.9, Math.random() * 0.8 + 0.12, (Math.random() - 0.5) * 1.4],
        i * 3,
      );
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.014 + Math.random() * 0.045;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    sgeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    sgeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    this.shatterMaterial = new THREE.PointsMaterial({
      size: 0.055,
      map: makeSparkTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    this.shatter = new THREE.Points(sgeo, this.shatterMaterial);
    this.shatter.frustumCulled = false;
    this.shatterBase = base;
    this.shatterVel = vel;
    this.group.add(this.shatter);

    this.unsubResize = onStageResize(() => this.layout());
    this.layout();
  }

  private visibleSize(z: number) {
    const stage = getStage();
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(BOUQUET_FOV / 2)) * z;
    return new THREE.Vector2(vh * (stage.width / stage.height), vh);
  }

  private slotSize(r: number, bw: number) {
    const w = bw * r * 1.72;
    return new THREE.Vector2(w, w * 1.18);
  }

  private slotPosition(slot: (typeof SLOTS)[number], bw: number, bh: number) {
    return new THREE.Vector3(
      (slot.x - 0.5) * bw,
      (0.5 - slot.y) * bh + this.bouquet.position.y,
      slot.z,
    );
  }

  private layout() {
    this.planeSize.copy(this.visibleSize(this.baseCamZ));
    const bw = this.planeSize.x * BOUQUET_WIDTH_RATIO;
    const bh = bw / IMAGE_ASPECT;
    this.bouquet.geometry.dispose();
    this.bouquet.geometry = new THREE.PlaneGeometry(bw, bh);
    this.glowBase.set(bw * 1.85, bh * 1.5);
    this.bouquetGlow.scale.set(this.glowBase.x, this.glowBase.y, 1);
    SLOTS.forEach((slot, i) => {
      const layer = this.photoLayers[i];
      if (!layer) return;
      const size = this.slotSize(slot.r, bw);
      layer.mesh.geometry.dispose();
      layer.mesh.geometry = new THREE.PlaneGeometry(size.x, size.y);
      layer.base.copy(this.slotPosition(slot, bw, bh));
      layer.mesh.position.copy(layer.base);
    });
  }

  async preload() {
    await Promise.allSettled(this.preloads);
  }

  setParallax(x: number, y: number) {
    this.starfield.setParallax(x, y);
  }

  get progress() {
    return this.filled / 6;
  }

  tap(px: number, py: number) {
    this.options.onTap({ x: px, y: py });
    const layer = this.photoLayers.find((p) => !p.filled);
    if (!layer) return;
    layer.filled = true;
    layer.mesh.visible = true;
    this.filled++;
    gsap.killTweensOf(layer.material);
    gsap.fromTo(layer.material, { opacity: 0 }, { opacity: 1, duration: 1, ease: "power2.out" });
    gsap.fromTo(
      layer.mesh.scale,
      { x: 0.82, y: 0.82 },
      { x: 1, y: 1, duration: 1.35, ease: "elastic.out(1, 0.6)" },
    );
    gsap.fromTo(
      layer.mesh.rotation,
      { z: (Math.random() - 0.5) * 0.4 },
      { z: 0, duration: 1.2, ease: "power3.out" },
    );
    this.options.onProgress(this.filled);
    this.options.onCaption(Math.min(config.captions.length - 1, this.filled - 1));
    if (this.filled === 6) this.options.onFilled();
  }

  startHold() {
    if (this.filled < 6 || this.holding || !this.started || this.exiting) return;
    this.holding = true;
    this.holdCompleted = false;
    // Nối tiếp phần năng lượng còn lại (nếu vừa nhả tay) để không bị giật.
    this.holdTime = clamp(this.holdProgress, 0, 1) * HOLD_MS;
    this.options.onHoldStart();
  }

  endHold() {
    if (!this.holding) return;
    this.holding = false;
    if (!this.holdCompleted) this.options.onHoldCancel();
  }

  start() {
    this.started = true;
    this.camTween?.kill();
    // Neon dùng ống kính rộng hơn; trả bó hoa về đúng khung ban đầu.
    if (this.camera.fov !== BOUQUET_FOV) {
      this.camera.fov = BOUQUET_FOV;
      this.camera.updateProjectionMatrix();
    }
    // Camera neon có thể đang orbit lệch tâm; trả cả vị trí lẫn hướng về mặc định.
    this.camera.rotation.set(0, 0, 0);
    if (this.reduced) {
      this.camera.position.set(0, BOUQUET_Y, this.baseCamZ);
      return;
    }
    this.camTween = gsap.fromTo(
      this.camera.position,
      { x: 0, z: this.baseCamZ + 1.8, y: 0.32 },
      { x: 0, z: this.baseCamZ, y: BOUQUET_Y, duration: 2.8, ease: "power3.out" },
    );
  }

  async exit(): Promise<void> {
    this.camTween?.kill();
    if (this.reduced) {
      this.bouquetMaterial.opacity = 0;
      this.glowMaterial.opacity = 0;
      this.shatterMaterial.opacity = 0;
      this.group.visible = false;
      return;
    }
    if (this.exiting) return;
    this.exiting = true;
    this.exitTime = 0;
    this.holding = false;
    this.holdCompleted = true;
    this.holdProgress = 1;
    // Ghi lại trạng thái hiện tại để chuyển cảnh nối tiếp, không nhảy hình.
    this.exitFromCamZ = this.camera.position.z;
    this.exitFromCamY = this.camera.position.y;
    this.exitFromScale = this.bouquet.scale.x;
    this.exitFromY = this.bouquet.position.y;
    this.exitFromColor = this.bouquetMaterial.color.r;
    this.exitFromGlowScale = this.bouquetGlow.scale.x / Math.max(0.0001, this.glowBase.x);
    return new Promise<void>((resolve) => {
      this.exitResolve = resolve;
    });
  }

  reset() {
    this.filled = 0;
    this.started = false;
    this.holding = false;
    this.holdCompleted = false;
    this.holdProgress = 0;
    this.holdTime = 0;
    this.exiting = false;
    this.exitTime = 0;
    this.exitResolve = null;
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.bouquetMaterial.opacity = 1;
    this.bouquetMaterial.color.setScalar(1);
    this.bouquet.position.set(0, BOUQUET_Y, 0);
    this.bouquet.scale.setScalar(1);
    this.bouquet.rotation.set(0, 0, 0);
    this.glowMaterial.opacity = 0;
    this.bouquetGlow.scale.set(this.glowBase.x, this.glowBase.y, 1);
    this.bouquetGlow.position.y = BOUQUET_Y;
    this.shatterMaterial.opacity = 0;
    this.shatterMaterial.size = 0.055;
    const shatterPos = this.shatter.geometry.getAttribute("position") as THREE.BufferAttribute;
    const shatterArr = shatterPos.array as Float32Array;
    for (let i = 0; i < shatterArr.length; i += 3) {
      shatterArr[i] = this.shatterBase[i];
      shatterArr[i + 1] = this.shatterBase[i + 1];
      shatterArr[i + 2] = this.shatterBase[i + 2];
    }
    shatterPos.needsUpdate = true;
    this.starfield.setIntensity(1);
    this.camera.position.set(0, BOUQUET_Y, this.baseCamZ + 1.4);
    this.camera.rotation.z = 0;
    this.photoLayers.forEach((p) => {
      p.filled = false;
      p.material.opacity = 0;
      p.mesh.visible = false;
      p.mesh.scale.setScalar(1);
      p.mesh.rotation.set(0, 0, 0);
      p.mesh.position.copy(p.base);
    });
    this.options.onProgress(0);
  }

  update(dt: number) {
    this.time += dt;

    if (this.exiting) {
      this.updateExit(dt);
      this.starfield.update(dt);
      return;
    }

    if (!this.group.visible) {
      this.starfield.update(dt);
      return;
    }

    if (this.holding) {
      this.holdTime += dt * 1000;
      const raw = clamp(this.holdTime / HOLD_MS, 0, 1);
      // ease-out: phản hồi nhận ra ngay nhưng tăng tốc mượt về cuối
      this.holdProgress = 1 - Math.pow(1 - raw, 3);
      if (raw >= 1) {
        this.holding = false;
        this.holdCompleted = true;
        this.holdProgress = 1;
        this.options.onHold();
      }
    } else {
      // nhả tay: năng lượng tan dần thay vì bị reset cứng
      this.holdProgress = damp(this.holdProgress, 0, 7, dt);
      if (this.holdProgress < 0.001) this.holdProgress = 0;
    }

    this.starfield.update(dt);

    const t = this.time;
    const charge = this.holdProgress;
    const chargeEase = charge * charge;

    const breath = this.reduced ? 1 : 1 + Math.sin(t * 1.15) * 0.012;
    const idleY = this.reduced ? BOUQUET_Y : BOUQUET_Y + Math.sin(t * 0.72) * 0.028;
    const idleRot = this.reduced ? 0 : Math.sin(t * 0.42) * 0.007;

    // Rung nhẹ bằng sóng sin liên tục thay vì random từng frame (đỡ giật).
    const trembleX =
      (Math.sin(t * 41) * 0.0032 + Math.sin(t * 27.7) * 0.0016) * chargeEase;
    const trembleRot =
      (Math.sin(t * 34) * 0.0034 + Math.sin(t * 21.3 + 1.1) * 0.0018) * chargeEase;

    this.bouquet.position.set(trembleX, idleY + chargeEase * 0.045, 0);
    this.bouquet.rotation.z = idleRot + trembleRot;
    const scale = breath * (1 + chargeEase * 0.065);
    this.bouquet.scale.set(scale, scale, 1);
    this.bouquetMaterial.color.setScalar(1 + chargeEase * 0.18);

    // Halo chỉ bật ở cuối lúc giữ, nhẹ và ngắn để không thành "nền hồng".
    const glowRamp = smoothstep(0.45, 1, charge);
    const glowPulse = this.reduced ? 1 : 1 + Math.sin(t * 2.1) * 0.04;
    this.glowMaterial.opacity = Math.pow(glowRamp, 1.6) * 0.3;
    this.bouquetGlow.scale.set(
      this.glowBase.x * (0.92 + glowRamp * 0.18) * glowPulse,
      this.glowBase.y * (0.92 + glowRamp * 0.15) * glowPulse,
      1,
    );
    this.bouquetGlow.position.y = idleY + chargeEase * 0.02;

    const spread = 1 + chargeEase * 0.035;
    for (let i = 0; i < this.photoLayers.length; i++) {
      const p = this.photoLayers[i];
      if (!p.filled) continue;
      p.mesh.position.x = p.base.x * spread;
      p.mesh.position.y =
        BOUQUET_Y +
        (p.base.y - BOUQUET_Y) * spread +
        (this.reduced ? 0 : Math.sin(t * 0.85 + i * 1.7) * 0.008);
      if (!this.reduced) p.mesh.rotation.z = Math.sin(t * 0.5 + i) * 0.01;
    }
  }

  private updateExit(dt: number) {
    const t = (this.exitTime += dt);
    const dive = easeInOutCubic(clamp(t / 1.2, 0, 1));
    const bloom = easeOutCubic(clamp(t / 0.9, 0, 1));
    const fade = smoothstep(0.5, 1.28, t);
    const tail = smoothstep(1.18, EXIT_SECONDS, t);

    // Camera trôi vào bó hoa chậm rồi mới tăng tốc, không còn cú lao gắt.
    this.camera.position.z = THREE.MathUtils.lerp(this.exitFromCamZ, 4.8, dive);
    this.camera.position.y = THREE.MathUtils.lerp(
      this.exitFromCamY,
      BOUQUET_Y + 0.02,
      dive,
    );
    this.camera.rotation.z = dive * 0.018;

    this.bouquet.position.set(0, THREE.MathUtils.lerp(this.exitFromY, BOUQUET_Y + 0.02, dive), 0);
    this.bouquet.rotation.z = 0.012 * dive;
    const scale = THREE.MathUtils.lerp(this.exitFromScale, 1.285, bloom);
    this.bouquet.scale.set(scale, scale, 1);
    this.bouquetMaterial.opacity = 1 - fade;
    this.bouquetMaterial.color.setScalar(THREE.MathUtils.lerp(this.exitFromColor, 1.32, bloom));

    // Vệt sáng chỉ loé lên rồi tắt sớm, nhường sân khấu cho hạt sáng + màn flash.
    this.glowMaterial.opacity =
      (0.32 + bloom * 0.28) * (1 - smoothstep(0.4, 0.95, t));
    const glowScale = THREE.MathUtils.lerp(this.exitFromGlowScale, 1.38, bloom);
    this.bouquetGlow.scale.set(this.glowBase.x * glowScale, this.glowBase.y * glowScale, 1);
    this.bouquetGlow.position.y = BOUQUET_Y + 0.02 * dive;

    const spread = 1.035 + bloom * 0.205;
    this.photoLayers.forEach((p, i) => {
      if (!p.filled) return;
      p.material.opacity = 1 - fade;
      p.mesh.position.x = p.base.x * spread + Math.sin(i * 2.1 + t * 5) * 0.02 * bloom;
      p.mesh.position.y =
        BOUQUET_Y + (p.base.y - BOUQUET_Y) * spread + bloom * (0.04 + (i % 3) * 0.02);
      p.mesh.rotation.z = (i % 2 === 0 ? 1 : -1) * bloom * 0.05;
      p.mesh.scale.setScalar(1 + bloom * 0.08);
    });

    this.starfield.setIntensity(1 - smoothstep(0.45, 1.3, t));

    const burst = smoothstep(0.28, 1.42, t);
    if (burst > 0) {
      const eased = 1 - Math.pow(1 - burst, 2.2);
      const pos = this.shatter.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const sway = Math.sin(i * 0.7 + t * 1.6) * 0.02 * eased;
        arr[i] = this.shatterBase[i] + this.shatterVel[i] * eased * 1.05 + sway;
        arr[i + 1] =
          this.shatterBase[i + 1] + this.shatterVel[i + 1] * eased * 0.8 + eased * 0.18;
        arr[i + 2] = this.shatterBase[i + 2] + this.shatterVel[i + 2] * eased * 0.85;
      }
      pos.needsUpdate = true;
    }
    this.shatterMaterial.opacity = smoothstep(0.2, 0.55, t) * (1 - tail) * 0.95;
    this.shatterMaterial.size = 0.05 + bloom * 0.05;

    if (t >= EXIT_SECONDS) {
      this.bouquetMaterial.opacity = 0;
      this.glowMaterial.opacity = 0;
      this.shatterMaterial.opacity = 0;
      this.group.visible = false;
      this.exiting = false;
      const resolve = this.exitResolve;
      this.exitResolve = null;
      resolve?.();
    }
  }

  debugRaycast(ndcX: number, ndcY: number) {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.bouquet);
  }

  get canHold() {
    return this.filled >= 6 && this.started;
  }

  get photoCount() {
    return this.filled;
  }

  get holdAmount() {
    return this.holdProgress;
  }

  get elapsed() {
    return this.time;
  }

  dispose() {
    this.unsubResize();
    this.camTween?.kill();
    this.group.traverse((obj) => {
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

/**
 * Tải texture và trả kèm promise của chính lần tải đó.
 * Trước đây mỗi ảnh bị tải hai lần (TextureLoader + Image preload),
 * làm tăng gấp đôi băng thông lúc khởi động.
 */
function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  onLoaded?: (texture: THREE.Texture) => void,
  onError?: () => void,
): { texture: THREE.Texture; loaded: Promise<void> } {
  let resolveLoaded!: () => void;
  const loaded = new Promise<void>((resolve) => {
    resolveLoaded = resolve;
  });
  const texture = loader.load(
    url,
    (t) => {
      onLoaded?.(t);
      resolveLoaded();
    },
    undefined,
    () => {
      onError?.();
      resolveLoaded();
    },
  );
  return { texture, loaded };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

function easeInOutCubic(p: number) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

let glowTex: THREE.Texture | null = null;
function makeGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,230,244,0.95)");
  g.addColorStop(0.22, "rgba(255,145,205,0.55)");
  g.addColorStop(0.55, "rgba(255,80,180,0.2)");
  g.addColorStop(1, "rgba(255,60,170,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let ovalTex: THREE.Texture | null = null;
function makeOvalMask(): THREE.Texture {
  if (ovalTex) return ovalTex;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(s / 2, s / 2, s / 2 - 2, s / 2 - 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ovalTex = new THREE.CanvasTexture(c);
  ovalTex.colorSpace = THREE.NoColorSpace;
  ovalTex.anisotropy = 4;
  return ovalTex;
}

let sparkTex: THREE.Texture | null = null;
function makeSparkTexture(): THREE.Texture {  if (sparkTex) return sparkTex;
  const s = 32;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,170,225,0.8)");
  g.addColorStop(1, "rgba(255,90,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  sparkTex = new THREE.CanvasTexture(c);
  sparkTex.colorSpace = THREE.SRGBColorSpace;
  return sparkTex;
}
