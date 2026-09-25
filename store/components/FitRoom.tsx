"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Slot, Wear } from "@/lib/avatar3d";
import { BOTTOM_MEASURES, SIZE_CHART, TOP_MEASURES, isBottom, type Product } from "@/lib/data";
import { fitSize, recommend, resolveBody, type Level } from "@/lib/fit";
import { money } from "@/lib/format";
import { useImage } from "@/lib/images";
import { addToBag, closeFitRoom, setFitTab, siteFor, toast, useStore } from "@/lib/store";
import { BodyMeasures, BodySliders, overrideCount } from "./BodyProfile";
import { ImageSlot, productImg } from "./ImageSlot";
import type { Focus } from "./Lobby3D";
import { SWATCH } from "./ProductCard";
import { RealTryOn } from "./RealTryOn";

const Lobby3D = dynamic(() => import("./Lobby3D"), { ssr: false, loading: () => <div className="lobby3d"><div className="lobby-fail">Loading 3D…</div></div> });

const DEFAULTS: Partial<Record<Slot, string>> = { top: "boxy-heavy-tee", bottom: "double-knee-carpenter" };
const SLOTS: { k: Slot; l: string }[] = [
  { k: "top", l: "Tops" },
  { k: "outer", l: "Outerwear" },
  { k: "bottom", l: "Bottoms" },
  { k: "head", l: "Caps" },
];
const SLOT_ONE: Record<Slot, string> = { top: "Top", outer: "Outer", bottom: "Bottom", head: "Cap" };
const SKINS = ["#f1d3bf", "#e0b394", "#c68e6a", "#9a6444", "#6b4330", "#3f271c"];
const HAIRS = ["#1c1714", "#4a3121", "#8a5a33", "#c9a36a", "#8f8a84"];
const VIEWS: [string, number][] = [["Front", 0], ["Side", -Math.PI / 2], ["Back", Math.PI]];

/** Which part of the outfit a product fills; accessories only if they're a cap or hat. */
function slotOf(p: Product): Slot | undefined {
  if (p.category === "accessories") return /cap|hat|beanie/i.test(p.name) ? "head" : undefined;
  if (p.category === "bottoms" || p.shape === "pants") return "bottom";
  if (p.category === "outerwear") return "outer";
  return "top";
}

/** Swatch colour for a colourway; unknown names fall back to a neutral step. */
const swatch = (c: string) => SWATCH[c] ?? "var(--color-neutral-500)";

function useLocal<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setV(saved as T);
    } catch {}
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {}
  };
  return [v, set];
}

/** 3a (desktop modal) and 3b (mobile sheet): size guide + try-on. */
export function FitRoom() {
  const s = useStore();
  const { open, tab, productId } = s.ui.fitRoom;
  if (!open) return null;
  return <FitRoomDialog key={productId ?? "none"} tab={tab} productId={productId} />;
}

function FitRoomDialog({ tab, productId }: { tab: "guide" | "fit" | "real"; productId?: string }) {
  const s = useStore();
  const router = useRouter();
  const products = siteFor(s).products;
  const profile = s.fit;
  const { h, w } = profile;
  const body = useMemo(() => resolveBody(profile), [profile]);

  // Everything that can be worn in the fit room, grouped by slot.
  const wardrobe = useMemo(() => {
    const out: Record<Slot, Product[]> = { top: [], outer: [], bottom: [], head: [] };
    for (const p of products) {
      const k = slotOf(p);
      if (k && (p.live || p.id === productId) && (p.shape || k === "head")) out[k].push(p);
    }
    return out;
  }, [products, productId]);
  const byId = (id?: string) => (id ? products.find((p) => p.id === id) : undefined);

  // The outfit: one piece per slot, starting with the piece the room was opened for.
  const [outfit, setOutfit] = useState<Partial<Record<Slot, string>>>(() => {
    const o: Partial<Record<Slot, string>> = {};
    const opened = byId(productId);
    const k = opened && slotOf(opened);
    if (opened && k) o[k] = opened.id;
    for (const [slot, id] of Object.entries(DEFAULTS) as [Slot, string][]) if (!o[slot] && byId(id)) o[slot] = id;
    return o;
  });
  const [focusId, setFocusId] = useState<string | undefined>(() => (byId(productId) && slotOf(byId(productId)!) ? productId : outfit.top ?? outfit.bottom));
  const [shelf, setShelf] = useState<Slot>(() => (byId(focusId) && slotOf(byId(focusId)!)) || "top");
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [colours, setColours] = useState<Record<string, string>>({});
  const [heat, setHeat] = useState(false);
  const [cam, setCam] = useState<Focus>("full");
  const [turn, setTurn] = useState({ yaw: 0, n: 0 });
  const [dragging, setDragging] = useState(false);
  const [skin, setSkin] = useLocal("crate-fit-skin", SKINS[1]);
  const [hair, setHair] = useLocal("crate-fit-hair", HAIRS[0]);
  const [product, setProduct] = useState<"body" | "product">("body");
  const faceUrl = useImage("fit-face");

  const g = byId(focusId);
  const sizeFor = (p: Product) => {
    const pick = sizes[p.id];
    if (pick && p.sizes.includes(pick)) return pick;
    return (p.measurements ? recommend(p, body).rec : undefined) ?? p.sizes[0] ?? "";
  };
  const colourFor = (p: Product) => (colours[p.id] && p.colourways.includes(colours[p.id]) ? colours[p.id] : p.colourways[0]);

  const advice = g?.measurements ? recommend(g, body) : undefined;
  const size = g ? sizeFor(g) : "";
  const fit = g ? fitSize(g, body, size) : undefined;
  const row = SIZE_CHART.find((r) => r.size === size);
  const setSizePick = (l: string) => g && setSizes((m) => ({ ...m, [g.id]: l }));
  const resetPick = () => g && setSizes((m) => {
    const { [g.id]: _, ...rest } = m;
    return rest;
  });

  const worn = (Object.entries(outfit) as [Slot, string][]).map(([slot, id]) => ({ slot, p: byId(id) })).filter((x): x is { slot: Slot; p: Product } => !!x.p);
  const wear: Wear[] = useMemo(() => worn.map(({ slot, p }) => {
    const z = sizeFor(p);
    const f = fitSize(p, body, z);
    const zones: Record<string, Level> = {};
    for (const zn of f?.zones ?? []) zones[zn.k] = zn.level;
    return { id: p.id, slot, shape: p.shape, fitStyle: p.fitStyle, m: p.measurements?.[z], colour: swatch(colourFor(p)), zones, name: p.name };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [JSON.stringify(outfit), sizes, colours, body, products]);

  const equip = (p: Product) => {
    const k = slotOf(p);
    if (!k) return;
    if (outfit[k] === p.id) {
      // Second tap on the focused piece takes it off (the bottom slot is never left empty).
      if (focusId === p.id && k !== "bottom") {
        setOutfit((o) => ({ ...o, [k]: undefined }));
        setFocusId(worn.find((x) => x.p.id !== p.id)?.p.id);
        return;
      }
    } else setOutfit((o) => ({ ...o, [k]: p.id }));
    setFocusId(p.id);
    setCam(k === "bottom" ? "bottom" : "top");
  };
  const unequip = (k: Slot) => {
    const id = outfit[k];
    setOutfit((o) => ({ ...o, [k]: undefined }));
    if (id === focusId) setFocusId(worn.find((x) => x.slot !== k)?.p.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeFitRoom();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  const guestGate = () => {
    if (s.session.role !== "guest") return false;
    closeFitRoom();
    toast("Sign in to add pieces to your bag.");
    router.push(`/signin?next=/product/${g?.id ?? ""}`);
    return true;
  };
  const inStock = (p: Product, z: string) => (p.stock[z] ?? 0) > 0;
  const available = !!g && !!size && inStock(g, size);
  const add = () => {
    if (!g || !size || guestGate()) return;
    addToBag(g.id, size, colourFor(g));
  };
  const lookable = worn.filter(({ p }) => inStock(p, sizeFor(p)));
  const lookTotal = lookable.reduce((t, { p }) => t + p.price, 0);
  const addLook = () => {
    if (guestGate()) return;
    for (const { p } of lookable) addToBag(p.id, sizeFor(p), colourFor(p));
  };

  const rec = advice?.rec;
  const ctaLabel = !g ? "Pick a piece" : available ? `Add ${size} to bag` : `${size} is sold out`;
  const overrides = overrideCount(profile);
  const zones = fit?.zones ?? [];
  const verdict = fit?.verdict ?? (g?.measurements ? "No specs yet" : "One size");
  const verdictAccent = fit ? fit.verdictAccent : false;

  // Product chart: four key garment measurements, widths doubled to circumferences.
  const productCols = (g && isBottom(g) ? BOTTOM_MEASURES : TOP_MEASURES).filter((c) => c.k !== "hemW" && c.k !== "shoulder" && c.k !== "rise").slice(0, 4);
  const cm = (v: number | undefined, flat: boolean) => (v === undefined ? "—" : String(flat ? v * 2 : v));

  return (
    <div className="fit-backdrop" onClick={(e) => e.target === e.currentTarget && closeFitRoom()}>
      <div className="fit" role="dialog" aria-modal="true" aria-label="Fit room">
        <div className="fit-tabs">
          <button className={`pick ${tab === "guide" ? "acc" : ""}`} onClick={() => setFitTab("guide")}>01 Size guide</button>
          <button className={`pick ${tab === "fit" ? "acc" : ""}`} onClick={() => setFitTab("fit")}>02 Fit<span className="only-d">&nbsp;in 3D</span></button>
          <button className={`pick ${tab === "real" ? "acc" : ""}`} onClick={() => setFitTab("real")}>03<span className="only-d">&nbsp;Real</span> try-on</button>
          <button className="close" onClick={closeFitRoom}>Close ×</button>
        </div>

        {tab === "real" ? (
          <RealTryOn productId={productId} />
        ) : tab === "fit" ? (
          <div className="fit-body">
            <div className="fit-ctl">
              <section>
                <span className="label">Wardrobe</span>
                <div className="shelf-tabs cells boxed">
                  {SLOTS.filter((x) => wardrobe[x.k].length).map((x) => (
                    <button key={x.k} className={`pick ${shelf === x.k ? "on" : ""}`} onClick={() => setShelf(x.k)}>{x.l}</button>
                  ))}
                </div>
                <div className="shelf">
                  {wardrobe[shelf].map((p) => {
                    const on = outfit[shelf] === p.id;
                    return (
                      <button key={p.id} className={`item ${on ? "on" : ""} ${focusId === p.id ? "focus" : ""}`} onClick={() => equip(p)} aria-pressed={on}>
                        <span className="ph"><ImageSlot id={productImg(p.id)} src={p.photo} placeholder={p.name} fit="contain" /><i className="dot" style={{ background: swatch(colourFor(p)) }} /></span>
                        <b>{p.name}</b>
                        <span>{on ? (focusId === p.id && shelf !== "bottom" ? "Wearing · tap to take off" : "Wearing") : money(p.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              {g && (
                <section>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", gap: 8 }}>
                    <span className="muted">{g.name}</span>
                    {rec && <span style={{ color: "var(--color-accent-700)", fontWeight: 600, whiteSpace: "nowrap" }}>We recommend {rec}</span>}
                  </div>
                  <div className="fsizes cells boxed" style={{ gridTemplateColumns: `repeat(${Math.max(1, g.sizes.length)}, 1fr)` }}>
                    {g.sizes.map((l) => (
                      <button key={l} className={`pick ${l === size ? "on" : l === rec ? "rec" : ""}`} onClick={() => setSizePick(l)} aria-pressed={l === size}>
                        <span>{l}</span>
                        <small>{l === rec ? "FOR YOU" : " "}</small>
                      </button>
                    ))}
                  </div>
                  {g.colourways.length > 1 && (
                    <div className="cw-row" role="radiogroup" aria-label="Colour">
                      {g.colourways.map((c) => (
                        <button key={c} role="radio" aria-checked={c === colourFor(g)} aria-label={c} title={c} className={`swatch ${c === colourFor(g) ? "on" : ""}`} style={{ background: swatch(c) }} onClick={() => setColours((m) => ({ ...m, [g.id]: c }))} />
                      ))}
                      <span className="muted" style={{ fontSize: 13 }}>{colourFor(g)}</span>
                    </div>
                  )}
                  {advice && <p className="why">{advice.why}</p>}
                  <div className="zones-m">
                    {zones.map((z) => <div key={z.k}><span className="muted">{z.k}</span><b>{z.label} <span className="muted">{z.short}</span></b></div>)}
                  </div>
                </section>
              )}
              <section>
                <span className="label">Your body</span>
                <BodySliders profile={profile} onChange={() => setSizes({})} />
                <details className="measures-d">
                  <summary>
                    <span>Your measurements</span>
                    <span className="muted">{overrides ? `${overrides} of 6 yours, rest estimated` : "Estimated from height and weight"}</span>
                  </summary>
                  <BodyMeasures profile={profile} onChange={() => setSizes({})} />
                </details>
                <div className="look-row">
                  <span className="muted">Skin</span>
                  <div className="cw-row">{SKINS.map((c) => <button key={c} aria-label={`Skin tone ${c}`} className={`swatch ${skin === c ? "on" : ""}`} style={{ background: c }} onClick={() => setSkin(c)} />)}</div>
                </div>
                <div className="look-row">
                  <span className="muted">Hair</span>
                  <div className="cw-row">{HAIRS.map((c) => <button key={c} aria-label={`Hair colour ${c}`} className={`swatch ${hair === c ? "on" : ""}`} style={{ background: c }} onClick={() => setHair(c)} />)}</div>
                </div>
                <div className="face-row">
                  <div className="ph"><ImageSlot id="fit-face" round editable placeholder="face" /></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Face photo</span>
                    <span className="muted" style={{ fontSize: 12 }}>Front-facing and well lit. It stays on this device and is only used on your avatar.</span>
                  </div>
                </div>
              </section>
            </div>

            <div className={`stage lobby ${dragging ? "dragging" : ""}`}>
              <Lobby3D body={body} wear={wear} skin={skin} hair={hair} faceUrl={faceUrl} heat={heat} focus={cam} turn={turn} onDragChange={setDragging} />
              <div className="top">
                <div className="views">
                  {VIEWS.map(([l, yaw]) => (
                    <button key={l} className="pick" onClick={() => setTurn((t) => ({ yaw, n: t.n + 1 }))}>{l}</button>
                  ))}
                </div>
                <div className="views">
                  <button className={`pick ${cam === "full" ? "on" : ""}`} onClick={() => setCam("full")}>Full look</button>
                  <button className={`pick ${heat ? "on" : ""}`} onClick={() => setHeat(!heat)} aria-pressed={heat}>Fit heat</button>
                </div>
              </div>
              {heat && (
                <div className="heat-key" aria-label="Fit heat key">
                  <span><i style={{ background: "#e0321b" }} />Tight</span>
                  <span><i style={{ background: "#3aa76d" }} />Right</span>
                  <span><i style={{ background: "#2f5fc4" }} />Loose</span>
                </div>
              )}
              <div className="loadout">
                {SLOTS.map(({ k }) => {
                  const p = byId(outfit[k]);
                  if (!p) return null;
                  return (
                    <div key={k} className={`chip ${focusId === p.id ? "on" : ""}`}>
                      <button className="unbtn" onClick={() => { setFocusId(p.id); setShelf(k); setCam(k === "bottom" ? "bottom" : "top"); }}>
                        <span className="muted">{SLOT_ONE[k]}</span> <b>{p.name}</b> · {sizeFor(p)}
                      </button>
                      {k !== "bottom" && <button className="unbtn x" aria-label={`Take off ${p.name}`} onClick={() => unequip(k)}>×</button>}
                    </div>
                  );
                })}
              </div>
              <span className="hint drag-hint">Drag to turn · scroll to zoom</span>
            </div>

            <div className="fit-res">
              <div className={`verdict ${verdictAccent ? "acc" : ""}`}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{g ? `${g.name} · ${size}` : "Overall fit"}</span>
                <b>{verdict}</b>
              </div>
              <div className="zones">
                {zones.map((z) => (
                  <div className="zone" key={z.k}>
                    <div className="t"><span>{z.k}</span><span><b>{z.label}</b> · {z.note}</span></div>
                    <div className="bar">{z.bar.map((c, i) => <span key={i} style={{ background: c }} />)}</div>
                  </div>
                ))}
                {!zones.length && <div className="zone muted" style={{ fontSize: 13 }}>{advice?.why ?? (g ? "No fit to check: this piece is one size." : "Pick a piece.")}</div>}
              </div>
              <div className="scale-note muted" style={{ fontSize: 12, padding: "14px 24px" }}>
                On {h} cm / {w} kg · chest {body.chest}. Scale: tight ← → loose, against the room this {g?.fitStyle ?? "regular"} cut is designed to have. Uses {overrides ? "your measurements" : "measurements estimated from your height and weight"}.
              </div>
              <div className="cta">
                <button className="btn btn-primary row h56" onClick={add} disabled={!available} style={{ fontSize: 15 }}><span>{ctaLabel}</span><span>→</span></button>
                {worn.length > 1 && (
                  <button className="btn btn-secondary row h44" onClick={addLook} disabled={!lookable.length}>
                    <span>Add the look ({lookable.length})</span><span>{money(lookTotal)} →</span>
                  </button>
                )}
                {rec && sizes[g!.id] && sizes[g!.id] !== rec && <button className="btn btn-secondary row h44 use-rec" onClick={resetPick}><span>Use recommended ({rec})</span><span>↺</span></button>}
              </div>
            </div>
          </div>
        ) : (
          <div className="fit-body">
            <div className="guide-l">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="label">Stretch</span>
                <div className="stretch"><span>None</span><span className="on">Slight</span><span>Medium</span><span>High</span></div>
              </div>
              <div className="body-fig">
                <svg viewBox="0 0 200 440" width="260" height="572" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
                  <circle cx="100" cy="38" r="22" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
                  <path d="M92 58 L92 76 M108 58 L108 76 M62 84 C48 88 44 104 44 120 L38 240 L50 242 L60 130 M138 84 C152 88 156 104 156 120 L162 240 L150 242 L140 130 M64 205 L68 420 L94 420 L99 225 L101 225 L106 420 L132 420 L136 205 M60 82 Q100 70 140 82 L134 170 Q132 190 136 205 L64 205 Q68 190 66 170 Z" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
                  <ellipse cx="100" cy="108" rx="44" ry="7" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
                  <ellipse cx="100" cy="165" rx="36" ry="6" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
                  <line x1="180" y1="16" x2="180" y2="420" stroke="var(--color-accent)" strokeWidth="3" />
                </svg>
                <span className="lbl" style={{ left: -100, top: 128 }}>Chest {row?.chest ?? body.chest}</span>
                <span className="lbl" style={{ left: -100, top: 202 }}>Waist {row?.waist ?? body.waist}</span>
                <span className="lbl" style={{ left: 200, top: 280 }}>{row?.height ?? h}</span>
              </div>
            </div>
            <div className="guide-r">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="seg">
                  <label className="seg-opt"><input type="radio" name="chart" checked={product === "body"} onChange={() => setProduct("body")} /><span>Body chart</span></label>
                  <label className="seg-opt"><input type="radio" name="chart" checked={product === "product"} onChange={() => setProduct("product")} /><span>Product chart</span></label>
                </div>
                <span style={{ fontSize: 13 }}>Units: cm · EU</span>
              </div>
              {product === "body" ? (
                <div className="chart">
                  <div className="hd"><span>Size</span><span>EU</span><span>Chest</span><span>Waist</span><span>Height</span></div>
                  {SIZE_CHART.map((r) => (
                    <button key={r.size} className={`pick ${r.size === size ? "sel" : ""}`} onClick={() => g?.sizes.includes(r.size) && setSizePick(r.size)}>
                      <span>{r.size}</span><span>{r.eu}</span><span>{r.chest}</span><span>{r.waist}</span><span>{r.height}</span>
                    </button>
                  ))}
                </div>
              ) : g?.measurements && Object.keys(g.measurements).length ? (
                <>
                  <div className="chart">
                    <div className="hd"><span>Size</span>{productCols.map((c) => <span key={c.k}>{c.l.replace(/ (width|length)$/, "")}</span>)}</div>
                    {g.sizes.map((z) => {
                      const m = g.measurements?.[z] ?? {};
                      return (
                        <button key={z} className={`pick ${z === size ? "sel" : ""}`} onClick={() => setSizePick(z)}>
                          <span>{z}</span>
                          {productCols.map((c) => <span key={c.k}>{cm(m[c.k], c.k.endsWith("W"))}</span>)}
                        </button>
                      );
                    })}
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>{g.name}, measured flat. Chest, waist, hip and thigh widths are doubled to circumferences so you can compare them with your body.</span>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>We don&rsquo;t have garment measurements for {g?.name ?? "this piece"} yet.</p>
              )}
              <div className="model-note">
                <div className="ph grayscale"><ImageSlot id="fit-model" round placeholder="model" editable={s.session.role === "admin"} /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Model wears M · True to size</span>
                  <span className="muted" style={{ fontSize: 13 }}>Height 188 cm · Chest 98 cm · Waist 82 cm</span>
                </div>
              </div>
              <button className="btn btn-primary row h52" style={{ marginTop: "auto" }} onClick={() => setFitTab("fit")}><span>Not sure? Try it on in 3D</span><span>→</span></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
