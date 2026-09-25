"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { avatarGeometry } from "@/lib/avatar";
import { BOTTOM_MEASURES, SIZE_CHART, TOP_MEASURES, isBottom, type Product } from "@/lib/data";
import { fitSize, recommend, resolveBody } from "@/lib/fit";
import { money } from "@/lib/format";
import { addToBag, closeFitRoom, setFitTab, siteFor, toast, useStore } from "@/lib/store";
import { BodyMeasures, BodySliders, overrideCount } from "./BodyProfile";
import { ImageSlot } from "./ImageSlot";

const DEFAULT_GARMENTS = ["nylon-track-jacket", "boxy-heavy-tee", "480gsm-hoodie", "double-knee-carpenter"];
const SHORT: Record<string, string> = { "nylon-track-jacket": "Track Jacket", "boxy-heavy-tee": "Heavy Tee", "480gsm-hoodie": "Hoodie", "double-knee-carpenter": "Carpenter" };
type View = "front" | "side" | "back";
const SPIN: View[] = ["front", "side", "back", "side"];

/** 3a (desktop modal) and 3b (mobile sheet): size guide + try-on. */
export function FitRoom() {
  const s = useStore();
  const { open, tab, productId } = s.ui.fitRoom;
  if (!open) return null;
  return <FitRoomDialog key={productId ?? "none"} tab={tab} productId={productId} />;
}

function FitRoomDialog({ tab, productId }: { tab: "guide" | "fit"; productId?: string }) {
  const s = useStore();
  const router = useRouter();
  const products = siteFor(s).products;
  const profile = s.fit;
  const { h, w } = profile;
  const body = resolveBody(profile);

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
  const [sizePick, setSizePick] = useState<string | undefined>();
  const [spin, setSpin] = useState(0);
  const [product, setProduct] = useState<"body" | "product">("body");
  const view = SPIN[spin % 4];
  const g = garments[gi] ?? garments[0];

  const advice = g ? recommend(g, body) : undefined;
  const size = sizePick && g?.sizes.includes(sizePick) ? sizePick : advice?.rec ?? g?.sizes[0] ?? "";
  const fit = g ? fitSize(g, body, size) : undefined;
  const geo = avatarGeometry(body, g?.shape ? { shape: g.shape, m: g.measurements?.[size] } : undefined);
  const row = SIZE_CHART.find((r) => r.size === size);

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

  const resetPick = () => setSizePick(undefined);

  const available = !!g && !!size && (g.stock[size] ?? 0) > 0;
  const add = () => {
    if (!g || !size) return;
    if (s.session.role === "guest") {
      closeFitRoom();
      toast("Sign in to add pieces to your bag.");
      router.push(`/signin?next=/product/${g.id}`);
      return;
    }
    addToBag(g.id, size, g.colourways[0]);
  };

  const rec = advice?.rec;
  const ctaLabel = !g ? "Pick a garment" : available ? `Add ${size} to bag` : `${size} is sold out`;
  const overrides = overrideCount(profile);
  const zones = fit?.zones ?? [];
  const verdict = fit?.verdict ?? "No specs yet";
  const verdictAccent = fit ? fit.verdictAccent : true;

  const views: [View, string, number][] = [["front", "Front", 0], ["side", "Side", 1], ["back", "Back", 2]];
  const stroke = { stroke: "var(--color-neutral-500)", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };
  const { head: hd } = geo;

  const avatar = (
    <div className="avatar">
      <svg viewBox="0 0 200 440" aria-label={`Avatar wearing ${g?.name ?? "nothing"} in ${size}, ${view} view`}>
        <ellipse cx="100" cy="428" rx={view === "side" ? Math.round(geo.shadowRx * 0.6) : geo.shadowRx} ry="7" fill="var(--color-neutral-300)" />
        {/* Side view: the same silhouette narrowed, as the old avatar did. */}
        <g transform={view === "side" ? "translate(100 0) scale(0.6 1) translate(-100 0)" : undefined}>
          <path d={geo.legs} fill="var(--color-neutral-200)" {...stroke} />
          <path d={geo.torso} fill="var(--color-neutral-200)" {...stroke} />
          <path d={geo.arms} fill="var(--color-neutral-200)" {...stroke} />
          <path d={geo.neck} fill="var(--color-neutral-200)" {...stroke} />
          {geo.garment && (
            <g>
              <path d={geo.garment.path} fill={geo.garment.fill} stroke="var(--color-text)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {view !== "back" && <path d={geo.garment.detail} fill="none" stroke={geo.garment.det} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
            </g>
          )}
        </g>
        <circle cx={hd.cx} cy={hd.cy} r={hd.r} fill="var(--color-neutral-200)" {...stroke} />
      </svg>
      {view === "front" && (
        <div className="face" style={{ left: `${((hd.cx - hd.r) / 200) * 100}%`, top: `${((hd.cy - hd.r) / 440) * 100}%`, width: `${((hd.r * 2) / 200) * 100}%`, height: `${((hd.r * 2) / 440) * 100}%` }}>
          <ImageSlot id="fit-face" round />
        </div>
      )}
    </div>
  );

  // Product chart: four key garment measurements, widths doubled to circumferences.
  const productCols = (g && isBottom(g) ? BOTTOM_MEASURES : TOP_MEASURES).filter((c) => c.k !== "hemW" && c.k !== "shoulder" && c.k !== "rise").slice(0, 4);
  const cm = (v: number | undefined, flat: boolean) => (v === undefined ? "—" : String(flat ? v * 2 : v));

  return (
    <div className="fit-backdrop" onClick={(e) => e.target === e.currentTarget && closeFitRoom()}>
      <div className="fit" role="dialog" aria-modal="true" aria-label="Fit room">
        <div className="fit-tabs">
          <button className={`pick ${tab === "guide" ? "acc" : ""}`} onClick={() => setFitTab("guide")}>01 Size guide</button>
          <button className={`pick ${tab === "fit" ? "acc" : ""}`} onClick={() => setFitTab("fit")}>02 Try it on<span className="only-d">&nbsp;in 3D</span></button>
          <button className="close" onClick={closeFitRoom}>Close ×</button>
        </div>

        {tab === "fit" ? (
          <div className="fit-body">
            <div className="fit-ctl">
              <section>
                <span className="label">Your body</span>
                <BodySliders profile={profile} onChange={resetPick} />
                <details className="measures-d">
                  <summary>
                    <span>Your measurements</span>
                    <span className="muted">{overrides ? `${overrides} of 6 yours, rest estimated` : "Estimated from height and weight"}</span>
                  </summary>
                  <BodyMeasures profile={profile} onChange={resetPick} />
                </details>
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
                    <button key={p.id} className={`pick ${i === gi ? "on" : ""}`} onClick={() => (setGi(i), resetPick())}>
                      <b><span className="only-d">{p.name}</span><span className="only-m">{SHORT[p.id] ?? p.name}</span></b>
                      <span className="pr">{money(p.price)}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <span className="muted">Size</span>
                  {rec && <span style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>We recommend {rec}</span>}
                </div>
                <div className="fsizes cells boxed" style={{ gridTemplateColumns: `repeat(${Math.max(1, g?.sizes.length ?? 1)}, 1fr)` }}>
                  {(g?.sizes ?? []).map((l) => (
                    <button key={l} className={`pick ${l === size ? "on" : l === rec ? "rec" : ""}`} onClick={() => setSizePick(l)} aria-pressed={l === size}>
                      <span>{l}</span>
                      <small>{l === rec ? "FOR YOU" : " "}</small>
                    </button>
                  ))}
                </div>
                {advice && <p className="why">{advice.why}</p>}
                <div className="zones-m">
                  {zones.map((z) => <div key={z.k}><span className="muted">{z.k}</span><b>{z.label} <span className="muted">{z.short}</span></b></div>)}
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
              <div className={`verdict-m ${verdictAccent ? "acc" : ""}`}>{verdict}</div>
              {avatar}
              <div className="cap"><b>{g?.name} · {size}</b><span className="muted">on {h} cm / {w} kg · chest {body.chest}</span></div>
            </div>

            <div className="fit-res">
              <div className={`verdict ${verdictAccent ? "acc" : ""}`}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Overall fit · {size}</span>
                <b>{verdict}</b>
              </div>
              <div className="zones">
                {zones.map((z) => (
                  <div className="zone" key={z.k}>
                    <div className="t"><span>{z.k}</span><span><b>{z.label}</b> · {z.note}</span></div>
                    <div className="bar">{z.bar.map((c, i) => <span key={i} style={{ background: c }} />)}</div>
                  </div>
                ))}
                {!zones.length && <div className="zone muted" style={{ fontSize: 13 }}>{advice?.why ?? "Pick a garment."}</div>}
              </div>
              <div className="scale-note muted" style={{ fontSize: 12, padding: "14px 24px" }}>
                Scale: tight ← → loose, against the room this {g?.fitStyle ?? "regular"} cut is designed to have. Uses {overrides ? "your measurements" : "measurements estimated from your height and weight"} and this piece&rsquo;s garment specs.
              </div>
              <div className="cta">
                <button className="btn btn-primary row h56" onClick={add} disabled={!available} style={{ fontSize: 15 }}><span>{ctaLabel}</span><span>→</span></button>
                {rec && <button className="btn btn-secondary row h44 use-rec" onClick={resetPick}><span>Use recommended ({rec})</span><span>↺</span></button>}
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
