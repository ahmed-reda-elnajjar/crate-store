// Fit-room avatar: a front-view SVG silhouette built from the customer's body
// measurements, with the garment drawn from its own flat measurements at the
// same scale, so a garment that's too narrow or short looks it. Illustrative
// only; the numbers in lib/fit.ts are what decide the fit.

import type { FitShape, Measurements } from "./data";
import { thighOf, type Body } from "./fit";

/** Pixels per cm in the 200 × 440 viewBox; a 200 cm body just fits. */
const K = 2.1;
const FEET = 420;

type P = [number, number]; // [x cm from centre line, height cm above floor]

const X = (x: number) => +(100 + x * K).toFixed(1);
const Y = (y: number) => +(FEET - y * K).toFixed(1);
const pt = ([x, y]: P) => `${X(x)} ${Y(y)}`;
const add = (a: P, b: P, s = 1): P => [a[0] + b[0] * s, a[1] + b[1] * s];
const mirror = (ps: P[]) => ps.map(([x, y]): P => [-x, y]);

/** Straight-edged outline (garments). */
const poly = (ps: P[]) => `M${ps.map(pt).join(" L")} Z`;

/** Closed Catmull-Rom curve through the points (body parts). */
function smooth(ps: P[]): string {
  const q = ps.map(([x, y]): P => [X(x), Y(y)]);
  const n = q.length;
  let d = `M${q[0][0]} ${q[0][1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [q[(i - 1 + n) % n], q[i], q[(i + 1) % n], q[(i + 2) % n]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d + " Z";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Piecewise-linear lookup over [height, value] pairs sorted high → low. */
function along(pairs: [number, number][], y: number): number {
  if (y >= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    const [y0, v0] = pairs[i - 1];
    const [y1, v1] = pairs[i];
    if (y >= y1) return lerp(v0, v1, (y0 - y) / (y0 - y1));
  }
  return pairs[pairs.length - 1][1];
}

export const GARMENT_COLOURS: Record<FitShape, { fill: string; det: string }> = {
  jacket: { fill: "var(--color-text)", det: "var(--color-neutral-500)" },
  tee: { fill: "var(--color-neutral-100)", det: "var(--color-neutral-400)" },
  hoodie: { fill: "var(--color-neutral-500)", det: "var(--color-neutral-800)" },
  pants: { fill: "var(--color-neutral-700)", det: "var(--color-neutral-400)" },
};

export interface AvatarGeo {
  head: { cx: number; cy: number; r: number };
  neck: string;
  torso: string;
  arms: string;
  legs: string;
  garment?: { path: string; detail: string; fill: string; det: string };
  shadowRx: number;
}

/** Visible front width is about 0.34 × circumference (the body is an ellipse, not a slab). */
const HALF = 0.17;

export function avatarGeometry(b: Body, garment?: { shape: FitShape; m?: Measurements }): AvatarGeo {
  const h = b.h;
  // Landmark heights, from standard proportions of stature.
  const headR = 0.06 * h;
  const headCy = h - headR;
  const shoulderY = 0.815 * h;
  const neckBaseY = shoulderY + 2.5;
  const chestY = 0.72 * h;
  const waistY = 0.61 * h;
  const hipY = 0.5 * h;
  const crotchY = Math.min(b.inseam, hipY - 3);
  const kneeY = Math.min(0.285 * h, crotchY - 12);
  const ankleY = 0.045 * h;

  const neckHalf = 0.022 * h;
  const S = b.shoulder / 2;
  const chestHalf = b.chest * HALF;
  const waistHalf = b.waist * HALF;
  const hipHalf = b.hips * 0.18;
  const thighHalf = thighOf(b) * HALF;
  const kneeHalf = 0.031 * h;
  const calfHalf = 0.033 * h;
  const ankleHalf = 0.018 * h;
  const legC = Math.max(hipHalf - thighHalf, kneeHalf + 0.5);
  const kneeC = Math.max(kneeHalf + 0.6, legC * 0.85);
  const ankleC = kneeC * 0.92;

  // Legs: one outline from the left hip round both feet to the right hip.
  const legSide: P[] = [
    [hipHalf, hipY], [legC + thighHalf, crotchY], [kneeC + kneeHalf, kneeY],
    [kneeC * 0.96 + calfHalf, lerp(kneeY, ankleY, 0.3)], [ankleC + ankleHalf, ankleY],
    [ankleC + ankleHalf + 1.5, 0.6], [ankleC - ankleHalf - 0.5, 0.6], [ankleC - ankleHalf, ankleY],
    [kneeC - kneeHalf, kneeY], [Math.max(0.6, legC - thighHalf * 0.6), crotchY + 1],
  ];
  const legs = smooth([...legSide, [0, crotchY + 2], ...mirror(legSide).reverse()]);

  const torsoSide: P[] = [
    [neckHalf, neckBaseY], [S, shoulderY], [chestHalf, chestY], [waistHalf, waistY], [hipHalf, hipY], [hipHalf * 0.9, crotchY + 3],
  ];
  const torso = smooth([...torsoSide, ...mirror(torsoSide).reverse()]);

  const neck = smooth([[-neckHalf, neckBaseY - 1], [-neckHalf * 0.9, headCy - headR * 0.6], [neckHalf * 0.9, headCy - headR * 0.6], [neckHalf, neckBaseY - 1]]);

  // Arms hang from the shoulder point, angled just clear of the hips.
  const A = b.arm;
  const P0: P = [S - 1, shoulderY - 1];
  const wristX = Math.min(Math.max(S + 2, hipHalf + 4.5), P0[0] + A * 0.6);
  const dy = Math.sqrt(A * A - (wristX - P0[0]) ** 2);
  const dir: P = [(wristX - P0[0]) / A, -dy / A];
  const nrm: P = [-dir[1], dir[0]]; // points outward for the right arm
  const W = add(P0, dir, A);
  const upperHalf = b.chest * 0.05;
  const wristHalf = 0.017 * h;
  const hand = 0.108 * h;
  const elbow = add(P0, dir, A * 0.48);
  const armSide: P[] = [
    add(P0, nrm, 1.2), add(elbow, nrm, upperHalf * 0.8), add(W, nrm, wristHalf),
    add(add(W, dir, hand * 0.45), nrm, wristHalf + 1), add(W, dir, hand), add(add(W, dir, hand * 0.45), nrm, -wristHalf - 0.6),
    add(W, nrm, -wristHalf), add(elbow, nrm, -upperHalf * 0.75), [chestHalf - 1.5, chestY + 1],
  ];
  const arms = `${smooth(armSide)} ${smooth(mirror(armSide))}`;

  const torsoHalfAt = (y: number) =>
    along([[shoulderY, S], [chestY, chestHalf], [waistY, waistHalf], [hipY, hipHalf], [crotchY, hipHalf * 0.95], [0, hipHalf * 0.95]], y);

  const geo: AvatarGeo = {
    head: { cx: 100, cy: Y(headCy), r: +(headR * K).toFixed(1) },
    neck, torso, arms, legs,
    shadowRx: Math.round((Math.max(hipHalf, wristX + wristHalf) + 4) * K),
  };
  if (!garment) return geo;

  const m = garment.m ?? {};
  const colours = GARMENT_COLOURS[garment.shape];

  if (garment.shape === "pants") {
    const rise = m.rise ?? 0.16 * h;
    const wbY = Math.min(crotchY + rise, waistY + 4);
    const wbHalf = Math.max((m.waistW ?? b.waist / 2) * 2 * HALF, torsoHalfAt(wbY) + 0.3);
    const gHip = Math.max((m.hipW ?? b.hips / 2 + 5) * 2 * HALF, hipHalf + 0.4);
    const gThigh = Math.max((m.thighW ?? thighOf(b) / 2 + 4) * 2 * HALF, thighHalf + 0.4);
    const hemY = Math.max(1, crotchY - (m.inseam ?? b.inseam));
    const centreAt = (y: number) => along([[crotchY, legC], [kneeY, kneeC], [ankleY, ankleC]], y);
    const bodyLegAt = (y: number) => along([[crotchY, thighHalf], [kneeY, kneeHalf], [lerp(kneeY, ankleY, 0.3), calfHalf], [ankleY, ankleHalf]], y);
    const openHalf = Math.max(gThigh * 0.74, bodyLegAt(hemY) + 0.6);
    const c = centreAt(hemY);
    const side: P[] = [[wbHalf, wbY], ...(hipY < wbY - 2 ? [[gHip, hipY] as P] : []), [legC + gThigh, crotchY], [c + openHalf, hemY], [c - openHalf, hemY]];
    const path = poly([...side, [0, crotchY - 0.5], ...mirror(side).reverse()]);
    const pocket = (s: number) => `M${pt([s * (wbHalf - 5), wbY - 4])} Q${pt([s * (wbHalf - 1), wbY - 7])} ${pt([s * gHip * 0.98, wbY - 14])}`;
    const detail = `M${pt([-wbHalf, wbY - 4])} L${pt([wbHalf, wbY - 4])} M${pt([0, wbY - 4])} L${pt([0, crotchY + 3])} ${pocket(1)} ${pocket(-1)}`;
    return { ...geo, garment: { path, detail, ...colours } };
  }

  const len = m.length ?? 0.4 * h + 1;
  const hemY = neckBaseY - len;
  const gS = (m.shoulder ?? b.shoulder + 2) / 2;
  const drop = Math.max(0, gS - S);
  // A dropped shoulder seam slides down the arm; a narrow one sits inside the shoulder.
  const G0: P = gS >= S ? add(add(P0, dir, drop), nrm, 1.4) : [gS, shoulderY];
  const gChest = Math.max((m.chestW ?? b.chest / 2 + 7) * 2 * HALF, chestHalf + 0.5);
  const armpit: P = [Math.max(gChest, chestHalf + 0.5), chestY + 2 - drop * 0.8];
  const side: P[] = [[neckHalf + 1.2, neckBaseY], G0];
  // A measured garment without a sleeve length is sleeveless (a vest).
  const sleeve = m.chestW ? (m.sleeve ?? 0) : A * 0.95;
  if (sleeve > 0) {
    const E = add(G0, dir, sleeve);
    const cuff = sleeve >= 45 ? wristHalf + 1.6 : upperHalf + 2.5;
    side.push(add(E, nrm, cuff), add(E, nrm, -cuff));
  }
  side.push(armpit);
  if (hemY < waistY - 2) side.push([Math.max((m.waistW ?? b.waist / 2 + 10) * 2 * HALF, waistHalf + 0.5), waistY]);
  side.push([Math.max((m.hemW ?? b.hips / 2 + 6) * 2 * HALF, torsoHalfAt(hemY) + 0.5), hemY]);

  const neckDip = garment.shape === "tee" ? 7 : garment.shape === "hoodie" ? 6 : 1.5;
  const path = poly([...side, ...mirror(side).reverse(), [0, neckBaseY - neckDip]]);
  const hemHalf = side[side.length - 1][0];

  let detail = "";
  if (garment.shape === "jacket") {
    // Zip, hem band and stand collar.
    detail = `M${pt([0, neckBaseY + 2.5])} L${pt([0, hemY])} M${pt([-hemHalf, hemY + 5])} L${pt([hemHalf, hemY + 5])}`
      + ` M${pt([-neckHalf - 1.2, neckBaseY])} L${pt([-neckHalf - 0.6, neckBaseY + 3])} L${pt([neckHalf + 0.6, neckBaseY + 3])} L${pt([neckHalf + 1.2, neckBaseY])}`;
  } else if (garment.shape === "hoodie") {
    // Kangaroo pocket and hood behind the neck.
    const py = Math.max(hemY + 6, waistY - 8);
    detail = `M${pt([-12, py + 14])} L${pt([12, py + 14])} L${pt([14, py])} L${pt([-14, py])} Z`
      + ` M${pt([-neckHalf - 1.2, neckBaseY])} Q${pt([0, neckBaseY - 12])} ${pt([neckHalf + 1.2, neckBaseY])}`;
  } else {
    detail = `M${pt([-neckHalf - 1.2, neckBaseY])} Q${pt([0, neckBaseY - neckDip - 2.5])} ${pt([neckHalf + 1.2, neckBaseY])}`;
  }
  return { ...geo, garment: { path, detail, ...colours } };
}
