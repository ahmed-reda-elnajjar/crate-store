"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SIZE_CHART, type Product } from "@/lib/data";
import { FIT_SIZES, computeFit, type View } from "@/lib/fit";
import { money } from "@/lib/format";
import { addToBag, closeFitRoom, setFit, setFitTab, siteFor, toast, useStore } from "@/lib/store";
import { ImageSlot } from "./ImageSlot";
import { RealTryOn } from "./RealTryOn";

const DEFAULT_GARMENTS = ["nylon-track-jacket", "boxy-heavy-tee", "480gsm-hoodie", "double-knee-carpenter"];
const SHORT: Record<string, string> = { "nylon-track-jacket": "Track Jacket", "boxy-heavy-tee": "Heavy Tee", "480gsm-hoodie": "Hoodie", "double-knee-carpenter": "Carpenter" };
const SPIN: View[] = ["front", "side", "back", "side"];

/** Map a fit-room size (S…XXXL) onto the sizes a product is actually cut in. */
function productSize(p: Product, idx: number): string | undefined {
  const label = FIT_SIZES[idx];
  if (p.sizes.includes(label)) return label;
  if (p.sizes.every((x) => /^\d+$/.test(x))) return p.sizes[idx + 1]; // waist sizes: S→30 … XL→36
  return undefined;
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
  const { h, w } = s.fit;

  const garments = useMemo(() => {
    const list = DEFAULT_GARMENTS.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p && !!p.shape);
    const opened = products.find((p) => p.id === productId);
    if (opened?.shape && !list.some((p) => p.id === opened.id)) {
      const i = list.findIndex((p) => p.shape === opened.shape);
      if (i >= 0) list[i] = opened;
      else list.unshift(opened);
    }
    return list.slice(0, 4);
  }, [products, productId]);

  const [gi, setGi] = useState(() => Math.max(0, garments.findIndex((p) => p.id === productId)));
  const [sizePick, setSizePick] = useState<number | undefined>();
  const [spin, setSpin] = useState(0);
  const [product, setProduct] = useState<"body" | "product">("body");
  const view = SPIN[spin % 4];
  const g = garments[gi] ?? garments[0];

  const fitRec = computeFit({ h, w, size: 0, shape: g?.shape ?? "tee", view }).rec;
  const size = sizePick ?? fitRec;
  const fit = computeFit({ h, w, size, shape: g?.shape ?? "tee", view });
  const row = SIZE_CHART[size];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeFitRoom();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  // Drag across the stage to turn the avatar: front → side → back → side.
  const drag = useRef<{ x: number; start: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, start: spin };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const steps = Math.round((e.clientX - drag.current.x) / 70);
    setSpin((((drag.current.start + steps) % 4) + 4) % 4);
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const setBody = (patch: { h?: number; w?: number }) => {
    setFit(patch);
    setSizePick(undefined);
  };

  const target = g ? productSize(g, size) : undefined;
  const available = !!g && !!target && (g.stock[target] ?? 0) > 0;
  const add = () => {
    if (!g || !target) return;
    if (s.session.role === "guest") {
      closeFitRoom();
      toast("Sign in to add pieces to your bag.");
      router.push(`/signin?next=/product/${g.id}`);
      return;
    }
    addToBag(g.id, target, g.colourways[0]);
  };

  const sizeLabel = FIT_SIZES[size];
  const recLabel = FIT_SIZES[fit.rec];
  const ctaLabel = !g ? "Pick a garment" : !target ? `${g.name} isn't cut in ${sizeLabel}` : available ? `Add ${sizeLabel} to bag` : `${sizeLabel} is sold out`;

  const views: [View, string, number][] = [["front", "Front", 0], ["side", "Side", 1], ["back", "Back", 2]];

  const avatar = (
    <div className="avatar">
      <svg viewBox="0 0 200 440" aria-label={`Avatar wearing ${g?.name ?? "nothing"} in ${sizeLabel}, ${view} view`}>
        <ellipse cx="100" cy="428" rx={fit.shadowRx} ry="7" fill="var(--color-neutral-300)" />
        <circle cx="100" cy="38" r="22" fill="var(--color-neutral-200)" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
        <g transform={fit.bodyT}>
          <rect x="92" y="58" width="16" height="20" fill="var(--color-neutral-200)" stroke="var(--color-neutral-500)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d="M62 84 C48 88 44 104 44 120 L38 240 L50 242 L60 130 Z M138 84 C152 88 156 104 156 120 L162 240 L150 242 L140 130 Z" fill="var(--color-neutral-200)" stroke="var(--color-neutral-500)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d="M64 205 L68 420 L94 420 L99 225 L101 225 L106 420 L132 420 L136 205 Z" fill="var(--color-neutral-200)" stroke="var(--color-neutral-500)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d="M60 82 Q100 70 140 82 L134 170 Q132 190 136 205 L64 205 Q68 190 66 170 Z" fill="var(--color-neutral-200)" stroke="var(--color-neutral-500)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <g transform={fit.garmentT} style={{ transition: "transform .3s" }}>
            <path d={fit.garment.path} fill={fit.garment.fill} stroke="var(--color-text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {view !== "back" && <path d={fit.garment.detail} fill="none" stroke={fit.garment.det} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          </g>
        </g>
      </svg>
      {view === "front" && <div className="face"><ImageSlot id="fit-face" round /></div>}
    </div>
  );

  return (
    <div className="fit-backdrop" onClick={(e) => e.target === e.currentTarget && closeFitRoom()}>
      <div className="fit" role="dialog" aria-modal="true" aria-label="Fit room">
        <div className="fit-tabs">
          <button className={`pick ${tab === "guide" ? "acc" : ""}`} onClick={() => setFitTab("guide")}>01 Size guide</button>
          <button className={`pick ${tab === "fit" ? "acc" : ""}`} onClick={() => setFitTab("fit")}>02 Fit<span className="only-d">&nbsp;by zone</span></button>
          <button className={`pick ${tab === "real" ? "acc" : ""}`} onClick={() => setFitTab("real")}>03<span className="only-d">&nbsp;Real</span> try-on</button>
          <button className="close" onClick={closeFitRoom}>Close ×</button>
        </div>

        {tab === "real" ? (
          <RealTryOn productId={productId} />
        ) : tab === "fit" ? (
          <div className="fit-body">
            <div className="fit-ctl">
              <section>
                <span className="label">Your body</span>
                <div className="body-sliders">
                  <label className="slider">
                    <span className="t"><span>Height</span><b>{h} cm</b></span>
                    <input type="range" min={150} max={200} value={h} onChange={(e) => setBody({ h: +e.target.value })} />
                  </label>
                  <label className="slider">
                    <span className="t"><span>Weight</span><b>{w} kg</b></span>
                    <input type="range" min={45} max={130} value={w} onChange={(e) => setBody({ w: +e.target.value })} />
                  </label>
                </div>
                <div className="face-row">
                  <div className="ph"><ImageSlot id="fit-face" round editable placeholder="face" /></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Face photo</span>
                    <span className="muted" style={{ fontSize: 12 }}>Front-facing and well lit. It stays on this device and is only used on your avatar.</span>
                  </div>
                </div>
              </section>
              <section>
                <span className="label">Garment</span>
                <div className="garm cells boxed">
                  {garments.map((p, i) => (
                    <button key={p.id} className={`pick ${i === gi ? "on" : ""}`} onClick={() => setGi(i)}>
                      <b><span className="only-d">{p.name}</span><span className="only-m">{SHORT[p.id] ?? p.name}</span></b>
                      <span className="pr">{money(p.price)}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <span className="muted">Size</span>
                  <span style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>We recommend {recLabel}</span>
                </div>
                <div className="fsizes cells boxed">
                  {FIT_SIZES.map((l, i) => (
                    <button key={l} className={`pick ${i === size ? "on" : i === fit.rec ? "rec" : ""}`} onClick={() => setSizePick(i)} aria-pressed={i === size}>
                      <span>{l}</span>
                      <small>{i === fit.rec ? "FOR YOU" : " "}</small>
                    </button>
                  ))}
                </div>
                <div className="zones-m">
                  {fit.zones.map((z) => <div key={z.k}><span className="muted">{z.k}</span><b>{z.v}</b></div>)}
                </div>
              </section>
            </div>

            <div className={`stage ${dragging ? "dragging" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <div className="grid-bg" />
              <div className="top">
                <div className="views">
                  {views.map(([k, l, idx]) => (
                    <button key={k} className={`pick ${view === k ? "on" : ""}`} onClick={() => setSpin(idx)}>{l}</button>
                  ))}
                </div>
                <span className="hint muted" style={{ fontSize: 12 }}>Drag to rotate · 360°</span>
              </div>
              <div className={`verdict-m ${fit.verdictAccent ? "acc" : ""}`}>{fit.verdict}</div>
              {avatar}
              <div className="cap"><b>{g?.name} · {sizeLabel}</b><span className="muted">on {h} cm / {w} kg</span></div>
            </div>

            <div className="fit-res">
              <div className={`verdict ${fit.verdictAccent ? "acc" : ""}`}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Overall fit</span>
                <b>{fit.verdict}</b>
              </div>
              <div className="zones">
                {fit.zones.map((z) => (
                  <div className="zone" key={z.k}>
                    <div className="t"><span>{z.k}</span><b>{z.v}</b></div>
                    <div className="bar">{z.bar.map((c, i) => <span key={i} style={{ background: c }} />)}</div>
                  </div>
                ))}
              </div>
              <div className="scale-note muted" style={{ fontSize: 12, padding: "14px 24px" }}>Scale: tight ← → loose. The estimate uses your height and weight.</div>
              <div className="cta">
                <button className="btn btn-primary row h56" onClick={add} disabled={!available} style={{ fontSize: 15 }}><span>{ctaLabel}</span><span>→</span></button>
                <button className="btn btn-secondary row h44 use-rec" onClick={() => setSizePick(undefined)}><span>Use recommended ({recLabel})</span><span>↺</span></button>
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
                <span className="lbl" style={{ left: -100, top: 128 }}>Chest {row.chest}</span>
                <span className="lbl" style={{ left: -100, top: 202 }}>Waist {row.waist}</span>
                <span className="lbl" style={{ left: 200, top: 280 }}>{row.height}</span>
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
              <div className="chart">
                <div className="hd"><span>Size</span><span>EU</span><span>Chest</span><span>Waist</span><span>{product === "body" ? "Height" : "Length"}</span></div>
                {SIZE_CHART.map((r, i) => {
                  // Product chart: garment flat measurements. PLACEHOLDER — derived from
                  // the body chart with standard ease until real garment specs exist.
                  const ease = (range: string, add: number) => range.split("–").map((n) => +n + add).join("–");
                  return (
                    <button key={r.size} className={`pick ${i === size ? "sel" : ""}`} onClick={() => setSizePick(i)}>
                      <span>{r.size}</span><span>{r.eu}</span>
                      <span>{product === "body" ? r.chest : ease(r.chest, 12)}</span>
                      <span>{product === "body" ? r.waist : ease(r.waist, 14)}</span>
                      <span>{product === "body" ? r.height : String(70 + i * 2)}</span>
                    </button>
                  );
                })}
              </div>
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
