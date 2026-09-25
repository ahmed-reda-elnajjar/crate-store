// Seed catalogue and static reference data. Everything here was invented for the
// mockups (see chats/chat1.md) and stands in until a real catalogue API exists.

export type CategoryKey = "tops" | "bottoms" | "outerwear" | "accessories";
export type FitShape = "jacket" | "tee" | "hoodie" | "pants";
/** How much room the cut is designed to leave; sets the ease the fit engine aims for. */
export type FitStyle = "slim" | "regular" | "oversized";
export const FIT_STYLES: FitStyle[] = ["slim", "regular", "oversized"];

export type TopMeasure = "chestW" | "waistW" | "hemW" | "length" | "sleeve" | "shoulder";
export type BottomMeasure = "waistW" | "hipW" | "thighW" | "inseam" | "rise";
export type MeasureKey = TopMeasure | BottomMeasure;
/** Garment measurements in cm, taken flat. Widths (…W) are half the circumference. */
export type Measurements = Partial<Record<MeasureKey, number>>;

export const TOP_MEASURES: { k: TopMeasure; l: string }[] = [
  { k: "chestW", l: "Chest width" },
  { k: "waistW", l: "Waist width" },
  { k: "hemW", l: "Hem width" },
  { k: "length", l: "Body length" },
  { k: "sleeve", l: "Sleeve length" },
  { k: "shoulder", l: "Shoulder width" },
];

export const BOTTOM_MEASURES: { k: BottomMeasure; l: string }[] = [
  { k: "waistW", l: "Waist width" },
  { k: "hipW", l: "Hip width" },
  { k: "thighW", l: "Thigh width" },
  { k: "inseam", l: "Inseam" },
  { k: "rise", l: "Rise" },
];

/** Bottoms are measured and drawn as trousers; everything else as a top. */
export const isBottom = (p: Pick<Product, "shape" | "category">) => (p.shape ? p.shape === "pants" : p.category === "bottoms");

export interface Product {
  id: string;
  name: string;
  price: number;
  category: CategoryKey;
  colourways: string[];
  sizes: string[];
  /** Units left per size; a missing size counts as sold out. */
  stock: Record<string, number>;
  /** Size of the limited run (drives the "9/250 left" counter). */
  run?: number;
  tag?: string;
  drop: string;
  fabric: string;
  fit: string;
  shape?: FitShape;
  /** Built-in product photo (public/products), shown until an admin uploads one. */
  photo?: string;
  fitStyle?: FitStyle;
  /** Flat garment measurements per size label. */
  measurements?: Record<string, Measurements>;
  /** Your own 3D file for the fit room (public/models), modelled on the avatar file. */
  model?: string;
  /** The size that 3D file was modelled in; other sizes are scaled from it. Defaults to M or the middle size. */
  modelSize?: string;
  /** Written details for the photo try-on, e.g. "round neck, no zip, no collar, short sleeves". The service is told to follow them exactly. */
  tryonNote?: string;
  live: boolean;
  /** Higher = newer; used for "Newest" sort. */
  added: number;
}

export const CATEGORIES: { key: CategoryKey; name: string }[] = [
  { key: "tops", name: "Tops" },
  { key: "bottoms", name: "Bottoms" },
  { key: "outerwear", name: "Outerwear" },
  { key: "accessories", name: "Accessories" },
];

const APPAREL = ["S", "M", "L", "XL", "XXL"];
const WAISTS = ["28", "30", "32", "34", "36"];

/** Grade a size run from one base size: each size up adds `step`, each size down takes it off. */
function graded(sizes: string[], base: string, m: Measurements, step: Measurements): Record<string, Measurements> {
  const b = sizes.indexOf(base);
  return Object.fromEntries(
    sizes.map((z, i) => [z, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round((v + (i - b) * (step[k as MeasureKey] ?? 0)) * 2) / 2]))]),
  );
}

// Seed garment specs (flat, cm). Invented but realistic for each cut; admins edit them in /admin.
const TOP_STEP: Measurements = { chestW: 2.5, waistW: 2.5, hemW: 2.5, length: 1.5, sleeve: 1, shoulder: 1.5 };
const BOTTOM_STEP: Measurements = { waistW: 2.5, hipW: 2.5, thighW: 1.2, inseam: 0, rise: 0.6 };
const SPECS: Record<string, Pick<Product, "fitStyle" | "measurements">> = {
  "boxy-heavy-tee": { fitStyle: "oversized", measurements: graded(APPAREL, "M", { chestW: 60, waistW: 59, hemW: 59, length: 71, sleeve: 23, shoulder: 55 }, { ...TOP_STEP, sleeve: 0.8 }) },
  "double-knee-carpenter": { fitStyle: "regular", measurements: graded(WAISTS, "32", { waistW: 42.5, hipW: 53.5, thighW: 33, inseam: 81, rise: 29 }, BOTTOM_STEP) },
  "nylon-track-jacket": { fitStyle: "oversized", measurements: graded(APPAREL, "M", { chestW: 60.5, waistW: 59.5, hemW: 57, length: 72, sleeve: 60, shoulder: 54 }, TOP_STEP) },
  "480gsm-hoodie": { fitStyle: "oversized", measurements: graded(APPAREL, "M", { chestW: 60, waistW: 59, hemW: 56.5, length: 71, sleeve: 61, shoulder: 54 }, TOP_STEP) },
  "ripstop-cargo-short": { fitStyle: "regular", measurements: graded(WAISTS, "32", { waistW: 42.5, hipW: 55, thighW: 34, inseam: 20, rise: 29.5 }, BOTTOM_STEP) },
  "puffer-vest": { fitStyle: "regular", measurements: graded(["S", "M", "L", "XL"], "M", { chestW: 56, waistW: 55, hemW: 55, length: 70, shoulder: 46 }, TOP_STEP) },
  "fleece-quarter-zip": { fitStyle: "regular", measurements: graded(["M", "L", "XL"], "M", { chestW: 58, waistW: 57, hemW: 54, length: 71, sleeve: 64, shoulder: 49 }, TOP_STEP) },
  "racing-crew": { fitStyle: "oversized", measurements: graded(APPAREL, "M", { chestW: 60, waistW: 59, hemW: 56, length: 71, sleeve: 60, shoulder: 53 }, TOP_STEP) },
  "moto-bomber": { fitStyle: "oversized", measurements: graded(APPAREL, "M", { chestW: 61, waistW: 59, hemW: 56, length: 69, sleeve: 61, shoulder: 53 }, TOP_STEP) },
};

export const SEED_PRODUCTS: Product[] = ([
  { id: "boxy-heavy-tee", name: "Boxy Heavy Tee", price: 48, category: "tops", colourways: ["Bone", "Black", "Ash", "Olive"], sizes: APPAREL, stock: { S: 30, M: 40, L: 30, XL: 14, XXL: 6 }, tag: "New", drop: "07", fabric: "240gsm organic cotton jersey", fit: "Boxy, cropped body", shape: "tee", live: true, added: 10 },
  { id: "double-knee-carpenter", name: "Double-Knee Carpenter", price: 128, category: "bottoms", colourways: ["Black", "Tan", "Grey"], sizes: ["28", "30", "32", "34", "36"], stock: { "28": 8, "30": 16, "32": 20, "34": 14, "36": 6 }, drop: "07", fabric: "12oz cotton canvas", fit: "Relaxed, straight leg", shape: "pants", live: true, added: 9 },
  { id: "nylon-track-jacket", name: "Nylon Track Jacket", price: 165, category: "outerwear", colourways: ["Black", "Stone"], sizes: APPAREL, stock: { S: 3, M: 4, L: 2 }, run: 250, tag: "Low stock", drop: "07", fabric: "100% recycled nylon, mesh lining", fit: "Oversized, dropped shoulder", shape: "jacket", photo: "/products/red.jpg", live: true, added: 8 },
  { id: "480gsm-hoodie", name: "480gsm Hoodie", price: 120, category: "tops", colourways: ["Black", "Grey", "Navy", "Bone", "Red"], sizes: APPAREL, stock: { S: 10, M: 14, L: 12, XL: 8, XXL: 4 }, drop: "07", fabric: "480gsm brushed-back fleece", fit: "Boxy, dropped shoulder", shape: "hoodie", live: true, added: 7 },
  { id: "ripstop-cargo-short", name: "Ripstop Cargo Short", price: 78, category: "bottoms", colourways: ["Black", "Olive", "Sand"], sizes: ["28", "30", "32", "34", "36"], stock: { "28": 6, "30": 12, "32": 12, "34": 8, "36": 4 }, tag: "New", drop: "07", fabric: "Cotton-nylon ripstop", fit: "Relaxed, above the knee", shape: "pants", live: true, added: 6 },
  { id: "puffer-vest", name: "Puffer Vest", price: 190, category: "outerwear", colourways: ["Black", "Orange"], sizes: ["S", "M", "L", "XL"], stock: { S: 6, M: 8, L: 6, XL: 4 }, drop: "07", fabric: "Recycled nylon shell, synthetic fill", fit: "Regular, boxy", shape: "jacket", live: true, added: 5 },
  { id: "fleece-quarter-zip", name: "Fleece Quarter-Zip", price: 110, category: "tops", colourways: ["Grey", "Black", "Cream"], sizes: ["M", "L", "XL"], stock: { M: 10, L: 10, XL: 6 }, drop: "07", fabric: "Polar fleece, nylon yoke", fit: "Relaxed", shape: "hoodie", photo: "/products/cream.jpg", live: true, added: 4 },
  { id: "5-panel-cap", name: "5-Panel Cap", price: 38, category: "accessories", colourways: ["Black", "White", "Red", "Olive", "Navy", "Sand"], sizes: ["One size"], stock: {}, tag: "Sold out", drop: "06", fabric: "Nylon, adjustable strap", fit: "One size", live: true, added: 3 },
  { id: "racing-crew", name: "Racing Crew", price: 110, category: "tops", colourways: ["Black", "Red"], sizes: APPAREL, stock: { S: 6, M: 10, L: 10, XL: 6, XXL: 2 }, drop: "07", fabric: "380gsm loopback cotton", fit: "Boxy", shape: "hoodie", photo: "/products/black.jpg", live: true, added: 2 },
  { id: "moto-bomber", name: "Moto Bomber", price: 210, category: "outerwear", colourways: ["Black"], sizes: APPAREL, stock: { S: 4, M: 6, L: 6, XL: 3 }, run: 150, drop: "07", fabric: "Waxed cotton, quilted lining", fit: "Cropped, boxy", shape: "jacket", photo: "/products/olive.jpg", live: true, added: 1 },
] as Product[]).map((p) => ({ ...p, ...SPECS[p.id] }));

export type SectionKey = "hero" | "countdown" | "grid" | "wear" | "cats" | "news";

export interface Section {
  k: SectionKey;
  l: string;
  d: string;
  on: boolean;
}

export const SEED_SECTIONS: Section[] = [
  { k: "hero", l: "Hero campaign", d: "Image, headline, button", on: true },
  { k: "countdown", l: "Drop countdown", d: "Red banner with timer", on: true },
  { k: "grid", l: "Latest products", d: "Live products, 4 per row", on: true },
  { k: "wear", l: "Wear carousel", d: "Model photo, garments rotate on", on: true },
  { k: "cats", l: "Category tiles", d: "Tops, Bottoms, Outerwear, Accessories", on: true },
  { k: "news", l: "Newsletter", d: "Drop alert sign-up", on: true },
];

export interface Hero {
  title: string;
  kicker: string;
  cta: string;
  body: string;
}

export const SEED_HERO: Hero = {
  title: "CONCRETE SEASON",
  kicker: "Drop 07 / Autumn 26",
  cta: "Shop the drop",
  body: "Heavyweight cotton, ripstop and nylon. 22 pieces, made in limited runs.",
};

export interface WearFit {
  topPct: number;
  scalePct: number;
  xPct: number;
  /** Neck opening cut out of the collar, as % of the garment width (0 = none). */
  neck?: number;
  /** Stretch the garment photo on its own: width and height as % (100 = the photo's shape). */
  wPct?: number;
  hPct?: number;
}

export interface WearSettings extends WearFit {
  garmentIds: string[];
  /** Per-garment fit; garments without an entry use the shared topPct/scalePct/xPct above. */
  fits?: Record<string, WearFit>;
  /**
   * Aligned mode: each garment photo has the same canvas as the model photo
   * with the garment already where it sits on her body (made by dressing the
   * model with AI, then keeping only the garment). Garments then overlay the
   * model 1:1 instead of being trimmed and positioned.
   */
  aligned?: boolean;
  alignedFits?: Record<string, WearFit>;
  /** Built-in photos (public/lookbook) used until an admin uploads replacements. "model" is the model photo. */
  images?: Record<string, string>;
  /**
   * Size of the model photo on the page: height as % of the default frame, width as %
   * of the photo's own width at that height. When the width no longer matches the
   * photo, "crop" trims the sides (or top and bottom) and "stretch" distorts it.
   */
  frame?: { h: number; w: number; fill?: "crop" | "stretch" };
  colorPhotos: boolean;
  rotateSeconds: number;
  title: string;
}

export const wearFitOf = (wear: WearSettings, productId: string): WearFit =>
  wear.fits?.[productId] ?? { topPct: wear.topPct, scalePct: wear.scalePct, xPct: wear.xPct };

export const SEED_WEAR: WearSettings = {
  // Garment photos were fitted to the model photo offline (tools/fit-jackets.py), so they overlay 1:1.
  garmentIds: ["nylon-track-jacket", "racing-crew", "moto-bomber", "fleece-quarter-zip"],
  aligned: true,
  images: {
    model: "/lookbook/model.jpg",
    "nylon-track-jacket": "/lookbook/red.webp",
    "racing-crew": "/lookbook/black.webp",
    "moto-bomber": "/lookbook/olive.webp",
    "fleece-quarter-zip": "/lookbook/cream.webp",
  },
  // Tuned for trimmed cut-outs on a full-body, front-facing model photo.
  topPct: 23,
  scalePct: 84,
  xPct: 0,
  colorPhotos: true,
  rotateSeconds: 3,
  title: "THE JACKET COLLECTION",
};

/**
 * The next drop. The mockups say "Fri 26.09, 10:00 CET", but 26 Sep 2026 is a
 * Saturday; the date matches the mockups' countdown, so the weekday is derived.
 */
export const NEXT_DROP = {
  name: "Drop 08",
  at: new Date("2026-09-26T10:00:00+02:00"),
  label: "Sat 26.09, 10:00 CET",
  earlyAccessMinutes: 30,
};

export type OrderStatus = "In transit" | "Delivered" | "Returned" | "Processing";

export interface OrderLine {
  productId: string;
  name: string;
  size: string;
  colour: string;
  qty: number;
  price: number;
}

export interface Order {
  no: string;
  email: string;
  date: string;
  lines: OrderLine[];
  itemCount: number;
  total: number;
  status: OrderStatus;
}

export const SEED_ORDERS: Order[] = [
  { no: "#CR-20931", email: "sam@example.com", date: "2026-09-19", lines: [], itemCount: 2, total: 213, status: "In transit" },
  { no: "#CR-19884", email: "sam@example.com", date: "2026-08-02", lines: [], itemCount: 1, total: 120, status: "Delivered" },
  { no: "#CR-18302", email: "sam@example.com", date: "2026-06-14", lines: [], itemCount: 3, total: 244, status: "Delivered" },
  { no: "#CR-17755", email: "sam@example.com", date: "2026-04-30", lines: [], itemCount: 1, total: 78, status: "Returned" },
];

export type Role = "guest" | "customer" | "admin";

export interface User {
  name: string;
  email: string;
  role: Exclude<Role, "guest">;
}

export const SEED_USERS: User[] = [
  { name: "Sam Okafor", email: "sam@example.com", role: "customer" },
  { name: "Lina Haddad", email: "lina@example.com", role: "customer" },
  { name: "Crate Team", email: "admin@crate.store", role: "admin" },
];

export const TRENDING = ["cargo", "track jacket", "heavyweight tee", "puffer", "drop 08"];

/** Body size chart (cm, EU) from the size guide in 3a. */
export const SIZE_CHART = [
  { size: "S", eu: "46", chest: "92–96", waist: "78–82", height: "170–175" },
  { size: "M", eu: "48", chest: "96–100", waist: "82–86", height: "175–180" },
  { size: "L", eu: "50", chest: "100–105", waist: "86–91", height: "180–185" },
  { size: "XL", eu: "52", chest: "105–110", waist: "91–96", height: "185–190" },
  { size: "XXL", eu: "54", chest: "110–115", waist: "96–102", height: "185–190" },
  { size: "XXXL", eu: "56–58", chest: "116–123", waist: "103–109", height: "190–195" },
];

export const FREE_SHIPPING_OVER = 150;
export const EXPRESS_SHIPPING = 12;
export const VAT_RATE = 0.19;
