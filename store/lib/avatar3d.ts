// Fit-room 3D avatar: a person built from the customer's body measurements and
// dressed in garments built from each piece's flat measurements, so a size that
// is too tight, loose, short or long looks it. Everything is modelled in cm with
// y up and the avatar facing +z; the caller scales the group to metres.
// Illustrative only; lib/fit.ts decides the fit.

import * as THREE from "three";
import type { FitShape, FitStyle, Measurements } from "./data";
import { thighOf, type Body, type Level } from "./fit.ts";

// ── Sweep: a tube through elliptical rings ────────────────────────────────

interface Ring {
  p: THREE.Vector3;
  /** Half-width along the ring's side axis. */
  a: number;
  /** Half-depth along the ring's forward axis. */
  b: number;
  c?: THREE.Color;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/** Catmull-Rom through the rings' centres and radii, `steps` samples per span. */
function smoothRings(rs: Ring[], steps: number): Ring[] {
  if (rs.length < 3) return rs;
  const out: Ring[] = [];
  for (let i = 0; i < rs.length - 1; i++) {
    const [r0, r1, r2, r3] = [rs[Math.max(0, i - 1)], rs[i], rs[i + 1], rs[Math.min(rs.length - 1, i + 2)]];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const c = r1.c && r2.c ? r1.c.clone().lerp(r2.c, t) : r1.c;
      out.push({
        p: V(cr(r0.p.x, r1.p.x, r2.p.x, r3.p.x, t), cr(r0.p.y, r1.p.y, r2.p.y, r3.p.y, t), cr(r0.p.z, r1.p.z, r2.p.z, r3.p.z, t)),
        a: Math.max(0.05, cr(r0.a, r1.a, r2.a, r3.a, t)),
        b: Math.max(0.05, cr(r0.b, r1.b, r2.b, r3.b, t)),
        c,
      });
    }
  }
  out.push(rs[rs.length - 1]);
  return out;
}

/** Rounded end: rings shrinking to a point along the tube's direction. */
function dome(rs: Ring[], at: "start" | "end", depth = 0.8, n = 4): Ring[] {
  const end = at === "end";
  const r = end ? rs[rs.length - 1] : rs[0];
  const q = end ? rs[rs.length - 2] : rs[1];
  const dir = r.p.clone().sub(q.p).normalize();
  const reach = Math.min(r.a, r.b) * depth;
  const extra: Ring[] = [];
  for (let k = 1; k <= n; k++) {
    const t = (k / n) * (Math.PI / 2);
    const s = k === n ? 0.02 : Math.cos(t);
    extra.push({ p: r.p.clone().addScaledVector(dir, Math.sin(t) * reach), a: r.a * s, b: r.b * s, c: r.c });
  }
  return end ? [...rs, ...extra] : [...extra.reverse(), ...rs];
}

interface SweepOpts {
  seg?: number;
  steps?: number;
  /** Direction the ring's b axis should face (default forward, +z). */
  fwd?: THREE.Vector3;
}

function sweep(rings: Ring[], o: SweepOpts = {}): THREE.BufferGeometry {
  const seg = o.seg ?? 40;
  const rs = smoothRings(rings, o.steps ?? 5);
  const fwdRef = o.fwd ?? V(0, 0, 1);
  const pos: number[] = [];
  const col: number[] = [];
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    const T = rs[Math.min(rs.length - 1, i + 1)].p.clone().sub(rs[Math.max(0, i - 1)].p).normalize();
    let Z = fwdRef.clone().addScaledVector(T, -fwdRef.dot(T));
    if (Z.lengthSq() < 1e-6) Z = V(0, 1, 0).addScaledVector(T, -T.y);
    Z.normalize();
    const X = new THREE.Vector3().crossVectors(Z, T).normalize();
    // Keep the side axis pointing to +x wherever the tube runs.
    if (X.x < 0 || (Math.abs(X.x) < 1e-6 && X.y < 0)) X.negate();
    const c = r.c ?? white;
    for (let j = 0; j < seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const p = r.p.clone().addScaledVector(X, Math.cos(u) * r.a).addScaledVector(Z, Math.sin(u) * r.b);
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rs.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + j;
      const d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Winding depends on the tube's direction; make the normals face outwards.
  const mid = Math.floor(rs.length / 2);
  const n = g.getAttribute("normal");
  const v0 = mid * seg;
  const out = V(pos[v0 * 3], pos[v0 * 3 + 1], pos[v0 * 3 + 2]).sub(rs[mid].p);
  if (out.dot(V(n.getX(v0), n.getY(v0), n.getZ(v0))) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

const ellipsePerimeter = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
/** Half-axes of an ellipse with circumference `c` and width : depth `ratio`. */
function axes(c: number, ratio: number) {
  const b = c / ellipsePerimeter(ratio, 1);
  return { a: b * ratio, b };
}

// ── The body ──────────────────────────────────────────────────────────────

export interface Rig {
  h: number;
  neckY: number;
  shoulderY: number;
  chestY: number;
  waistY: number;
  hipY: number;
  crotchY: number;
  kneeY: number;
  ankleY: number;
  headC: THREE.Vector3;
  head: { x: number; y: number; z: number };
  neck: { a: number; b: number };
  torso: Ring[];
  legs: [Ring[], Ring[]];
  arms: [Ring[], Ring[]];
  /** Unit direction of each forearm (hands and sleeves continue along it). */
  armLen: number;
}

export function rigFor(b: Body): Rig {
  const h = b.h;
  const s = h / 178;
  const neckY = 0.838 * h;
  const shoulderY = 0.812 * h;
  const chestY = 0.72 * h;
  const waistY = 0.61 * h;
  const hipY = 0.5 * h;
  const crotchY = Math.min(b.inseam, hipY - 4);
  const kneeY = Math.min(0.285 * h, crotchY - 14);
  const ankleY = 0.045 * h;

  const chest = axes(b.chest, 1.42);
  const waist = axes(b.waist, 1.3);
  const hips = axes(b.hips, 1.32);
  const neck = { a: 5.9 * s * (0.8 + 0.2 * (b.chest / 98)), b: 6.1 * s * (0.8 + 0.2 * (b.chest / 98)) };
  const S = b.shoulder / 2;

  const ring = (y: number, a: number, bb: number, z = 0): Ring => ({ p: V(0, y, z), a, b: bb });
  const torso: Ring[] = [
    ring(crotchY + 1, hips.a * 0.72, hips.b * 0.78, -0.5),
    ring(crotchY + 6, hips.a * 0.95, hips.b * 0.95, -1),
    ring(hipY, hips.a, hips.b, -1.4),
    ring(lerp(hipY, waistY, 0.5), lerp(hips.a, waist.a, 0.6), lerp(hips.b, waist.b, 0.5), -0.6),
    ring(waistY, waist.a, waist.b, 0.2),
    ring(lerp(waistY, chestY, 0.55), lerp(waist.a, chest.a, 0.6), lerp(waist.b, chest.b, 0.55), 0.6),
    ring(chestY, chest.a, chest.b, 1),
    ring(0.765 * h, Math.max(chest.a * 1.02, S * 0.86), chest.b * 0.93, 0.4),
    ring(shoulderY, S * 0.92, chest.b * 0.78, 0),
    ring(lerp(shoulderY, neckY, 0.55), lerp(S, neck.a, 0.55), chest.b * 0.6, -0.4),
    ring(neckY, neck.a * 1.18, neck.b * 1.15, -0.6),
  ];

  // Legs: slightly apart, as in a relaxed stance.
  const thighR = thighOf(b) / (2 * Math.PI);
  const legX = hips.a * 0.5;
  const knee = 5.9 * s * (0.75 + 0.25 * (b.w / 74));
  const calf = 5.7 * s * (0.7 + 0.3 * (b.w / 74));
  const ankle = 3.4 * s;
  const leg = (side: 1 | -1): Ring[] => {
    const x = (t: number) => side * lerp(legX, legX + 4.5 * s, t);
    const top = crotchY;
    return [
      { p: V(x(0) * 0.9, top + 12, -0.5), a: thighR * 1.1, b: thighR * 1.12 },
      { p: V(x(0.03), top - 2, 0), a: thighR, b: thighR * 1.04 },
      { p: V(x(0.35), lerp(top, kneeY, 0.55), 0.3), a: lerp(thighR, knee, 0.5), b: lerp(thighR, knee, 0.45) },
      { p: V(x(0.6), kneeY + 2, 0.6), a: knee, b: knee * 1.02 },
      { p: V(x(0.75), lerp(kneeY, ankleY, 0.32), -0.6), a: calf, b: calf * 1.08 },
      { p: V(x(0.95), ankleY + 5 * s, -0.4), a: ankle * 1.05, b: ankle * 1.1 },
      { p: V(x(1), ankleY, 0), a: ankle, b: ankle * 1.15 },
    ];
  };

  // Arms hang from the shoulder, angled just clear of the hips, elbows soft.
  const A = b.arm;
  const fA = 0.55 + 0.45 * (b.chest / 98);
  const jx = S - 4.2 * s;
  const theta = Math.asin(clamp((hips.a + 6 * s - jx) / A, 0.1, 0.42));
  const arm = (side: 1 | -1): Ring[] => {
    const J = V(side * jx, shoulderY - 5.5 * s, -0.5);
    const up = V(side * Math.sin(theta), -Math.cos(theta), 0.02).normalize();
    const fore = V(side * Math.sin(theta) * 0.85, -Math.cos(theta), 0.17).normalize();
    const Lu = 0.54 * A;
    const E = J.clone().addScaledVector(up, Lu);
    const at = (d: number) => (d <= Lu ? J.clone().addScaledVector(up, d) : E.clone().addScaledVector(fore, d - Lu));
    return [
      { p: at(-4 * s), a: 5.4 * s * fA, b: 5.8 * s * fA },
      { p: at(0), a: 5.5 * s * fA, b: 5.8 * s * fA },
      { p: at(0.25 * Lu), a: 4.9 * s * fA, b: 5.2 * s * fA },
      { p: at(0.75 * Lu), a: 4.2 * s * fA, b: 4.5 * s * fA },
      { p: at(Lu), a: 3.8 * s * fA, b: 3.7 * s * fA },
      { p: at(Lu + 0.28 * (A - Lu)), a: 4.2 * s * fA, b: 3.9 * s * fA },
      { p: at(Lu + 0.8 * (A - Lu)), a: 3 * s * fA, b: 2.7 * s * fA },
      { p: at(A), a: 2.6 * s, b: 2.2 * s },
    ];
  };

  const head = { x: 7.7 * s, y: 11.2 * s, z: 9.6 * s };
  return {
    h, neckY, shoulderY, chestY, waistY, hipY, crotchY, kneeY, ankleY,
    headC: V(0, h - head.y, 0.6 * s),
    head, neck, torso,
    legs: [leg(1), leg(-1)],
    arms: [arm(1), arm(-1)],
    armLen: A,
  };
}

/** Body ring at height y (torso), linearly between the rig's rings. */
function torsoAt(r: Rig, y: number): Ring {
  const t = r.torso;
  const lo = t[1];
  if (y <= lo.p.y) return { p: V(0, y, lo.p.z), a: t[2].a * 0.98, b: t[2].b * 0.98 };
  for (let i = 2; i < t.length; i++) {
    if (y <= t[i].p.y) {
      const k = (y - t[i - 1].p.y) / (t[i].p.y - t[i - 1].p.y);
      return { p: V(0, y, lerp(t[i - 1].p.z, t[i].p.z, k)), a: lerp(t[i - 1].a, t[i].a, k), b: lerp(t[i - 1].b, t[i].b, k) };
    }
  }
  const top = t[t.length - 1];
  return { p: V(0, y, top.p.z), a: top.a, b: top.b };
}

/** Body ring along a limb (rings ordered from the body outwards), by height or distance. */
function limbAt(rs: Ring[], y: number): Ring {
  for (let i = 1; i < rs.length; i++) {
    const [p, q] = [rs[i - 1], rs[i]];
    if (y <= p.p.y && y >= q.p.y) {
      const k = (p.p.y - y) / (p.p.y - q.p.y || 1);
      return { p: p.p.clone().lerp(q.p, k), a: lerp(p.a, q.a, k), b: lerp(p.b, q.b, k) };
    }
  }
  const last = y > rs[0].p.y ? rs[0] : rs[rs.length - 1];
  return { p: V(last.p.x, y, last.p.z), a: last.a, b: last.b };
}

/** Point and ring at distance d along a limb polyline (negative d runs back past the start). */
function alongLimb(rs: Ring[], d: number): Ring {
  if (d <= 0) {
    const dir = rs[0].p.clone().sub(rs[1].p).normalize();
    return { p: rs[1].p.clone().addScaledVector(dir, -d + rs[0].p.distanceTo(rs[1].p)), a: rs[0].a, b: rs[0].b };
  }
  let acc = 0;
  for (let i = 2; i < rs.length; i++) {
    const seg = rs[i - 1].p.distanceTo(rs[i].p);
    if (acc + seg >= d) {
      const k = (d - acc) / seg;
      return { p: rs[i - 1].p.clone().lerp(rs[i].p, k), a: lerp(rs[i - 1].a, rs[i].a, k), b: lerp(rs[i - 1].b, rs[i].b, k) };
    }
    acc += seg;
  }
  const [p, q] = [rs[rs.length - 2], rs[rs.length - 1]];
  const dir = q.p.clone().sub(p.p).normalize();
  return { p: q.p.clone().addScaledVector(dir, d - acc), a: q.a, b: q.b };
}

const limbLength = (rs: Ring[]) => rs.slice(2).reduce((acc, r, i) => acc + r.p.distanceTo(rs[i + 1].p), 0);

export type HairStyle = "short" | "buzz" | "long" | "bun" | "curly" | "bald";
export type Beard = "none" | "stubble" | "moustache" | "full";
export type Brows = "thin" | "regular" | "thick";

/** What the customer picks for their avatar's face and colouring. */
export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  beard: Beard;
  eyes: string;
  brows: Brows;
}

export interface Look extends Appearance {
  /** Face photo, drawn onto the front of the head in place of the drawn features. */
  face?: HTMLImageElement | HTMLCanvasElement | null;
}

export const SKIN_TONES = ["#f3d6c2", "#e6b999", "#cf9a74", "#a86d4a", "#7a4a33", "#4a2c1f"];
export const HAIR_COLOURS = ["#1c1714", "#3f2a1d", "#7a4d2b", "#b27a45", "#d9b46e", "#9a948c", "#a83a2a"];
export const EYE_COLOURS = ["#4a2e1f", "#7a5a2e", "#4f7a3a", "#3f6fa8", "#6f7f8c"];
export const HAIR_STYLES: { k: HairStyle; l: string }[] = [
  { k: "short", l: "Short" }, { k: "buzz", l: "Buzz cut" }, { k: "curly", l: "Curly" },
  { k: "long", l: "Long" }, { k: "bun", l: "Bun" }, { k: "bald", l: "Bald" },
];
export const BEARDS: { k: Beard; l: string }[] = [
  { k: "none", l: "Clean" }, { k: "stubble", l: "Stubble" }, { k: "moustache", l: "Moustache" }, { k: "full", l: "Full beard" },
];
export const BROWS: { k: Brows; l: string }[] = [{ k: "thin", l: "Thin" }, { k: "regular", l: "Regular" }, { k: "thick", l: "Thick" }];
export const DEFAULT_LOOK: Appearance = { skin: SKIN_TONES[1], hair: HAIR_COLOURS[0], hairStyle: "short", beard: "none", eyes: EYE_COLOURS[0], brows: "regular" };

/** Resolves `var(--token)` colours against the page so the 3D scene matches the CSS. */
export function cssColour(c: string): string {
  const m = /^var\((--[^)]+)\)$/.exec(c.trim());
  if (!m || typeof document === "undefined") return c;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#888";
}

// Cartoon shading: three flat light steps, plus an ink outline added at the end.
let RAMP: THREE.DataTexture | undefined;
function ramp() {
  if (!RAMP) {
    RAMP = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    RAMP.minFilter = THREE.NearestFilter;
    RAMP.magFilter = THREE.NearestFilter;
    RAMP.needsUpdate = true;
  }
  return RAMP;
}

const mat = (color: THREE.ColorRepresentation, _rough = 0.55, extra: { side?: THREE.Side; metalness?: number; transparent?: boolean; opacity?: number } = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: ramp(), side: extra.side, transparent: extra.transparent, opacity: extra.opacity });

const INK = new THREE.MeshBasicMaterial({ color: 0x1a1512, side: THREE.BackSide });

/** Inverted-hull outline on every mesh that doesn't opt out: the cartoon ink line. */
function addOutlines(root: THREE.Object3D, cm = 0.32) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noOutline && !m.userData.isInk && !(m as THREE.InstancedMesh).isInstancedMesh) meshes.push(m);
  });
  for (const m of meshes) {
    const src = m.geometry;
    const pos = src.getAttribute("position");
    const nrm = src.getAttribute("normal");
    if (!pos || !nrm) continue;
    const sc = (Math.abs(m.scale.x) + Math.abs(m.scale.y) + Math.abs(m.scale.z)) / 3 || 1;
    const t = cm / sc;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      arr[i * 3] = pos.getX(i) + nrm.getX(i) * t;
      arr[i * 3 + 1] = pos.getY(i) + nrm.getY(i) * t;
      arr[i * 3 + 2] = pos.getZ(i) + nrm.getZ(i) * t;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    if (src.index) g.setIndex(src.index.clone());
    const hull = new THREE.Mesh(g, INK);
    hull.userData.isInk = true;
    m.add(hull);
  }
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material) {
  const x = new THREE.Mesh(g, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
}

function ellipsoid(c: THREE.Vector3, r: { x: number; y: number; z: number }, m: THREE.Material, detail = 32) {
  const x = mesh(new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75)), m);
  x.position.copy(c);
  x.scale.set(r.x, r.y, r.z);
  return x;
}

const bare = <T extends THREE.Object3D>(o: T) => ((o.userData.noOutline = true), o);

/** Faded-edge copy of the face photo, so it blends into the skin. */
function faceTexture(img: HTMLImageElement | HTMLCanvasElement) {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const w = img.width;
  const h = img.height;
  const side = Math.min(w, h);
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, S, S);
  ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildBody(r: Rig, look: Look, withShoes = true): THREE.Group {
  const g = new THREE.Group();
  g.name = "body";
  const skin = mat(look.skin, 0.62);
  const s = r.h / 178;

  g.add(mesh(sweep(dome(dome(r.torso, "start", 0.6), "end", 0.3)), skin));
  for (const l of r.legs) g.add(mesh(sweep(dome(l, "end", 0.5)), skin));
  for (const [i, a] of r.arms.entries()) {
    g.add(mesh(sweep(dome(a, "start", 0.9)), skin));
    // Hand: flat mitten continuing the forearm, palm towards the thigh, and a thumb.
    const n = a.length;
    const dir = a[n - 1].p.clone().sub(a[n - 2].p).normalize();
    const W = a[n - 1].p;
    const along = (d: number) => W.clone().addScaledVector(dir, d);
    const hand: Ring[] = [
      { p: along(-1), a: 2.4 * s, b: 2.6 * s },
      { p: along(3 * s), a: 1.9 * s, b: 4.4 * s },
      { p: along(8 * s), a: 1.7 * s, b: 4.5 * s },
      { p: along(13 * s), a: 1.4 * s, b: 3.7 * s },
      { p: along(16.5 * s), a: 1.1 * s, b: 2.8 * s },
    ];
    g.add(mesh(sweep(dome(hand, "end", 0.9)), skin));
    const side = i === 0 ? 1 : -1;
    const tb = along(3 * s).add(V(-side * 0.6 * s, 0, 2.6 * s));
    const thumb: Ring[] = [
      { p: tb, a: 1.3 * s, b: 1.3 * s },
      { p: tb.clone().add(V(-side * 0.8 * s, -3 * s, 1.6 * s)), a: 1.05 * s, b: 1.05 * s },
      { p: tb.clone().add(V(-side * 1.2 * s, -6 * s, 1.9 * s)), a: 0.9 * s, b: 0.9 * s },
    ];
    g.add(mesh(sweep(dome(thumb, "end", 0.9), { seg: 16 }), skin));
    // Deltoid: rounds the top of the shoulder.
    g.add(ellipsoid(a[1].p.clone().add(V(side * -0.3 * s, 1.2 * s, 0)), { x: 5.6 * s, y: 5.4 * s, z: 5.8 * s }, skin));
  }

  // Neck and head.
  const neckTop = r.headC.y - r.head.y * 0.45;
  g.add(mesh(sweep([
    { p: V(0, r.neckY - 5, -0.8), a: r.neck.a * 1.1, b: r.neck.b * 1.05 },
    { p: V(0, r.neckY, -0.4), a: r.neck.a, b: r.neck.b },
    { p: V(0, neckTop, 0.1), a: r.neck.a * 0.95, b: r.neck.b * 0.98 },
  ], { steps: 3 }), skin));
  g.add(buildHead(r, look, skin));

  if (withShoes) for (const l of r.legs) g.add(shoe(l[l.length - 1].p, s));
  return g;
}

/** Head, face features, hair and beard, from the customer's appearance picks. */
export function buildHead(r: Rig, look: Look, skin = mat(look.skin)): THREE.Group {
  const g = new THREE.Group();
  const s = r.h / 178;
  const H = r.head;
  const C = r.headC;
  g.add(ellipsoid(C, H, skin, 48));
  // Jaw and chin: a narrower shape low at the front.
  const Jc = C.clone().add(V(0, -H.y * 0.42, H.z * 0.18));
  const J = { x: H.x * 0.78, y: H.y * 0.5, z: H.z * 0.72 };
  g.add(ellipsoid(Jc, J, skin));
  for (const side of [1, -1]) g.add(ellipsoid(C.clone().add(V(side * H.x * 0.98, -H.y * 0.05, -H.z * 0.05)), { x: 1 * s, y: 2.9 * s, z: 1.8 * s }, skin, 16));

  /** Point on the front of the head (or jaw) at an offset from its centre, pushed out by `out`. */
  const onHead = (x: number, y: number, out = 0) => C.clone().add(V(x, y, H.z * Math.sqrt(Math.max(0, 1 - (x / H.x) ** 2 - (y / H.y) ** 2)) + out));
  const onJaw = (x: number, y: number, out = 0) => {
    const dy = y - (Jc.y - C.y);
    return V(C.x + x, C.y + y, Jc.z + J.z * Math.sqrt(Math.max(0, 1 - (x / J.x) ** 2 - (dy / J.y) ** 2)) + out);
  };
  const hairMat = mat(look.hair);
  const tube = (pts: THREE.Vector3[], radius: number, m: THREE.Material) => bare(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, radius, 8), m));

  if (look.face) {
    const t = faceTexture(look.face);
    const fg = new THREE.SphereGeometry(1.012, 48, 32, Math.PI / 2 - 0.95, 1.9, 0.62, 1.5);
    const f = bare(new THREE.Mesh(fg, new THREE.MeshToonMaterial({ map: t, transparent: true, gradientMap: ramp(), depthWrite: false })));
    f.position.copy(C);
    f.scale.set(H.x, H.y, H.z);
    g.add(f);
  } else {
    const white = mat("#f7f4ee");
    const iris = mat(look.eyes);
    const pupil = mat("#120e0c");
    for (const side of [1, -1]) {
      const e = onHead(side * H.x * 0.36, H.y * 0.03, -0.35 * s);
      g.add(ellipsoid(e, { x: 1.5 * s, y: 0.95 * s, z: 0.6 * s }, white, 20));
      g.add(bare(ellipsoid(e.clone().add(V(0, -0.05 * s, 0.42 * s)), { x: 0.72 * s, y: 0.78 * s, z: 0.3 * s }, iris, 16)));
      g.add(bare(ellipsoid(e.clone().add(V(0, -0.05 * s, 0.62 * s)), { x: 0.36 * s, y: 0.4 * s, z: 0.15 * s }, pupil, 12)));
      g.add(bare(ellipsoid(e.clone().add(V(side * 0.22 * s, 0.25 * s, 0.72 * s)), { x: 0.16 * s, y: 0.16 * s, z: 0.08 * s }, white, 8)));
      // Eyebrow: an arc over the eye.
      const bw = { thin: 0.2, regular: 0.34, thick: 0.52 }[look.brows] * s;
      const bx = (t: number) => side * H.x * lerp(0.16, 0.56, t);
      const by = (t: number) => H.y * (0.2 + 0.035 * Math.sin(t * Math.PI)) - t * 0.4 * s;
      g.add(tube([0, 0.5, 1].map((t) => onHead(bx(t), by(t), 0.1 * s)), bw, hairMat));
    }
    // Nose and mouth.
    g.add(ellipsoid(onHead(0, -H.y * 0.2, -0.9 * s), { x: 1 * s, y: 1.6 * s, z: 1.2 * s }, skin, 16));
    const mouthY = -H.y * 0.47;
    const lipOut = (look.beard === "full" ? 0.9 : 0.05) * s;
    g.add(tube([-2.1, -1, 0, 1, 2.1].map((x) => onJaw(x * s, mouthY - (1 - Math.abs(x) / 2.1) * 0.3 * s, lipOut)), 0.26 * s, mat("#7d3f3a")));
  }

  // Beard, stubble and moustache in the hair colour.
  if (look.beard === "stubble" || look.beard === "full") {
    const full = look.beard === "full";
    const shell = mesh(new THREE.SphereGeometry(1, 36, 18, Math.PI / 2 - 1.35, 2.7, Math.PI * (full ? 0.53 : 0.5), Math.PI * (full ? 0.36 : 0.42)), full ? hairMat : mat(look.hair, 0, { transparent: true, opacity: 0.35 }));
    shell.position.copy(Jc);
    shell.scale.set(J.x * (full ? 1.1 : 1.02), J.y * (full ? 1.12 : 1.02), J.z * (full ? 1.12 : 1.02));
    if (!full) bare(shell);
    g.add(shell);
  }
  if (look.beard === "moustache" || look.beard === "full") {
    const my = -H.y * 0.4;
    g.add(tube([-2.6, -1.3, 0, 1.3, 2.6].map((x) => onJaw(x * s, my - (Math.abs(x) / 2.6) * 0.8 * s, 0.35 * s)), 0.55 * s, hairMat));
  }

  // Hair.
  const cap = (scale = 1.07, tilt = -0.32, cover = 0.52) => {
    const hcap = mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * cover), hairMat);
    hcap.position.copy(C).add(V(0, H.y * 0.04, -H.z * 0.06));
    hcap.scale.set(H.x * scale, H.y * (scale - 0.02), H.z * (scale + 0.01));
    hcap.rotation.x = tilt;
    return hcap;
  };
  switch (look.hairStyle) {
    case "short":
      g.add(cap());
      break;
    case "buzz":
      g.add(cap(1.03, -0.22, 0.5));
      break;
    case "bun": {
      g.add(cap(1.05));
      g.add(ellipsoid(C.clone().add(V(0, H.y * 0.9, -H.z * 0.55)), { x: 3.8 * s, y: 3.4 * s, z: 3.8 * s }, hairMat, 24));
      break;
    }
    case "long": {
      g.add(cap(1.08));
      const len = H.y * 1.45;
      const curtain = mesh(new THREE.CylinderGeometry(1, 1.14, 1, 40, 4, true, Math.PI / 2 - 0.42, Math.PI + 0.84), mat(look.hair, 0, { side: THREE.DoubleSide }));
      curtain.position.copy(C).add(V(0, -len / 2 + H.y * 0.25, -H.z * 0.12));
      curtain.scale.set(H.x * 1.1, len, H.z * 1.02);
      g.add(curtain);
      break;
    }
    case "curly": {
      const n = 260;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2;
        const rr = Math.sqrt(1 - y * y);
        const th = i * 2.39996;
        const x = Math.cos(th) * rr;
        const z = Math.sin(th) * rr;
        const face = z > 0.35 && y < 0.5;
        if (y > -0.15 && !face) pts.push(V(x, y, z));
        else if (z < -0.2 && y > -0.55) pts.push(V(x, y, z));
      }
      const geo = new THREE.SphereGeometry(2.4 * s, 12, 8);
      const curls = new THREE.InstancedMesh(geo, hairMat, pts.length);
      const inkCurls = new THREE.InstancedMesh(geo, INK, pts.length);
      const m4 = new THREE.Matrix4();
      pts.forEach((q, i) => {
        const p = C.clone().add(V(q.x * H.x * 1.08, q.y * H.y * 1.04 + H.y * 0.06, q.z * H.z * 1.08));
        m4.makeTranslation(p.x, p.y, p.z);
        curls.setMatrixAt(i, m4);
        inkCurls.setMatrixAt(i, m4.clone().multiply(new THREE.Matrix4().makeScale(1.14, 1.14, 1.14)));
      });
      curls.castShadow = true;
      curls.userData.noOutline = true;
      inkCurls.userData.isInk = true;
      g.add(curls, inkCurls);
      break;
    }
    case "bald":
      break;
  }
  return g;
}

/** Just the head and shoulders, for appearance cards. */
export function buildBust(body: Body, look: Look): THREE.Group {
  const r = rigFor(body);
  const g = new THREE.Group();
  const skin = mat(look.skin);
  g.add(buildHead(r, look, skin));
  g.add(mesh(sweep([
    { p: V(0, r.neckY - 5, -0.8), a: r.neck.a * 1.1, b: r.neck.b * 1.05 },
    { p: V(0, r.headC.y - r.head.y * 0.45, 0.1), a: r.neck.a * 0.95, b: r.neck.b * 0.98 },
  ], { steps: 2 }), skin));
  addOutlines(g);
  return g;
}

function shoe(ankle: THREE.Vector3, s: number): THREE.Group {
  const g = new THREE.Group();
  const x = ankle.x * 1.05;
  const y = 4.2 * s;
  const upper: Ring[] = [
    { p: V(x, y, -7 * s), a: 4.2 * s, b: 4.3 * s },
    { p: V(x, y, -1 * s), a: 4.7 * s, b: 4.6 * s },
    { p: V(x, y * 0.92, 8 * s), a: 5 * s, b: 3.7 * s },
    { p: V(x, y * 0.82, 15 * s), a: 4.6 * s, b: 3 * s },
    { p: V(x, y * 0.75, 19 * s), a: 3.6 * s, b: 2.4 * s },
  ];
  g.add(mesh(sweep(dome(dome(upper, "start", 0.5), "end", 0.9), { fwd: V(0, 1, 0), seg: 28 }), mat("#1d1c1b", 0.6)));
  const sole = mesh(new THREE.BoxGeometry(10 * s, 2 * s, 29 * s), mat("#efece6", 0.8));
  sole.position.set(x, 1 * s, 5.5 * s);
  g.add(sole);
  // Collar round the ankle.
  const col = mesh(sweep([
    { p: V(x, 5 * s, -3.5 * s), a: 4.3 * s, b: 5 * s },
    { p: V(x, 9 * s, -3.8 * s), a: 3.9 * s, b: 4.6 * s },
  ], { steps: 2, seg: 28 }), mat("#1d1c1b", 0.6, { side: THREE.DoubleSide }));
  g.add(col);
  return g;
}

// ── Garments ──────────────────────────────────────────────────────────────

export type Slot = "top" | "outer" | "bottom" | "head";

export interface Wear {
  id: string;
  slot: Slot;
  shape?: FitShape;
  fitStyle?: FitStyle;
  m?: Measurements;
  colour: string;
  /** Fit level per zone name from lib/fit (e.g. "Chest" → -1), for the heat view. */
  zones: Record<string, Level>;
  /** Short cargo pockets, knee panels and so on come from the product's name. */
  name: string;
}

export const HEAT: Record<Level, string> = { [-2]: "#e0321b", [-1]: "#f28c3c", 0: "#3aa76d", 1: "#5b9bd5", 2: "#2f5fc4" };

interface Tube {
  rings: Ring[];
  kind: "torso" | "sleeve-l" | "sleeve-r" | "leg-l" | "leg-r";
}

/** Garment rings already built, so an outer layer sits over what's under it. */
type Floor = Tube[];

function floorAt(floor: Floor, kind: Tube["kind"], y: number): { a: number; b: number } | undefined {
  let best: { a: number; b: number } | undefined;
  for (const t of floor) {
    if (t.kind !== kind) continue;
    const rs = t.rings;
    const top = Math.max(rs[0].p.y, rs[rs.length - 1].p.y);
    const bot = Math.min(rs[0].p.y, rs[rs.length - 1].p.y);
    if (y > top + 0.5 || y < bot - 0.5) continue;
    const sorted = [...rs].sort((p, q) => q.p.y - p.p.y);
    const r = limbAt(sorted, y);
    if (!best || r.a > best.a) best = { a: r.a, b: r.b };
  }
  return best;
}

/** Heat view: parts with no measured zone go neutral grey so only scored zones carry colour. */
const colourOf = (w: Wear, heat: boolean, zone?: string) =>
  new THREE.Color(!heat ? w.colour : zone && w.zones[zone] !== undefined ? HEAT[w.zones[zone]] : "#9d9992");

const circ = (r: { a: number; b: number }) => ellipsePerimeter(r.a, r.b);

/** Inflate a body ring by `k` (garment circumference ÷ body circumference), never inside `min`. */
function inflate(body: Ring, k: number, gap: number, under?: { a: number; b: number }): Ring {
  const a = Math.max(body.a * k, body.a + gap, (under?.a ?? 0) + 0.8);
  const b = Math.max(body.b * lerp(1, k, 0.85), body.b + gap, (under?.b ?? 0) + 0.8);
  return { p: body.p.clone(), a, b };
}

function fabric(_w: Wear) {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp(), side: THREE.DoubleSide });
}

function band(y: number, at: Ring, h: number, color: THREE.Color, grow = 0.35): THREE.BufferGeometry {
  return sweep([
    { p: V(at.p.x, y - h / 2, at.p.z), a: at.a + grow * 0.5, b: at.b + grow * 0.5, c: color },
    { p: V(at.p.x, y, at.p.z), a: at.a + grow, b: at.b + grow, c: color },
    { p: V(at.p.x, y + h / 2, at.p.z), a: at.a + grow * 0.5, b: at.b + grow * 0.5, c: color },
  ], { steps: 3 });
}

const darker = (c: THREE.Color, f = 0.78) => c.clone().multiplyScalar(f);

function buildTop(r: Rig, w: Wear, layer: number, floor: Floor, heat: boolean): THREE.Group {
  const g = new THREE.Group();
  const m = w.m ?? {};
  const s = r.h / 178;
  const gap = 1.1 + layer * 0.9;
  const mt = fabric(w);
  const base = new THREE.Color(w.colour);

  const hps = r.neckY - 0.5; // high point shoulder, where length is measured from
  const length = m.length ?? 70 * s;
  const hemY = Math.max(r.crotchY - 18 * s, hps - length);
  const k = (G: number | undefined, y: number, fallback: number) => (G ? Math.max(0.9, (G * 2) / circ(torsoAt(r, y))) : fallback);
  const kc = k(m.chestW, r.chestY, 1.1);
  const kw = k(m.waistW, r.waistY, kc * 0.97);
  const kh = k(m.hemW, Math.max(hemY, r.crotchY + 2), kw);

  const heights = [hemY, hemY + 3, ...r.torso.map((t) => t.p.y).filter((y) => y > hemY + 4 && y < r.shoulderY - 5)].sort((p, q) => p - q);
  const kAt = (y: number) =>
    y <= r.waistY ? lerp(kh, kw, clamp((y - hemY) / (r.waistY - hemY || 1), 0, 1)) : y <= r.chestY ? lerp(kw, kc, (y - r.waistY) / (r.chestY - r.waistY)) : kc;
  const zoneAt = (y: number) => (y < hemY + 4 ? "Hem" : y < lerp(r.waistY, r.chestY, 0.4) ? "Waist" : y < r.shoulderY - 3 ? "Chest" : "Shoulders");

  const rings: Ring[] = heights.map((y) => {
    const body = torsoAt(r, y);
    const rr = inflate(body, kAt(y), gap, floorAt(floor, "torso", y));
    // Loose garments hang straight rather than following the body in at the waist.
    if (y < r.chestY && kc > 1.12) rr.a = Math.max(rr.a, lerp(rr.a, torsoAt(r, r.chestY).a * kc * 0.97, 0.6));
    rr.c = colourOf(w, heat, zoneAt(y));
    return rr;
  });
  // Shoulders: the garment's shoulder width, dropped past the body's when it's wider.
  const shoulderHalf = Math.max((m.shoulder ?? r.torso[8].a * 2) / 2, r.torso[8].a + gap);
  const bodyTop = torsoAt(r, r.shoulderY);
  // Shoulders: a rounded quarter-ellipse from the shoulder point in to the neckline,
  // a little wider when the garment's shoulder seam drops past the body's.
  const sa = Math.max(bodyTop.a + gap, Math.min(shoulderHalf, bodyTop.a + gap + 2.5));
  const sb = Math.max(bodyTop.b + gap, rings[rings.length - 1].b * 0.92);
  const neckOpen = (w.shape === "tee" ? 1.8 : 1.2) + layer * 0.4;
  const [na, nb] = [r.neck.a + neckOpen, r.neck.b + neckOpen];
  const y0 = r.shoulderY - 4;
  const y1 = r.neckY - 0.8;
  for (let i = 0; i <= 5; i++) {
    const t = (i / 5) * (Math.PI / 2);
    const y = y0 + (y1 - y0) * Math.sin(t);
    const under = floorAt(floor, "torso", y);
    rings.push({
      p: V(0, y, lerp(bodyTop.p.z, -0.6, i / 5)),
      a: Math.max(na + (sa - na) * Math.cos(t), (under?.a ?? 0) + 0.8),
      b: Math.max(nb + (sb - nb) * Math.pow(Math.cos(t), 0.6), (under?.b ?? 0) + 0.8),
      c: colourOf(w, heat, i < 4 ? "Shoulders" : undefined),
    });
  }
  g.add(mesh(sweep(rings, { steps: 4 }), mt));
  floor.push({ rings, kind: "torso" });

  // Hem band and neckline trims.
  const trim = darker(base);
  const ribbed = w.shape !== "tee";
  if (ribbed) g.add(mesh(band(hemY + 2.2, rings[0], 4.4, heat ? colourOf(w, true, "Hem") : trim, 0.3), mt));
  g.add(mesh(band(r.neckY - 0.6, rings[rings.length - 1], 1.6, trim, 0.4), mt));

  // Sleeves: from inside the shoulder to the sleeve length past the dropped seam.
  const hasSleeves = m.sleeve !== undefined || w.shape === "tee";
  if (hasSleeves) {
    const drop = Math.max(0, shoulderHalf - r.torso[8].a);
    const sleeve = m.sleeve ?? 22 * s;
    for (const [i, arm] of r.arms.entries()) {
      const A = limbLength(arm);
      const end = Math.min(sleeve + drop * 0.8, A + 2 * s);
      const over = sleeve + drop * 0.8 - end;
      const ks = clamp(1 + (kc - 1) * 1.7, 1.08, 1.75);
      const kind = i === 0 ? "sleeve-l" : "sleeve-r";
      const ds = [-2, 5, ...[0.2, 0.45, 0.7, 0.9].map((t) => t * end), end - 3, end].filter((d, j, xs) => d <= end && (j === 0 || d > xs[j - 1]));
      const srs: Ring[] = ds.map((d, j) => {
        const b0 = alongLimb(arm, d);
        // The sleeve head sits snug under the shoulder so it never pokes above it.
        if (j === 0) return { p: b0.p, a: b0.a + gap, b: b0.b + gap, c: colourOf(w, heat, "Sleeves") };
        // A dropped shoulder makes the top of the sleeve roomier, tapering by the elbow.
        const top = drop * 0.35 * clamp(1 - d / (0.5 * A), 0, 1);
        const flare = over > 0 && d > end - 6 ? 1 + Math.min(0.35, over / 18) : 1;
        const under = floorAt(floor, kind, b0.p.y);
        return {
          p: b0.p,
          a: Math.max(b0.a * ks * flare + top, b0.a + gap, (under?.a ?? 0) + 0.7),
          b: Math.max(b0.b * ks * flare + top, b0.b + gap, (under?.b ?? 0) + 0.7),
          c: colourOf(w, heat, "Sleeves"),
        };
      });
      g.add(mesh(sweep(srs, { seg: 32, steps: 4 }), mt));
      floor.push({ rings: srs, kind });
      if (ribbed && end > A * 0.7) {
        const cuff = srs[srs.length - 1];
        const dir = cuff.p.clone().sub(srs[srs.length - 2].p).normalize();
        g.add(mesh(sweep([
          { p: cuff.p.clone().addScaledVector(dir, -4), a: cuff.a * 0.92, b: cuff.b * 0.92, c: trim },
          { p: cuff.p.clone().addScaledVector(dir, -2), a: cuff.a * 0.97 + 0.2, b: cuff.b * 0.97 + 0.2, c: trim },
          { p: cuff.p.clone(), a: cuff.a * 0.9, b: cuff.b * 0.9, c: trim },
        ], { seg: 32, steps: 2 }), mt));
      }
    }
  }

  const front = (y: number) => {
    const rr = limbAt([...rings].sort((p, q) => q.p.y - p.p.y), y);
    return rr.p.z + rr.b;
  };

  if (w.shape === "jacket") {
    // Zip down the centre front and a stand collar.
    const zipTop = r.neckY + 5;
    const zmat = mat("#bdb8ae", 0.3, { metalness: 0.7 });
    const pts: THREE.Vector3[] = [];
    for (let y = hemY + 0.5; y <= r.neckY - 1; y += 3) pts.push(V(0, y, front(y) + 0.15));
    if (pts.length > 1) {
      const zip = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.35, 6), zmat);
      g.add(zip);
    }
    const collar: Ring[] = [
      { p: V(0, r.neckY - 1.5, -0.5), a: r.neck.a + 2 + layer * 0.4, b: r.neck.b + 2 + layer * 0.4, c: rings[rings.length - 1].c },
      { p: V(0, zipTop - 1, -0.3), a: r.neck.a + 1.9, b: r.neck.b + 2, c: rings[rings.length - 1].c },
      { p: V(0, zipTop, -0.3), a: r.neck.a + 1.7, b: r.neck.b + 1.8, c: trim },
    ];
    g.add(mesh(sweep(collar, { steps: 3 }), mt));
    if (m.sleeve === undefined) {
      // Vest: quilted channels.
      for (let y = hemY + 9; y < r.chestY + 6; y += 9) {
        const at = limbAt([...rings].sort((p, q) => q.p.y - p.p.y), y);
        g.add(mesh(band(y, at, 0.8, darker(base, 0.7), 0.05), mt));
      }
    }
  }

  if (w.shape === "hoodie" && !/quarter|crew/i.test(w.name)) {
    // Hood lying on the upper back, drawcords and a kangaroo pocket.
    const hood = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mt);
    const hc = new THREE.Color(w.colour);
    const ca = hood.geometry.getAttribute("position");
    const cols: number[] = [];
    for (let i = 0; i < ca.count; i++) cols.push(hc.r, hc.g, hc.b);
    hood.geometry.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    hood.position.set(0, r.neckY - 3.5 * s, -r.neck.b - 3 * s);
    hood.scale.set(r.neck.a + 7 * s, 7 * s, 8 * s);
    hood.rotation.x = -1.15;
    g.add(hood);
    const cord = mat("#efece6", 0.6);
    for (const side of [1, -1]) {
      const x = side * 2.6 * s;
      const c = new THREE.CatmullRomCurve3([V(x, r.neckY - 1.5, front(r.neckY - 3) + 0.4), V(x * 1.1, r.neckY - 10 * s, front(r.neckY - 10 * s) + 0.5), V(x * 1.15, r.neckY - 20 * s, front(r.neckY - 20 * s) + 0.5)]);
      g.add(mesh(new THREE.TubeGeometry(c, 12, 0.35, 6), cord));
    }
    const py = lerp(hemY, r.waistY, 0.45);
    const pocket = mesh(new THREE.BoxGeometry(26 * s, 15 * s, 1), mat(darker(base, 0.9), 0.9));
    pocket.position.set(0, py + 7.5 * s, front(py + 7.5 * s) - 0.1);
    g.add(pocket);
  } else if (w.shape === "hoodie") {
    // Quarter-zip or crew: collar / neck rib only.
    if (/quarter/i.test(w.name)) {
      const zmat = mat("#bdb8ae", 0.3, { metalness: 0.7 });
      const zip = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, r.neckY - 17 * s, front(r.neckY - 17 * s) + 0.15), V(0, r.neckY - 2, front(r.neckY - 2) + 0.1)]), 8, 0.35, 6), zmat);
      g.add(zip);
      g.add(mesh(sweep([
        { p: V(0, r.neckY - 1.5, -0.5), a: r.neck.a + 2, b: r.neck.b + 2.1, c: base },
        { p: V(0, r.neckY + 5, -0.3), a: r.neck.a + 1.6, b: r.neck.b + 1.8, c: trim },
      ], { steps: 2 }), mt));
    }
  }
  return g;
}

function buildBottom(r: Rig, w: Wear, floor: Floor, heat: boolean): THREE.Group {
  const g = new THREE.Group();
  const m = w.m ?? {};
  const s = r.h / 178;
  const gap = 1;
  const mt = fabric(w);
  const base = new THREE.Color(w.colour);

  const rise = m.rise ?? 28 * s;
  const wbY = Math.min(r.crotchY + rise, r.chestY - 8);
  const kWaist = m.waistW ? (m.waistW * 2) / circ(torsoAt(r, wbY)) : 1.03;
  const kHip = m.hipW ? (m.hipW * 2) / circ(torsoAt(r, r.hipY)) : 1.08;
  const pelvis: Ring[] = [
    { ...inflate(torsoAt(r, r.crotchY + 4), Math.max(1.02, kHip * 0.97), gap), c: colourOf(w, heat, "Hips") },
    { ...inflate(torsoAt(r, r.hipY), Math.max(1, kHip), gap), c: colourOf(w, heat, "Hips") },
    { ...inflate(torsoAt(r, lerp(r.hipY, wbY, 0.6)), Math.max(1, lerp(kHip, kWaist, 0.6)), gap), c: colourOf(w, heat, "Rise") },
    { ...inflate(torsoAt(r, wbY), Math.max(0.995, kWaist), gap * 0.8), c: colourOf(w, heat, "Waist") },
  ];
  g.add(mesh(sweep(dome(pelvis, "start", 0.5), { steps: 4 }), mt));
  floor.push({ rings: pelvis, kind: "torso" });
  // Waistband and belt loops.
  const wb = pelvis[pelvis.length - 1];
  g.add(mesh(band(wbY - 2, { ...wb, p: V(0, wbY - 2, wb.p.z) }, 4, heat ? colourOf(w, true, "Waist") : darker(base, 0.85), 0.25), mt));

  // Legs: thigh from the garment's thigh width, then straight to the opening.
  const thighC = m.thighW ? m.thighW * 2 : thighOf({ hips: 100 } as Body) * 1.15;
  const inseam = m.inseam ?? r.crotchY - 3;
  const hemRaw = r.crotchY - inseam;
  const hemY = Math.max(1.2, hemRaw);
  const stack = Math.max(0, 1.2 - hemRaw); // extra length that breaks over the shoe
  const opening = Math.max(thighC * (w.fitStyle === "slim" ? 0.62 : 0.76), 0);
  const short = inseam < 0.45 * r.crotchY;
  for (const [i, leg] of r.legs.entries()) {
    const kind = i === 0 ? "leg-l" : "leg-r";
    const ys = [r.crotchY + 4, r.crotchY - 3, lerp(r.crotchY, r.kneeY, 0.5), r.kneeY + 2, lerp(r.kneeY, r.ankleY, 0.45), hemY + 3, hemY].filter((y, j, xs) => y >= hemY && (j === 0 || y < xs[j - 1] - 0.5));
    const rings: Ring[] = ys.map((y) => {
      const body = limbAt(leg, y);
      const t = clamp((r.crotchY - 3 - y) / (r.crotchY - 3 - hemY || 1), 0, 1);
      const want = lerp(thighC, opening, Math.pow(t, 0.8)) / (2 * Math.PI);
      const breakOut = stack > 0 && y < hemY + 8 ? 1 + Math.min(0.25, stack / 20) : 1;
      const zone = y > lerp(r.crotchY, r.kneeY, 0.6) ? "Thigh" : y < hemY + 6 ? "Leg length" : "Thigh";
      return {
        p: V(body.p.x * (y > r.crotchY ? 0.92 : 1), y, body.p.z * 0.4),
        a: Math.max(want * 0.94 * breakOut, body.a + gap),
        b: Math.max(want * 1.08 * breakOut, body.b + gap),
        c: colourOf(w, heat, zone),
      };
    });
    g.add(mesh(sweep(rings, { steps: 4 }), mt));
    floor.push({ rings, kind });
    const side = i === 0 ? 1 : -1;
    if (/knee/i.test(w.name) && !short && !heat) {
      // Double-knee panels on the front of each leg.
      const knee = limbAt(rings, r.kneeY + 2);
      const panel = mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, -0.9, 1.8), mat(darker(base, 0.88), 0.9, { side: THREE.DoubleSide }));
      panel.position.set(knee.p.x, r.kneeY + 3, knee.p.z);
      panel.scale.set(knee.a + 0.35, 20 * s, knee.b + 0.35);
      g.add(panel);
    }
    if (short && !heat) {
      // Cargo pockets on the outer thigh.
      const at = limbAt(rings, hemY + 10 * s);
      const pk = mesh(new THREE.BoxGeometry(2, 13 * s, 12 * s), mat(darker(base, 0.9), 0.9));
      pk.position.set(at.p.x + side * (at.a + 0.4), hemY + 10 * s, at.p.z);
      g.add(pk);
    }
    g.add(mesh(band(hemY + 1, rings[rings.length - 1], 2, heat ? colourOf(w, true, "Leg length") : darker(base, 0.85), 0.15), mt));
  }
  return g;
}

function buildCap(r: Rig, w: Wear): THREE.Group {
  const g = new THREE.Group();
  const H = r.head;
  const c = new THREE.Color(w.colour);
  const m = mat(c, 0.8, { side: THREE.DoubleSide });
  const crown = mesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
  crown.position.copy(r.headC).add(V(0, H.y * 0.18, -H.z * 0.02));
  crown.scale.set(H.x * 1.12, H.y * 0.78, H.z * 1.1);
  crown.rotation.x = -0.12;
  g.add(crown);
  const brim = mesh(new THREE.CylinderGeometry(1, 1, 0.5, 40, 1, false, -Math.PI / 2 - 1.2, 2.4), m);
  brim.position.copy(r.headC).add(V(0, H.y * 0.2, H.z * 0.55));
  brim.scale.set(H.x * 1.05, 1, H.z * 1.2);
  brim.rotation.x = 0.12;
  g.add(brim);
  const button = ellipsoid(r.headC.clone().add(V(0, H.y * 0.97, -H.z * 0.12)), { x: 0.9, y: 0.5, z: 0.9 }, mat(darker(c, 0.7), 0.7), 12);
  g.add(button);
  return g;
}

const ORDER: Slot[] = ["bottom", "top", "outer", "head"];

/**
 * The dressed avatar. Layers go on bottoms first, then tops, then outerwear.
 * `bodyless` draws only the clothes, as on a wardrobe card.
 */
export function buildAvatar(body: Body, look: Look, wear: Wear[], heat: boolean, bodyless = false): THREE.Group {
  const r = rigFor(body);
  const g = new THREE.Group();
  if (!bodyless) g.add(buildBody(r, look));
  const floor: Floor = [];
  const sorted = [...wear].sort((p, q) => ORDER.indexOf(p.slot) - ORDER.indexOf(q.slot));
  let layer = 1;
  for (const w of sorted) {
    if (w.slot === "bottom") g.add(buildBottom(r, w, floor, heat));
    else if (w.slot === "head") g.add(buildCap(r, w));
    else g.add(buildTop(r, w, layer++, floor, heat));
  }
  addOutlines(g);
  return g;
}

export function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mm === INK) return;
    if (Array.isArray(mm)) mm.forEach((q) => q.dispose());
    else if (mm) {
      const map = (mm as THREE.MeshStandardMaterial).map;
      if (map && map !== RAMP) map.dispose();
      mm.dispose();
    }
  });
}
