"use client";

// Browser-side mock backend. All state lives in one object persisted to
// localStorage; components read it via useStore() and change it only through
// the action functions exported below, so swapping in a real API later means
// reimplementing those actions, not touching the pages.

import { useSyncExternalStore } from "react";
import {
  SEED_HERO,
  SEED_ORDERS,
  SEED_PRODUCTS,
  SEED_SECTIONS,
  SEED_USERS,
  SEED_WEAR,
  wearFitOf,
  type Hero,
  type MeasureKey,
  type Measurements,
  type Order,
  type Product,
  type Role,
  type Section,
  type User,
  type WearFit,
  type WearSettings,
} from "./data";
import type { BodyProfile } from "./fit";

export interface SiteContent {
  products: Product[];
  sections: Section[];
  hero: Hero;
  wear: WearSettings;
}

export interface BagLine {
  productId: string;
  size: string;
  colour: string;
  qty: number;
}

export interface Session {
  role: Role;
  email: string;
  name: string;
}

export type FitTab = "guide" | "fit";

export interface UiState {
  bagOpen: boolean;
  menuOpen: boolean;
  fitRoom: { open: boolean; tab: FitTab; productId?: string };
  toast: string | null;
}

export interface State {
  v: 1;
  session: Session;
  draft: SiteContent;
  published: SiteContent;
  bag: BagLine[];
  wishlist: string[];
  orders: Order[];
  users: User[];
  fit: BodyProfile;
  ui: UiState;
}

const STORAGE_KEY = "crate-store:v1";

const SEED_CONTENT: SiteContent = {
  products: SEED_PRODUCTS,
  sections: SEED_SECTIONS,
  hero: SEED_HERO,
  wear: SEED_WEAR,
};

const GUEST: Session = { role: "guest", email: "", name: "" };

const INITIAL: State = {
  v: 1,
  session: GUEST,
  draft: SEED_CONTENT,
  published: SEED_CONTENT,
  bag: [],
  wishlist: [],
  orders: SEED_ORDERS,
  users: SEED_USERS,
  fit: { h: 178, w: 74 },
  ui: { bagOpen: false, menuOpen: false, fitRoom: { open: false, tab: "fit" }, toast: null },
};

/** Catalogues saved before garment measurements existed get the seed specs for seed products. */
function withSpecs(c: SiteContent): SiteContent {
  if (c.products.every((p) => p.measurements)) return c;
  return {
    ...c,
    products: c.products.map((p) => {
      const seed = SEED_PRODUCTS.find((x) => x.id === p.id);
      return p.measurements || !seed?.measurements ? p : { ...p, fitStyle: p.fitStyle ?? seed.fitStyle, measurements: seed.measurements };
    }),
  };
}

function load(): State {
  if (typeof window === "undefined") return INITIAL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const saved = JSON.parse(raw);
    if (saved?.v !== 1) return INITIAL;
    const next: State = { ...INITIAL, ...saved, ui: INITIAL.ui };
    return { ...next, draft: withSpecs(next.draft), published: withSpecs(next.published) };
  } catch {
    return INITIAL;
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    const { ui: _ui, ...rest } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Storage full or blocked: the session keeps working in memory.
  }
}

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  const uiOnly = Object.keys(next).every((k) => k === "ui");
  if (!uiOnly) persist();
  listeners.forEach((l) => l());
}

function setUi(patch: Partial<UiState>) {
  set((s) => ({ ui: { ...s.ui, ...patch } }));
}

if (typeof window !== "undefined") {
  // Keep several open tabs in step (e.g. admin in one, storefront in another).
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = { ...load(), ui: state.ui };
    listeners.forEach((l) => l());
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

const noop = () => () => {};
/** False during SSR and hydration, true once the browser's saved state is in use. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function getState(): State {
  return state;
}

// ── Derived reads ──────────────────────────────────────────────────────────

/** Admins see their draft on the storefront; everyone else sees what was published. */
export function siteFor(s: State): SiteContent {
  return s.session.role === "admin" ? s.draft : s.published;
}

export function isDirty(s: State): boolean {
  return JSON.stringify(s.draft) !== JSON.stringify(s.published);
}

export function productById(s: State, id: string): Product | undefined {
  return siteFor(s).products.find((p) => p.id === id);
}

export function bagCount(s: State): number {
  return s.bag.reduce((a, l) => a + l.qty, 0);
}

export function bagLines(s: State) {
  const products = siteFor(s).products;
  return s.bag.flatMap((l) => {
    const p = products.find((x) => x.id === l.productId);
    return p ? [{ ...l, product: p, lineTotal: p.price * l.qty }] : [];
  });
}

export function bagSubtotal(s: State): number {
  return bagLines(s).reduce((a, l) => a + l.lineTotal, 0);
}

export function stockLeft(p: Product): number {
  return Object.values(p.stock).reduce((a, n) => a + n, 0);
}

// ── Session ────────────────────────────────────────────────────────────────

export const ADMIN_EMAIL = /@crate\.store$/i;

/**
 * Mock sign-in: any password is accepted, and the role comes from the email
 * (any @crate.store address, such as the admin@crate.store demo account, is admin).
 * A real backend must verify the password and read the role server-side.
 */
export function signIn(email: string, name?: string) {
  const clean = email.trim().toLowerCase();
  const known = state.users.find((u) => u.email === clean);
  const role: Role = known?.role ?? (ADMIN_EMAIL.test(clean) ? "admin" : "customer");
  const displayName = known?.name ?? name ?? clean.split("@")[0];
  set((s) => ({
    session: { role, email: clean, name: displayName },
    users: known ? s.users : [...s.users, { name: displayName, email: clean, role: role as User["role"] }],
  }));
  return role;
}

export function signOut() {
  set({ session: GUEST, ui: { ...state.ui, bagOpen: false, menuOpen: false } });
}

// ── Bag ────────────────────────────────────────────────────────────────────

export function addToBag(productId: string, size: string, colour: string) {
  set((s) => {
    const i = s.bag.findIndex((l) => l.productId === productId && l.size === size && l.colour === colour);
    const bag = i >= 0 ? s.bag.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)) : [...s.bag, { productId, size, colour, qty: 1 }];
    return { bag, ui: { ...s.ui, bagOpen: true, fitRoom: { ...s.ui.fitRoom, open: false } } };
  });
}

export function setQty(index: number, qty: number) {
  set((s) => ({ bag: qty <= 0 ? s.bag.filter((_, j) => j !== index) : s.bag.map((l, j) => (j === index ? { ...l, qty } : l)) }));
}

export function toggleWishlist(productId: string) {
  set((s) => ({ wishlist: s.wishlist.includes(productId) ? s.wishlist.filter((x) => x !== productId) : [...s.wishlist, productId] }));
}

export function placeOrder(total: number): Order {
  const lines = bagLines(state);
  const n = Math.max(0, ...state.orders.map((o) => parseInt(o.no.replace(/\D/g, ""), 10) || 0)) + 1;
  const order: Order = {
    no: `#CR-${n}`,
    email: state.session.email,
    date: new Date().toISOString().slice(0, 10),
    lines: lines.map((l) => ({ productId: l.productId, name: l.product.name, size: l.size, colour: l.colour, qty: l.qty, price: l.product.price })),
    itemCount: lines.reduce((a, l) => a + l.qty, 0),
    total,
    status: "Processing",
  };
  set((s) => ({ orders: [order, ...s.orders], bag: [] }));
  return order;
}

// ── Fit profile ────────────────────────────────────────────────────────────

/** Update the body profile. Passing `undefined` for a measurement goes back to the estimate. */
export function setFit(patch: Partial<BodyProfile>) {
  set((s) => {
    const fit: BodyProfile = { ...s.fit, ...patch };
    for (const k of Object.keys(patch) as (keyof BodyProfile)[]) if (fit[k] === undefined) delete (fit as Partial<BodyProfile>)[k];
    return { fit };
  });
}

// ── UI ─────────────────────────────────────────────────────────────────────

export const openBag = () => setUi({ bagOpen: true });
export const closeBag = () => setUi({ bagOpen: false });
export const setMenu = (menuOpen: boolean) => setUi({ menuOpen });
export const openFitRoom = (tab: FitTab, productId?: string) => setUi({ fitRoom: { open: true, tab, productId } });
export const setFitTab = (tab: FitTab) => setUi({ fitRoom: { ...state.ui.fitRoom, tab } });
export const closeFitRoom = () => setUi({ fitRoom: { ...state.ui.fitRoom, open: false } });

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string) {
  setUi({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUi({ toast: null }), 3200);
}

// ── Admin: draft editing + publish ─────────────────────────────────────────

function editDraft(fn: (d: SiteContent) => Partial<SiteContent>) {
  set((s) => ({ draft: { ...s.draft, ...fn(s.draft) } }));
}

export function updateProduct(id: string, patch: Partial<Product>) {
  editDraft((d) => ({ products: d.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
}

/** Set one garment measurement for one size; an empty value clears it. */
export function updateMeasurement(id: string, size: string, key: MeasureKey, value: number | undefined) {
  editDraft((d) => ({
    products: d.products.map((p) => {
      if (p.id !== id) return p;
      const row: Measurements = { ...p.measurements?.[size] };
      if (value === undefined) delete row[key];
      else row[key] = value;
      return { ...p, measurements: { ...p.measurements, [size]: row } };
    }),
  }));
}

export function removeProduct(id: string) {
  editDraft((d) => ({
    products: d.products.filter((p) => p.id !== id),
    wear: { ...d.wear, garmentIds: d.wear.garmentIds.filter((g) => g !== id) },
  }));
}

export function addProduct(): string {
  const id = `p-${Date.now().toString(36)}`;
  const p: Product = {
    id, name: "New product", price: 0, category: "tops", colourways: ["Black"], sizes: ["S", "M", "L", "XL", "XXL"],
    stock: {}, drop: "08", fabric: "", fit: "", shape: "tee", fitStyle: "regular", measurements: {}, live: false,
    added: Math.max(0, ...state.draft.products.map((x) => x.added)) + 1,
  };
  editDraft((d) => ({ products: [p, ...d.products] }));
  return id;
}

export function moveSection(i: number, delta: number) {
  editDraft((d) => {
    const j = i + delta;
    if (j < 0 || j >= d.sections.length) return {};
    const a = d.sections.slice();
    [a[i], a[j]] = [a[j], a[i]];
    return { sections: a };
  });
}

export function toggleSection(i: number) {
  editDraft((d) => ({ sections: d.sections.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }));
}

export function updateHero(patch: Partial<Hero>) {
  editDraft((d) => ({ hero: { ...d.hero, ...patch } }));
}

export function updateWear(patch: Partial<WearSettings>) {
  editDraft((d) => ({ wear: { ...d.wear, ...patch } }));
}

/** Adjust one garment's fit on the model photo; the others keep theirs. */
export function updateWearFit(productId: string, patch: Partial<WearFit>) {
  editDraft((d) => ({
    wear: { ...d.wear, fits: { ...d.wear.fits, [productId]: { ...wearFitOf(d.wear, productId), ...patch } } },
  }));
}

/** Copy one garment's fit to every garment in rotation. */
export function applyWearFitToAll(productId: string) {
  editDraft((d) => {
    const fit = wearFitOf(d.wear, productId);
    return { wear: { ...d.wear, ...fit, fits: Object.fromEntries(d.wear.garmentIds.map((id) => [id, fit])) } };
  });
}

export function publish() {
  set((s) => ({ published: s.draft }));
}

export function discardDraft() {
  set((s) => ({ draft: s.published }));
}
