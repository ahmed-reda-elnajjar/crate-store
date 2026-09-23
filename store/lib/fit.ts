// Fit-room model, ported from fitVals() in "Crate Store v2.dc.html" (section 3).
// Size recommendation comes from height and BMI; the chosen size then sets how
// tight or loose each body zone reads and how the garment scales on the avatar.

import type { FitShape } from "./data";

export const FIT_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"];

export type View = "front" | "side" | "back";

export interface Garment {
  shape: FitShape;
  fill: string;
  det: string;
  oy: number;
  bottom?: boolean;
  path: string;
  detail: string;
}

export const GARMENTS: Record<FitShape, Garment> = {
  jacket: {
    shape: "jacket", fill: "var(--color-text)", det: "var(--color-neutral-500)", oy: 120,
    path: "M56 80 Q100 68 144 80 C156 90 158 104 158 120 L164 236 L148 238 L138 128 L138 210 L62 210 L62 128 L52 238 L36 236 L42 120 C42 104 44 90 56 80 Z",
    detail: "M100 76 L100 210 M62 196 L138 196",
  },
  tee: {
    shape: "tee", fill: "var(--color-neutral-100)", det: "var(--color-neutral-400)", oy: 120,
    path: "M56 80 Q100 68 144 80 L162 118 L146 126 L138 108 L138 204 L62 204 L62 108 L54 126 L38 118 Z",
    detail: "M88 76 Q100 88 112 76",
  },
  hoodie: {
    shape: "hoodie", fill: "var(--color-neutral-500)", det: "var(--color-neutral-800)", oy: 120,
    path: "M56 80 Q100 68 144 80 C156 90 158 104 158 120 L164 236 L148 238 L138 128 L138 212 L62 212 L62 128 L52 238 L36 236 L42 120 C42 104 44 90 56 80 Z",
    detail: "M76 160 L124 160 L130 196 L70 196 Z M84 76 Q100 96 116 76",
  },
  pants: {
    shape: "pants", fill: "var(--color-neutral-700)", det: "var(--color-neutral-400)", oy: 200, bottom: true,
    path: "M62 196 L138 196 L138 420 L104 420 L100 234 L96 420 L62 420 Z",
    detail: "M66 300 L94 300 L94 350 L66 350 Z M106 300 L134 300 L134 350 L106 350 Z",
  },
};

const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function recommendSize(h: number, w: number) {
  const bmi = w / (h / 100) ** 2;
  const hIdx = h < 175 ? 0 : h < 180 ? 1 : h < 185 ? 2 : h < 190 ? 3 : 5;
  let rec = Math.min(hIdx, 4);
  if (bmi > 27) rec++;
  if (bmi > 31) rec++;
  if (bmi < 19.5) rec--;
  return { rec: cl(rec, 0, 5), bmi, hIdx };
}

export interface Zone {
  k: string;
  v: string;
  /** Five bar segments, tight ← → loose; the lit one carries the level colour. */
  bar: string[];
}

export function computeFit(opts: { h: number; w: number; size: number; shape: FitShape; view: View }) {
  const { h, w, size, shape, view } = opts;
  const { rec, bmi, hIdx } = recommendSize(h, w);
  const gar = GARMENTS[shape];
  const sy = 0.86 + ((h - 150) / 50) * 0.16;
  const sx = cl(0.78 + (bmi - 18) * 0.035, 0.78, 1.35);
  const vx = view === "side" ? 0.55 : 1;
  const diff = size - rec;
  const gx = 1.03 + diff * 0.06;
  const gy = 1 + (size - hIdx) * 0.02;
  const verdict = diff <= -1 ? "Tight" : diff === 0 ? "True to size" : diff === 1 ? "Relaxed" : "Oversized";

  const lvl = (d: number) => cl(2 + d, 0, 4);
  const bar = (d: number) =>
    [0, 1, 2, 3, 4].map((i) => (i === lvl(d) ? (Math.abs(d) >= 2 ? "var(--color-accent)" : "var(--color-text)") : "var(--color-neutral-200)"));
  const word = (d: number, t: string[]) => (d <= -2 ? "Too " + t[0] : d === -1 ? t[1] : d === 0 ? "Right" : d === 1 ? t[2] : "Too " + t[3]);

  const chestD = diff;
  const waistD = diff + (bmi > 26 ? -1 : 0);
  const lenD = size - Math.min(hIdx, 5);
  const shD = diff + (sx > 1.1 ? -1 : 0);
  const raw = gar.bottom
    ? [
        { k: "Waist", d: waistD, t: ["tight", "Snug", "Loose", "loose"] },
        { k: "Hips", d: diff, t: ["tight", "Snug", "Roomy", "loose"] },
        { k: "Thigh", d: diff, t: ["tight", "Snug", "Roomy", "loose"] },
        { k: "Leg length", d: lenD, t: ["short", "Cropped", "Stacked", "long"] },
      ]
    : [
        { k: "Shoulders", d: shD, t: ["tight", "Snug", "Dropped", "wide"] },
        { k: "Chest", d: chestD, t: ["tight", "Snug", "Roomy", "loose"] },
        { k: "Waist", d: waistD, t: ["tight", "Snug", "Roomy", "loose"] },
        { k: "Length", d: lenD, t: ["short", "Cropped", "Long", "long"] },
      ];

  return {
    rec,
    verdict,
    verdictAccent: Math.abs(diff) >= 2 || diff < 0,
    bodyT: `translate(100 62) scale(${(sx * vx).toFixed(3)} ${sy.toFixed(3)}) translate(-100 -62)`,
    garmentT: `translate(100 ${gar.oy}) scale(${gx.toFixed(3)} ${gy.toFixed(3)}) translate(-100 -${gar.oy})`,
    garment: gar,
    shadowRx: Math.round(46 * sx * vx),
    zones: raw.map((z): Zone => ({ k: z.k, v: word(z.d, z.t), bar: bar(z.d) })),
  };
}
