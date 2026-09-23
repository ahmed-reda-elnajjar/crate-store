"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Product, WearSettings } from "@/lib/data";
import { money } from "@/lib/format";
import { updateWear } from "@/lib/store";
import { ImageSlot } from "./ImageSlot";

const wearImg = (productId: string) => `wear-g-${productId}`;

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
  const [playing, setPlaying] = useState(true);
  const mobile = useIsMobile();
  const idx = n ? ((wi % n) + n) % n : 0;

  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setInterval(() => setWi((i) => i + 1), Math.max(1.5, wear.rotateSeconds) * 1000);
    return () => clearInterval(t);
  }, [playing, n, wear.rotateSeconds]);

  // Swipe on touch screens.
  const swipe = useRef<number | null>(null);

  const [mw, mh, mTop, side] = mobile ? [280, 420, 16, 250] : [440, 660, 40, 420];
  const imgClass = wear.colorPhotos ? "" : "grayscale";
  const cur = G[idx];

  const layers = G.map((p, i) => {
    const rel = (i - idx + n) % n;
    const pos = rel === 0 ? 0 : rel === 1 ? 1 : rel === n - 1 ? -1 : rel <= n / 2 ? 2 : -2;
    const w = (mw * wear.scalePct) / 100;
    const h = w * 1.05;
    const cx = (wear.xPct / 100) * mw;
    return (
      <div
        key={p.id}
        className={`wear-layer ${imgClass}`}
        aria-hidden={pos !== 0}
        style={{
          top: mTop + (mh * wear.topPct) / 100, width: w, height: h, marginLeft: -w / 2 + cx,
          zIndex: pos === 0 ? 3 : 1,
          transform: `translateX(${pos * side}px) scale(${pos === 0 ? 1 : 0.82})`,
          opacity: pos === 0 ? 1 : Math.abs(pos) === 1 ? 0.28 : 0,
          filter: pos === 0 ? "none" : "blur(3px)",
          pointerEvents: pos === 0 && editable ? "auto" : "none",
        }}
      >
        <ImageSlot id={wearImg(p.id)} fit="contain" placeholder={editable ? `garment PNG ${i + 1}` : ""} editable={editable && pos === 0} alt={p.name} />
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
          <ImageSlot id="wear-model" fit="contain" placeholder={editable ? "full-body model photo" : "model photo"} editable={editable} alt="Model" />
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
  return (
    <div className="wear-tools">
      <div className="fitbar">
        <span className="label">Fit on photo</span>
        <label className="slider"><span className="t"><span>Collar position</span><b>{wear.topPct}%</b></span><input type="range" min={0} max={45} value={wear.topPct} onChange={(e) => updateWear({ topPct: +e.target.value })} /></label>
        <label className="slider"><span className="t"><span>Garment width</span><b>{wear.scalePct}%</b></span><input type="range" min={40} max={130} value={wear.scalePct} onChange={(e) => updateWear({ scalePct: +e.target.value })} /></label>
        <label className="slider"><span className="t"><span>Side-to-side</span><b>{wear.xPct}</b></span><input type="range" min={-30} max={30} value={wear.xPct} onChange={(e) => updateWear({ xPct: +e.target.value })} /></label>
        <label className="slider"><span className="t"><span>Rotate every</span><b>{wear.rotateSeconds}s</b></span><input type="range" min={2} max={8} step={0.5} value={wear.rotateSeconds} onChange={(e) => updateWear({ rotateSeconds: +e.target.value })} /></label>
        <label className="radio"><input type="checkbox" checked={wear.colorPhotos} onChange={(e) => updateWear({ colorPhotos: e.target.checked })} /><span className="dot" />Show these photos in colour</label>
        <div className="field"><label htmlFor="wear-title">Title</label><input id="wear-title" className="input" value={wear.title} onChange={(e) => updateWear({ title: e.target.value })} /></div>
      </div>
      <div className="rot">
        <span className="label">Garments in rotation · transparent PNGs</span>
        <div className="wear-cells">
          {garments.map((p, i) => (
            <div key={p.id} className={i === idx ? "cur" : undefined}>
              <div className="ph"><ImageSlot id={wearImg(p.id)} fit="contain" placeholder="drop PNG" editable alt={p.name} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 12 }}>
                <button className="unbtn" style={{ fontWeight: 600 }} onClick={() => onPick(i)}>{p.name}</button>
                <button className="unbtn" aria-label={`Remove ${p.name} from rotation`} onClick={() => updateWear({ garmentIds: wear.garmentIds.filter((x) => x !== p.id) })}>×</button>
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
        <span className="muted" style={{ fontSize: 12 }}>Use cut-out PNGs with a transparent background, shot from the front like the model photo. Photos save straight away; the settings above go live when you publish.</span>
      </div>
    </div>
  );
}
