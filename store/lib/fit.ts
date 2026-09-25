// Fit engine: compares a garment's flat measurements with the customer's body,
// zone by zone, and recommends the size whose zones land closest to the ease
// the cut is designed for. Pure functions only (no React, no store), so it can
// be unit-tested with `npm test` and later moved to a server unchanged.

import type { FitStyle, Measurements, Product } from "./data";

// ── Body ───────────────────────────────────────────────────────────────────

export type BodyKey = "chest" | "waist" | "hips" | "shoulder" | "arm" | "inseam";

/** What the customer saved: height and weight, plus any measurement they overrode. */
export type BodyProfile = { h: number; w: number } & Partial<Record<BodyKey, number>>;
export type Body = { h: number; w: number } & Record<BodyKey, number>;

export const BODY_FIELDS: { k: BodyKey; l: string; hint: string; min: number; max: number }[] = [
  { k: "chest", l: "Chest", hint: "Around the fullest part, under the arms", min: 70, max: 160 },
  { k: "waist", l: "Waist", hint: "Around the navel, relaxed", min: 55, max: 160 },
  { k: "hips", l: "Hips", hint: "Around the fullest part of the seat", min: 70, max: 170 },
  { k: "shoulder", l: "Shoulder width", hint: "Across the back, shoulder point to shoulder point", min: 32, max: 62 },
  { k: "arm", l: "Arm length", hint: "Shoulder point to wrist bone, arm relaxed", min: 48, max: 80 },
  { k: "inseam", l: "Inseam", hint: "Crotch to floor, barefoot", min: 60, max: 100 },
];

export const HEIGHT_RANGE = [150, 200] as const;
export const WEIGHT_RANGE = [45, 130] as const;

const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Typical measurements for a height and weight, from adult anthropometric
 * averages fitted to the size chart (178 cm / 74 kg → chest 98, waist 84).
 * Only a starting point: every value can be overridden.
 */
export function estimateBody(h: number, w: number): Body {
  const bmi = w / (h / 100) ** 2;
  const dB = bmi - 23.4;
  const dH = h - 178;
  const est: Record<BodyKey, number> = {
    chest: 98 + 2.6 * dB + 0.25 * dH,
    waist: 84 + 3.2 * dB + 0.2 * dH,
    hips: 97 + 2.3 * dB + 0.3 * dH,
    shoulder: 45 + 0.35 * dB + 0.2 * dH,
    arm: 0.355 * h,
    inseam: 0.45 * h,
  };
  const body = { h, w } as Body;
  for (const f of BODY_FIELDS) body[f.k] = Math.round(cl(est[f.k], f.min, f.max));
  return body;
}

/** The body the engine uses: saved overrides on top of the estimate. */
export function resolveBody(p: BodyProfile): Body {
  const body = estimateBody(p.h, p.w);
  for (const f of BODY_FIELDS) {
    const v = p[f.k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) body[f.k] = v;
  }
  return body;
}

/** Derived lengths the profile doesn't ask for. */
export const torsoLength = (b: Body) => 0.4 * b.h; // high shoulder point to where a regular top ends
export const bodyRise = (b: Body) => 0.16 * b.h; // crotch to natural waist
export const thighOf = (b: Body) => 0.575 * b.hips;

// ── Zones ──────────────────────────────────────────────────────────────────

export type Level = -2 | -1 | 0 | 1 | 2;

const CIRC_WORDS = ["Too tight", "Snug", "Right", "Relaxed", "Too loose"];
const LEN_WORDS = ["Too short", "Short", "Right", "Long", "Too long"];

interface ZoneSpec {
  k: string;
  kind: "circ" | "len";
  /** Garment value compared with the body value; undefined when the garment isn't measured there. */
  garment: (m: Measurements, b: Body) => number | undefined;
  body: (b: Body) => number;
  /** Target of garment − body for each cut. */
  ease: Record<FitStyle, number>;
  /** cm per step on the five-step scale. */
  tol: number;
  /** Garment − body below this can't be worn comfortably at all. */
  floor?: number;
  weight: number;
  note: (diff: number, delta: number) => string;
}

const sign = (n: number) => (Math.round(n) > 0 ? `+${Math.round(n)}` : Math.round(n) < 0 ? `−${Math.abs(Math.round(n))}` : "±0");
const pos = (n?: number) => (typeof n === "number" && n > 0 ? n : undefined);
const easeNote = (diff: number) => `${sign(diff)} cm ease`;
const idealNote = (_: number, delta: number) => `${sign(delta)} cm vs ideal`;

const TOP_ZONES: ZoneSpec[] = [
  {
    k: "Shoulders", kind: "circ", garment: (m) => pos(m.shoulder), body: (b) => b.shoulder,
    ease: { slim: 0, regular: 2, oversized: 9 }, tol: 2.5, floor: -3, weight: 2,
    note: (d) => `${sign(d)} cm vs your shoulders`,
  },
  {
    k: "Chest", kind: "circ", garment: (m) => (pos(m.chestW) ? m.chestW! * 2 : undefined), body: (b) => b.chest,
    ease: { slim: 8, regular: 14, oversized: 22 }, tol: 4, floor: 0, weight: 3, note: easeNote,
  },
  {
    k: "Waist", kind: "circ", garment: (m) => (pos(m.waistW) ? m.waistW! * 2 : undefined), body: (b) => b.waist,
    ease: { slim: 16, regular: 24, oversized: 32 }, tol: 8, floor: 0, weight: 2, note: easeNote,
  },
  {
    k: "Hem", kind: "circ", garment: (m) => (pos(m.hemW) ? m.hemW! * 2 : undefined), body: (b) => b.hips,
    ease: { slim: 8, regular: 14, oversized: 20 }, tol: 8, floor: -4, weight: 1, note: easeNote,
  },
  {
    // A dropped shoulder seam sits further down the arm, so it counts towards reach.
    k: "Sleeves", kind: "len",
    garment: (m, b) => (m.sleeve && m.sleeve >= 45 ? m.sleeve + Math.max(0, ((m.shoulder ?? b.shoulder) - b.shoulder) / 2) : undefined),
    body: (b) => b.arm,
    ease: { slim: 0, regular: 1, oversized: 2 }, tol: 2.5, weight: 1.5,
    note: (d) => (Math.round(d) >= 0 ? `ends ${Math.round(d)} cm past your wrist` : `ends ${-Math.round(d)} cm above your wrist`),
  },
  {
    k: "Length", kind: "len", garment: (m) => pos(m.length), body: torsoLength,
    ease: { slim: 0, regular: 1, oversized: 2 }, tol: 3, weight: 1.5, note: idealNote,
  },
];

const BOTTOM_ZONES: ZoneSpec[] = [
  {
    k: "Waist", kind: "circ", garment: (m) => (pos(m.waistW) ? m.waistW! * 2 : undefined), body: (b) => b.waist,
    ease: { slim: 0, regular: 2, oversized: 4 }, tol: 3, floor: -3, weight: 3, note: easeNote,
  },
  {
    k: "Hips", kind: "circ", garment: (m) => (pos(m.hipW) ? m.hipW! * 2 : undefined), body: (b) => b.hips,
    ease: { slim: 5, regular: 10, oversized: 16 }, tol: 4, floor: 0, weight: 2, note: easeNote,
  },
  {
    k: "Thigh", kind: "circ", garment: (m) => (pos(m.thighW) ? m.thighW! * 2 : undefined), body: thighOf,
    ease: { slim: 5, regular: 9, oversized: 14 }, tol: 3, floor: 0, weight: 1.5, note: easeNote,
  },
  {
    // Shorts end well above the ankle by design, so their inseam isn't scored.
    k: "Leg length", kind: "len", garment: (m, b) => (m.inseam && m.inseam >= 0.6 * b.inseam ? m.inseam : undefined), body: (b) => b.inseam,
    ease: { slim: 0, regular: 1, oversized: 2 }, tol: 2.5, weight: 1.5,
    note: (d) => `${sign(d)} cm vs your inseam`,
  },
  {
    k: "Rise", kind: "len", garment: (m) => pos(m.rise), body: bodyRise,
    ease: { slim: -2, regular: 0, oversized: 1 }, tol: 2.5, weight: 1, note: idealNote,
  },
];

export interface ZoneFit {
  k: string;
  kind: "circ" | "len";
  /** Garment minus body, in cm (ease for circumferences). */
  diff: number;
  /** diff minus the ease this cut aims for; 0 is ideal. */
  delta: number;
  level: Level;
  label: string;
  /** e.g. "+6 cm ease" */
  note: string;
  /** Compact form for tight layouts, e.g. "+6 cm". */
  short: string;
  /** Five bar segments, tight ← → loose; the lit one carries the level colour. */
  bar: string[];
}

export function levelOf(delta: number, tol: number, diff?: number, floor?: number): Level {
  if (floor !== undefined && diff !== undefined && diff < floor) return -2;
  const s = delta / tol;
  return s < -1.5 ? -2 : s < -0.5 ? -1 : s <= 0.5 ? 0 : s <= 1.5 ? 1 : 2;
}

export const barOf = (level: Level) =>
  [0, 1, 2, 3, 4].map((i) => (i === level + 2 ? (Math.abs(level) === 2 ? "var(--color-accent)" : "var(--color-text)") : "var(--color-neutral-200)"));

export interface SizeFit {
  size: string;
  zones: ZoneFit[];
  /** Lower is better. */
  score: number;
  verdict: string;
  verdictAccent: boolean;
}

type Garment = Pick<Product, "shape" | "category" | "fitStyle" | "sizes" | "measurements">;
const bottom = (g: Garment) => (g.shape ? g.shape === "pants" : g.category === "bottoms");

/** Fit of one size on one body. Undefined when that size has no measurements. */
export function fitSize(g: Garment, body: Body, size: string): SizeFit | undefined {
  const m = g.measurements?.[size];
  if (!m) return undefined;
  const style = g.fitStyle ?? "regular";
  const zones: ZoneFit[] = [];
  let score = 0;
  let mean = 0;
  let weights = 0;
  for (const z of bottom(g) ? BOTTOM_ZONES : TOP_ZONES) {
    const gv = z.garment(m, body);
    if (gv === undefined) continue;
    const diff = gv - z.body(body);
    const delta = diff - z.ease[style];
    const level = levelOf(delta, z.tol, diff, z.floor);
    const words = z.kind === "circ" ? CIRC_WORDS : LEN_WORDS;
    zones.push({ k: z.k, kind: z.kind, diff: r1(diff), delta: r1(delta), level, label: words[level + 2], note: z.note(diff, delta), short: `${sign(z.note === idealNote ? delta : diff)} cm`, bar: barOf(level) });
    // Tight is worse than loose: a roomy piece can be worn, a tight one can't.
    score += z.weight * ((delta / z.tol) ** 2 * (delta < 0 ? 1.5 : 1) + (Math.abs(level) === 2 ? 4 : 0));
    mean += z.weight * level;
    weights += z.weight;
  }
  if (!zones.length) return undefined;
  mean /= weights;
  const worst = zones.reduce((a, z) => (Math.abs(z.level) > Math.abs(a.level) ? z : a));
  const tooSmall = zones.some((z) => z.level === -2);
  const verdict = tooSmall
    ? worst.kind === "len" ? "Too short" : "Too tight"
    : zones.some((z) => z.level === 2) ? (worst.kind === "len" ? "Too long" : "Too loose")
    : mean < -0.35 ? "Snug" : mean > 0.35 ? "Relaxed" : "Right fit";
  return { size, zones, score: r1(score), verdict, verdictAccent: Math.abs(worst.level) === 2 };
}

export interface Recommendation {
  /** Best size label, or undefined when the product has no measurements. */
  rec?: string;
  fits: SizeFit[];
  why: string;
}

/** Score every measured size and pick the best; ties go to the smaller size. */
export function recommend(g: Garment, body: Body): Recommendation {
  const fits = g.sizes.map((z) => fitSize(g, body, z)).filter((f): f is SizeFit => !!f);
  if (!fits.length) return { fits, why: "We don't have measurements for this piece yet, so we can't check the fit." };
  const best = fits.reduce((a, f) => (f.score < a.score ? f : a));
  return { rec: best.size, fits, why: explain(best, fits) };
}

const lc = (k: string) => k.toLowerCase();
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Worst first: further from Right, then tight before loose, then by cm off. */
const bySeverity = (a: ZoneFit, b: ZoneFit) => Math.abs(b.level) - Math.abs(a.level) || a.level - b.level || Math.abs(b.delta) - Math.abs(a.delta);

/** One or two sentences on why the recommended size wins over its neighbours. */
export function explain(best: SizeFit, fits: SizeFit[]): string {
  const right = best.zones.filter((z) => z.level === 0).map((z) => lc(z.k));
  const off = best.zones.filter((z) => z.level !== 0).sort(bySeverity)[0];
  let s = right.length
    ? `${best.size} fits best: ${list(right)} ${right.length === 1 && !right[0].endsWith("s") ? "sits" : "sit"} where this cut is meant to.`
    : `${best.size} is the closest match we have.`;
  if (off) s += ` ${off.k} ${off.k.endsWith("s") ? "read" : "reads"} ${lc(off.label)} (${off.note}).`;

  // Compare with the runner-up neighbour so the choice doesn't feel arbitrary.
  const i = fits.indexOf(best);
  const near = [fits[i - 1], fits[i + 1]].filter((f): f is SizeFit => !!f).sort((a, b) => a.score - b.score)[0];
  if (near) {
    const z = [...near.zones].sort(bySeverity)[0];
    if (z.level !== 0) s += ` ${near.size} would be ${lc(z.label)} at the ${lc(z.k)} (${z.note}).`;
  }
  return s;
}
