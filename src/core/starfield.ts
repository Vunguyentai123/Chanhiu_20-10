import * as THREE from "three";
import { clamp, getStage } from "./stage";

type DotLayer = {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  baseOpacity: number;
  speed: number;
  phase: number;
};

/**
 * Shared starfield: fine white stars + warm bokeh with slow twinkle and a
 * gentle parallax. Points are placed inside the camera frustum at every depth
 * so the sky stays full on tall phone screens.
 */
export class Starfield {
  readonly group = new THREE.Group();
  private readonly layers: DotLayer[] = [];
  private readonly glows: DotLayer[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly time = { t: 0 };
  private parallaxX = 0;
  private parallaxY = 0;
  private targetX = 0;
  private targetY = 0;
  private intensity = 1;

  constructor(
    count = 380,
    warmCount = 28,
    _spread = 42,
    depth = 34,
    spherical = false,
  ) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reduced ? Math.round(count * 0.6) : count;
    const warmTotal = reduced ? Math.round(warmCount * 0.65) : warmCount;
    const starTexture = makeStarTexture();
    const glowTexture = makeGlowTexture();
    this.textures.push(starTexture, glowTexture);

    const stage = getStage();
    const aspect = stage.width / stage.height;
    const cameraZ = 6;
    const tanFov = Math.tan(THREE.MathUtils.degToRad(24));

    const place = (z: number, margin = 1.08) => {
      const dist = cameraZ - z;
      const halfH = tanFov * dist;
      const halfW = halfH * aspect;
      return {
        x: (Math.random() - 0.5) * 2 * halfW * margin,
        y: (Math.random() - 0.5) * 2 * halfH * margin,
      };
    };
    // Khi nhìn 360°, sao phải bao quanh người xem thay vì chỉ nằm trước mặt.
    const placeAround = (minRadius: number, maxRadius: number) => {
      const theta = Math.random() * Math.PI * 2;
      const cosPhi = Math.random() * 2 - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const r = minRadius + Math.random() * (maxRadius - minRadius);
      return {
        x: r * sinPhi * Math.cos(theta),
        y: r * cosPhi,
        z: r * sinPhi * Math.sin(theta),
      };
    };

    // Four star size families, so close stars read as crisp points and far
    // stars stay visible as tiny specks.
    const families = [
      { share: 0.46, size: 0.038, opacity: 0.8 },
      { share: 0.31, size: 0.058, opacity: 0.8 },
      { share: 0.17, size: 0.085, opacity: 0.72 },
      { share: 0.06, size: 0.125, opacity: 0.65 },
    ];
    let made = 0;
    families.forEach((family, familyIndex) => {
      const n =
        familyIndex === families.length - 1 ? total - made : Math.round(total * family.share);
      made += n;
      if (n <= 0) return;
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const p = spherical
          ? placeAround(Math.max(7, depth * 0.42), depth * 1.05)
          : (() => {
              const z = -Math.random() * depth;
              return { ...place(z), z };
            })();
        positions.set([p.x, p.y, p.z], i * 3);
        const warm = Math.random() < 0.13;
        const c = new THREE.Color(warm ? 0xffe2b8 : 0xfdf5ff);
        c.multiplyScalar(0.58 + Math.random() * 0.42);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: family.size,
        map: starTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        opacity: family.opacity,
        sizeAttenuation: true,
        fog: false,
      });
      const points = new THREE.Points(geo, material);
      points.frustumCulled = false;
      this.group.add(points);
      this.layers.push({
        points,
        material,
        baseOpacity: family.opacity,
        speed: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      });
    });

    // Warm bokeh: a few larger soft dots scattered deep in the scene.
    const glowFamilies = [
      { share: 0.46, size: 0.34, opacity: 0.55 },
      { share: 0.3, size: 0.55, opacity: 0.46 },
      { share: 0.16, size: 0.82, opacity: 0.36 },
      { share: 0.08, size: 1.15, opacity: 0.28 },
    ];
    let madeGlow = 0;
    glowFamilies.forEach((family, familyIndex) => {
      const n =
        familyIndex === glowFamilies.length - 1
          ? warmTotal - madeGlow
          : Math.round(warmTotal * family.share);
      madeGlow += n;
      if (n <= 0) return;
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const p = spherical
          ? placeAround(Math.max(10, depth * 0.5), depth * 1.1)
          : (() => {
              const z = -depth * 0.25 - Math.random() * depth * 0.7;
              return { ...place(z, 1.15), z };
            })();
        positions.set([p.x, p.y, p.z], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        size: family.size,
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffd7a0,
        opacity: family.opacity,
        sizeAttenuation: true,
        fog: false,
      });
      const points = new THREE.Points(geo, material);
      points.frustumCulled = false;
      this.group.add(points);
      this.glows.push({
        points,
        material,
        baseOpacity: family.opacity,
        speed: 0.28 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
      });
    });
  }

  setParallax(x: number, y: number) {
    this.targetX = clamp(x, -1, 1);
    this.targetY = clamp(y, -1, 1);
  }

  /** 0..1 multiplier applied on top of the twinkle, used for scene crossfades. */
  setIntensity(value: number) {
    this.intensity = clamp(value, 0, 1);
  }

  update(dt: number) {
    this.time.t += dt;
    const t = this.time.t;
    this.parallaxX += (this.targetX - this.parallaxX) * Math.min(1, dt * 2.2);
    this.parallaxY += (this.targetY - this.parallaxY) * Math.min(1, dt * 2.2);
    this.group.position.x = this.parallaxX * 0.45;
    this.group.position.y = -this.parallaxY * 0.35;

    for (const layer of this.layers) {
      layer.material.opacity =
        layer.baseOpacity *
        this.intensity *
        (0.82 + 0.18 * Math.sin(t * layer.speed + layer.phase));
    }
    for (const layer of this.glows) {
      layer.material.opacity =
        layer.baseOpacity *
        this.intensity *
        (0.68 + 0.32 * Math.sin(t * layer.speed + layer.phase));
    }
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  dispose() {
    for (const layer of this.layers) {
      layer.points.geometry.dispose();
      layer.material.dispose();
    }
    for (const layer of this.glows) {
      layer.points.geometry.dispose();
      layer.material.dispose();
    }
    this.textures.forEach((t) => t.dispose());
  }
}

let starTex: THREE.Texture | null = null;
let glowTex: THREE.Texture | null = null;

function makeStarTexture(): THREE.Texture {
  if (starTex) return starTex;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.16, "rgba(255,255,255,0.95)");
  g.addColorStop(0.45, "rgba(255,246,255,0.28)");
  g.addColorStop(1, "rgba(255,240,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

function makeGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,247,220,1)");
  g.addColorStop(0.08, "rgba(255,234,186,0.95)");
  g.addColorStop(0.24, "rgba(255,200,126,0.4)");
  g.addColorStop(0.58, "rgba(255,176,100,0.09)");
  g.addColorStop(1, "rgba(255,160,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Additive texture for tiny floating hearts. */
let heartTex: THREE.Texture | null = null;
export function getHeartTexture(): THREE.Texture {
  if (heartTex) return heartTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.translate(s / 2, s / 2 + 4);
  ctx.beginPath();
  const k = 0.92;
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const x = 16 * Math.pow(Math.sin(a), 3) * k;
    const y =
      -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * k;
    if (a === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, -10, 2, 0, 0, 54);
  g.addColorStop(0, "rgba(255,120,124,1)");
  g.addColorStop(0.45, "rgba(255,46,58,0.95)");
  g.addColorStop(0.82, "rgba(255,30,44,0.5)");
  g.addColorStop(1, "rgba(255,20,40,0)");
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(255,40,60,0.85)";
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fill();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  return heartTex;
}
