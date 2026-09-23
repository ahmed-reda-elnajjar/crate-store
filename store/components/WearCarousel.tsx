"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Product, WearFit, WearSettings } from "@/lib/data";
import { cutoutGarment } from "@/lib/cutout";
import { money } from "@/lib/format";
import { getImageBlob, putImage } from "@/lib/images";
import { toast, updateWear } from "@/lib/store";
import { ImageSlot } from "./ImageSlot";

const wearImg = (productId: string) => `wear-g-${productId}`;

/** Aligned garments sit 1:1 on the model photo; nudges start from zero. */
const ALIGNED_FIT: WearFit = { topPct: 0, scalePct: 100, xPct: 0 };

/** The fit for one garment: its own override, else the shared default for the mode. */
const fitOf = (wear: WearSettings, id: string): WearFit =>
  wear.aligned
    ? (wear.alignedFits?.[id] ?? ALIGNED_FIT)
    : (wear.fits?.[id] ?? { topPct: wear.topPct, scalePct: wear.scalePct, xPct: wear.xPct });

/** How far the fit can move, per mode. Aligned garments only need small nudges. */
const rangeOf = (wear: WearSettings) =>
  wear.aligned
    ? { top: [-25, 25], scale: [60, 140], x: [-25, 25] }
    : { top: [-10, 60], scale: [30, 180], x: [-40, 40] };

const clamp = (v: number, [a, b]: number[]) => Math.round(Math.min(b, Math.max(a, v)) * 2) / 2;

/** Saves a fit change for one garment into the draft, clamped to the mode's range. */
function saveFit(wear: WearSettings, id: string, patch: Partial<WearFit>) {
  const r = rangeOf(wear);
  const key = wear.aligned ? "alignedFits" : "fits";
  const next = { ...fitOf(wear, id), ...patch };
  next.topPct = clamp(next.topPct, r.top);
  next.scalePct = clamp(next.scalePct, r.scale);
  next.xPct = clamp(next.xPct, r.x);
  updateWear({ [key]: { ...wear[key], [id]: next } });
}

/** Background removal for the current mode: trimmed cut-outs, or full-canvas when aligned. */
const cutterFor = (wear: WearSettings) => (file: Blob) => cutoutGarment(file, { trim: !wear.aligned });

/** Cuts the neck opening out of a trimmed garment: an ellipse centred on its top edge. */
function neckMask(neck: number | undefined, w: number): React.CSSProperties {
  if (!neck) return {};
  const rx = (w * neck) / 200;
  const mask = `radial-gradient(${rx}px ${rx * 1.15}px at 50% 0, transparent 97%, #000 100%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 760px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

/**
 * Section 5: one model photo; the collection's garments (cut-out PNGs) rotate
 * onto the upper body. Positions follow wearVals() in the design: the current
 * garment sits on the model, neighbours fade out to the sides.
 */
export function WearCarousel({ wear, products, editable, standalone }: { wear: WearSettings; products: Product[]; editable?: boolean; standalone?: boolean }) {
  const G = wear.garmentIds.map((id) => products.find((p) => p.id === id && (p.live || editable))).filter((p): p is Product => !!p);
  const n = G.length;
  const [wi, setWi] = useState(0);
  // Editors start paused so the garment being fitted stays put.
  const [playing, setPlaying] = useState(!editable);
  useEffect(() => {
    if (editable) setPlaying(false); // the role is only known after hydration
  }, [editable]);
  const mobile = useIsMobile();
  const idx = n ? ((wi % n) + n) % n : 0;

  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setInterval(() => setWi((i) => i + 1), Math.max(1.5, wear.rotateSeconds) * 1000);
    return () => clearInterval(t);
  }, [playing, n, wear.rotateSeconds]);

  // Swipe on touch screens.
  const swipe = useRef<number | null>(null);

  // Admins move the garment by dragging it and resize it from the corner handle.
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; f: WearFit; id: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Height/width of each trimmed cut-out, so its box (and resize handle) hugs the garment.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const startDrag = (e: React.PointerEvent, mode: "move" | "resize", id: string) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, x: e.clientX, y: e.clientY, f: fitOf(wear, id), id };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === "move") {
      saveFit(wear, d.id, { xPct: d.f.xPct + (dx / mw) * 100, topPct: d.f.topPct + (dy / mh) * 100 });
    } else {
      // The garment is centred, so a corner moved by dx changes the width by 2·dx.
      const w0 = (mw * d.f.scalePct) / 100;
      saveFit(wear, d.id, { scalePct: (d.f.scalePct * (w0 + 2 * dx)) / w0 });
    }
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  const nudge = (e: React.KeyboardEvent, id: string) => {
    const f = fitOf(wear, id);
    const step = e.shiftKey ? 2 : 0.5;
    const patch: Partial<WearFit> | null =
      e.key === "ArrowLeft" ? { xPct: f.xPct - step } :
      e.key === "ArrowRight" ? { xPct: f.xPct + step } :
      e.key === "ArrowUp" ? { topPct: f.topPct - step } :
      e.key === "ArrowDown" ? { topPct: f.topPct + step } :
      e.key === "+" || e.key === "=" ? { scalePct: f.scalePct + step * 2 } :
      e.key === "-" || e.key === "_" ? { scalePct: f.scalePct - step * 2 } : null;
    if (!patch) return;
    e.preventDefault();
    saveFit(wear, id, patch);
  };

  // Mouse wheel over the garment resizes it (needs a non-passive listener to stop page scroll).
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelTarget = useRef<{ wear: WearSettings; id?: string }>({ wear });
  wheelTarget.current = { wear, id: editable ? G[idx]?.id : undefined };
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !editable) return;
    const onWheel = (e: WheelEvent) => {
      const { wear: w, id } = wheelTarget.current;
      if (!id || !(e.target as HTMLElement).closest(".wear-edit")) return;
      e.preventDefault();
      saveFit(w, id, { scalePct: fitOf(w, id).scalePct + (e.deltaY < 0 ? 1 : -1) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [editable]);

  // The model frame takes the model photo's shape (height fixed, width follows), capped to the stage.
  const [modelAspect, setModelAspect] = useState(1.5);
  const mh = mobile ? 420 : 660;
  const mw = Math.round(Math.min(mobile ? 360 : 640, mh / modelAspect));
  const [mTop, side] = mobile ? [16, 250] : [40, 420];
  const imgClass = wear.colorPhotos ? "" : "grayscale";
  const cur = G[idx];

  const layers = G.map((p, i) => {
    const rel = (i - idx + n) % n;
    const pos = rel === 0 ? 0 : rel === 1 ? 1 : rel === n - 1 ? -1 : rel <= n / 2 ? 2 : -2;
    const f = fitOf(wear, p.id);
    const w = (mw * f.scalePct) / 100;
    // Trimmed cut-outs are pinned to the top of a tall box, so width sets the size
    // and the collar lands on the collar line. Aligned garments share the model
    // photo's canvas, so their box is the model frame itself.
    const h = wear.aligned ? (mh * f.scalePct) / 100 : w * Math.min(2, aspects[p.id] ?? 1.1);
    const cx = (f.xPct / 100) * mw;
    const editing = editable && pos === 0;
    return (
      <div
        key={p.id}
        className={`wear-layer ${imgClass} ${editing ? "wear-edit" : ""} ${editing && dragging ? "is-dragging" : ""}`}
        aria-hidden={pos !== 0}
        {...(editing && {
          tabIndex: 0,
          role: "group",
          "aria-label": `${p.name}: drag to move, drag the corner or scroll to resize, arrow keys to nudge`,
          onPointerDown: (e: React.PointerEvent) => startDrag(e, "move", p.id),
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onKeyDown: (e: React.KeyboardEvent) => nudge(e, p.id),
        })}
        style={{
          top: mTop + (mh * f.topPct) / 100, width: w, height: h, marginLeft: -w / 2 + cx,
          zIndex: pos === 0 ? 3 : 1,
          transform: `translateX(${pos * side}px) scale(${pos === 0 ? 1 : 0.82})`,
          opacity: pos === 0 ? 1 : Math.abs(pos) === 1 ? 0.28 : 0,
          filter: pos === 0 ? "none" : "blur(3px)",
          pointerEvents: editing ? "auto" : "none",
          ...(editing && dragging ? { transition: "none" } : {}),
          ...(wear.aligned ? {} : neckMask(f.neck, w)),
        }}
      >
        <ImageSlot
          id={wearImg(p.id)}
          src={wear.images?.[p.id]}
          fit="contain"
          anchorTop={!wear.aligned}
          placeholder={editable ? `garment photo ${i + 1}` : ""}
          alt={p.name}
          onAspect={(a) => setAspects((m) => (m[p.id] === a ? m : { ...m, [p.id]: a }))}
        />
        {editing && (
          <span
            className="wear-handle"
            aria-hidden
            onPointerDown={(e) => startDrag(e, "resize", p.id)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        )}
      </div>
    );
  });

  const counter = `${String(idx + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;

  return (
    <section aria-roledescription="carousel" aria-label={wear.title}>
      {mobile && (
        <div style={{ padding: "16px 16px 0" }}>
          <span className="display" style={{ fontSize: 44, lineHeight: 0.86 }}>{wear.title}</span>
        </div>
      )}
      <div
        ref={stageRef}
        className="wear-stage"
        style={standalone || mobile ? undefined : { borderTop: "2px solid var(--color-divider)" }}
        onPointerDown={(e) => e.pointerType !== "mouse" && (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 40) setWi((i) => i + (dx < 0 ? 1 : -1 + n));
        }}
      >
        {!mobile && (
          <div className="wear-title">
            <span className="display">{wear.title}</span>
            <span>Designed for movement. Built for every moment.</span>
          </div>
        )}
        <div className={`${imgClass} ph`} style={{ position: "absolute", left: "50%", top: mTop, width: mw, height: mh, marginLeft: -mw / 2, zIndex: 2 }}>
          <ImageSlot
            id="wear-model"
            fit="contain"
            src={wear.images?.model}
            placeholder={editable ? "full-body model photo" : "model photo"}
            editable={editable}
            alt="Model"
            onAspect={(a) => setModelAspect((m) => (Math.abs(m - a) < 0.001 ? m : a))}
          />
        </div>
        {layers}
        {cur && !mobile && (
          <div className="wear-now" aria-live="polite">
            <span className="kicker">Now wearing</span>
            <span className="nm">{cur.name}</span>
            <span style={{ fontSize: 15 }}>{money(cur.price)}</span>
            <Link href={`/product/${cur.id}`} className="btn btn-primary row"><span>Shop this piece</span><span>→</span></Link>
          </div>
        )}
        {n > 1 && (
          <div className="wear-ctl">
            <button className="btn btn-ghost" style={{ height: mobile ? 44 : 32, padding: "0 10px" }} onClick={() => setWi(idx - 1 + n)} aria-label="Previous garment">←</button>
            <span style={{ fontWeight: 700 }}>{counter}</span>
            {!mobile && (
              <div className="wear-dots">
                {G.map((p, i) => (
                  <button key={p.id} aria-label={`Show ${p.name}`} onClick={() => setWi(i)} style={{ width: i === idx ? 28 : 10, background: i === idx ? "var(--color-text)" : "var(--color-neutral-300)" }} />
                ))}
              </div>
            )}
            <button className="btn btn-ghost" style={{ height: mobile ? 44 : 32, padding: "0 10px" }} onClick={() => setWi(idx + 1)} aria-label="Next garment">→</button>
            {!mobile && <button className="btn btn-ghost h32" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>}
          </div>
        )}
      </div>
      {cur && mobile && (
        <div className="wear-m-foot">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontWeight: 800, fontSize: 20 }}>{cur.name}</span><span>{money(cur.price)}</span></div>
          <Link href={`/product/${cur.id}`} className="btn btn-primary row h52"><span>Shop this piece</span><span>→</span></Link>
        </div>
      )}
      {editable && <WearTools wear={wear} products={products} garments={G} idx={idx} onPick={setWi} />}
    </section>
  );
}

/** The fit bar and garment strip under the stage in 5a. Admin-only; edits go to the draft. */
function WearTools({ wear, products, garments, idx, onPick }: { wear: WearSettings; products: Product[]; garments: Product[]; idx: number; onPick: (i: number) => void }) {
  const addable = products.filter((p) => !wear.garmentIds.includes(p.id) && p.category !== "accessories");
  const cur = garments[idx];
  const f = cur ? fitOf(wear, cur.id) : fitOf(wear, "");
  const key = wear.aligned ? "alignedFits" : "fits";
  const own = cur ? wear[key]?.[cur.id] : undefined;
  const [working, setWorking] = useState<string | null>(null);

  const r = rangeOf(wear);
  const setFit = (patch: Partial<WearFit>) => cur && saveFit(wear, cur.id, patch);
  const applyToAll = () => updateWear({ [key]: Object.fromEntries(garments.map((g) => [g.id, f])) });
  const reset = () => {
    if (!cur || !wear[key]) return;
    const { [cur.id]: _drop, ...rest } = wear[key]!;
    updateWear({ [key]: rest });
  };

  /** Re-run background removal on a photo uploaded before it existed. */
  const recut = async (p: Product) => {
    const blob = await getImageBlob(wearImg(p.id));
    if (!blob) return toast(`Add a photo for ${p.name} first.`);
    setWorking(p.id);
    try {
      await putImage(wearImg(p.id), await cutterFor(wear)(blob));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="wear-tools">
      <div className="fitbar">
        <div className="field">
          <label htmlFor="wear-mode">Garment photos</label>
          <select id="wear-mode" className="input" value={wear.aligned ? "aligned" : "overlay"} onChange={(e) => updateWear({ aligned: e.target.value === "aligned" })}>
            <option value="overlay">Flat product shots (trimmed and fitted)</option>
            <option value="aligned">Made on the model photo (same size, 1:1)</option>
          </select>
        </div>
        <div className="fit-for"><span className="label">Fit on photo</span><b>{cur?.name ?? "—"}</b></div>
        <span className="muted" style={{ fontSize: 12 }}>On the photo: drag the garment to move it, drag the red corner or scroll to resize. Arrow keys nudge, + and − resize (hold Shift for bigger steps).</span>
        <label className="slider"><span className="t"><span>{wear.aligned ? "Up / down" : "Collar position"}</span><b>{f.topPct}%</b></span><input type="range" min={r.top[0]} max={r.top[1]} step={0.5} value={f.topPct} onChange={(e) => setFit({ topPct: +e.target.value })} /></label>
        <label className="slider"><span className="t"><span>{wear.aligned ? "Size" : "Garment width"}</span><b>{f.scalePct}%</b></span><input type="range" min={r.scale[0]} max={r.scale[1]} step={0.5} value={f.scalePct} onChange={(e) => setFit({ scalePct: +e.target.value })} /></label>
        <label className="slider"><span className="t"><span>Side-to-side</span><b>{f.xPct}</b></span><input type="range" min={r.x[0]} max={r.x[1]} step={0.5} value={f.xPct} onChange={(e) => setFit({ xPct: +e.target.value })} /></label>
        {!wear.aligned && (
          <label className="slider"><span className="t"><span>Neck opening</span><b>{f.neck ? `${f.neck}%` : "Off"}</b></span><input type="range" min={0} max={60} value={f.neck ?? 0} onChange={(e) => setFit({ neck: +e.target.value })} /></label>
        )}
        <div className="fit-acts">
          <button className="btn btn-secondary h32" onClick={applyToAll}>Use this fit for all</button>
          {own && <button className="btn btn-ghost h32" onClick={reset}>Reset</button>}
        </div>
        <label className="slider"><span className="t"><span>Rotate every</span><b>{wear.rotateSeconds}s</b></span><input type="range" min={2} max={8} step={0.5} value={wear.rotateSeconds} onChange={(e) => updateWear({ rotateSeconds: +e.target.value })} /></label>
        <label className="radio"><input type="checkbox" checked={wear.colorPhotos} onChange={(e) => updateWear({ colorPhotos: e.target.checked })} /><span className="dot" />Show these photos in colour</label>
        <div className="field"><label htmlFor="wear-title">Title</label><input id="wear-title" className="input" value={wear.title} onChange={(e) => updateWear({ title: e.target.value })} /></div>
      </div>
      <div className="rot">
        <span className="label">Garments in rotation · pick one to fit it</span>
        <div className="wear-cells">
          {garments.map((p, i) => (
            <div key={p.id} className={i === idx ? "cur" : undefined}>
              <div className="ph"><ImageSlot id={wearImg(p.id)} src={wear.images?.[p.id]} fit="contain" process={cutterFor(wear)} placeholder="drop photo" editable alt={p.name} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 12 }}>
                <button className="unbtn" style={{ fontWeight: 600, textAlign: "left" }} onClick={() => onPick(i)}>{p.name}</button>
                <button className="unbtn" aria-label={`Remove ${p.name} from rotation`} onClick={() => updateWear({ garmentIds: wear.garmentIds.filter((x) => x !== p.id) })}>×</button>
              </div>
              <div className="acts">
                <button className="unbtn u" onClick={() => onPick(i)}>{i === idx ? "Fitting" : "Fit"}</button>
                <button className="unbtn u" disabled={working === p.id} onClick={() => void recut(p)}>{working === p.id ? "Working…" : "Remove bg"}</button>
              </div>
            </div>
          ))}
        </div>
        {addable.length > 0 && (
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="wear-add">Add a garment</label>
            <select id="wear-add" className="input" value="" onChange={(e) => e.target.value && updateWear({ garmentIds: [...wear.garmentIds, e.target.value] })}>
              <option value="">Choose a product…</option>
              {addable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          {wear.aligned
            ? "Each garment photo must be the same size as the model photo, with the garment exactly where it sits on her body and everything else plain white. The white is removed automatically, including the neck opening. Photos save straight away; fit settings go live when you publish."
            : "Upload flat product shots on a plain white or grey background: the background is removed and the photo is trimmed to the garment, so every piece lines up at the collar. Use Neck opening to cut the inside of the collar away. Photos save straight away; fit settings go live when you publish."}
        </span>
      </div>
    </div>
  );
}
