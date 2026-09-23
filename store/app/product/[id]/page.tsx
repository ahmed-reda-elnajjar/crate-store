"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Footer, Header, type NavKey } from "@/components/Header";
import { ImageSlot, productImg } from "@/components/ImageSlot";
import { ProductCard, SWATCH } from "@/components/ProductCard";
import { CATEGORIES, FREE_SHIPPING_OVER } from "@/lib/data";
import { money } from "@/lib/format";
import { addToBag, openFitRoom, siteFor, stockLeft, toast, toggleWishlist, useStore } from "@/lib/store";

const SHOTS = ["on-model, front", "on-model, back", "flat lay", "detail: zip + label"];

/** 2e Product · Grid gallery and ruled buy box, with the 2f limited-run counter. */
export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useStore();
  const products = siteFor(s).products;
  const p = products.find((x) => x.id === id && (x.live || s.session.role === "admin"));

  const [sizePick, setSize] = useState<string | null>(null);
  const [colourPick, setColour] = useState<string | null>(null);
  const [shot, setShot] = useState(0);

  if (!p) {
    return (
      <>
        <Header />
        <main className="empty-note" style={{ minHeight: "50vh" }}>
          <h1 style={{ fontSize: 42 }}>This piece isn&apos;t available.</h1>
          <Link href="/shop/new" className="u">Back to the shop</Link>
        </main>
      </>
    );
  }

  // Defaults are derived, not stored, so they follow admin edits and late hydration.
  const size = sizePick ?? (["M", ...p.sizes].find((z) => p.sizes.includes(z) && (p.stock[z] ?? 0) > 0) ?? null);
  const colour = colourPick && p.colourways.includes(colourPick) ? colourPick : p.colourways[0];
  const cat = CATEGORIES.find((c) => c.key === p.category);
  const left = stockLeft(p);
  const soldOut = left === 0;
  const saved = s.wishlist.includes(p.id);
  const admin = s.session.role === "admin";
  const related = products.filter((x) => x.live && x.id !== p.id).sort((a, b) => Number(a.category === p.category) - Number(b.category === p.category) || b.added - a.added).slice(0, 4);

  const add = () => {
    if (!size) return toast("Pick a size first.");
    if (s.session.role === "guest") {
      toast("Sign in to add pieces to your bag.");
      return router.push(`/signin?next=/product/${p.id}`);
    }
    addToBag(p.id, size, colour);
  };
  const cta = soldOut ? "Sold out" : size ? "Add to bag" : "Pick a size";

  const sizeGrid = (
    <div className="sizes" style={{ gridTemplateColumns: `repeat(${Math.min(p.sizes.length, 5)}, 1fr)` }} role="radiogroup" aria-label="Size">
      {p.sizes.map((z) => {
        const n = p.stock[z] ?? 0;
        return (
          <button key={z} role="radio" aria-checked={size === z} disabled={n === 0} className={`pick ${n === 0 ? "off" : size === z ? "on" : ""}`} onClick={() => setSize(z)}>
            <span style={{ fontWeight: size === z ? 600 : 400 }}>{z}</span>
            {n > 0 && n <= 3 && <small>{n} left</small>}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <Header active={p.category as NavKey} back />
      <main>
        <div className="pdp">
          <div className="gallery">
            {SHOTS.map((ph, i) => (
              <div key={i} className="ph grayscale"><ImageSlot id={productImg(p.id, i)} placeholder={ph} alt={`${p.name}, ${ph}`} editable={admin} /></div>
            ))}
          </div>

          <div className="pdp-m-gallery only-m" onScroll={(e) => setShot(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
            {SHOTS.map((ph, i) => (
              <div key={i} className="ph grayscale"><ImageSlot id={productImg(p.id, i)} placeholder={ph} alt={`${p.name}, ${ph}`} editable={admin} /></div>
            ))}
          </div>

          <div className="buy">
            <div className="only-d" style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span className="muted"><Link href={`/shop/${p.category}`}>{cat?.name}</Link> / {p.name}</span>
              <span className="tag tag-accent">Drop {p.drop}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="only-m" style={{ fontSize: 12, marginBottom: -4 }}>{shot + 1} / {SHOTS.length}</div>
              <h1>{p.name}</h1>
              <span style={{ fontSize: 22 }}>{money(p.price)}</span>
            </div>

            {p.run && (
              <div className="run">
                <b>{left}/{p.run}</b>
                <span>{soldOut ? "This run has sold out. No restocks." : "left in this run. No restocks."}</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 13 }}>Colour: <b>{colour}</b></span>
              <div className="swatches" role="radiogroup" aria-label="Colour">
                {p.colourways.map((c) => (
                  <button key={c} role="radio" aria-checked={c === colour} aria-label={c} className={`swatch ${c === colour ? "on" : ""}`} style={{ background: SWATCH[c] ?? "var(--color-neutral-500)" }} onClick={() => setColour(c)} />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>Size</span>
                {p.shape && <button className="unbtn u" onClick={() => openFitRoom("guide", p.id)}>Size guide</button>}
              </div>
              {sizeGrid}
              {p.fit && <span className="muted" style={{ fontSize: 13 }}>Cut {p.fit.toLowerCase()}. Take your usual size.</span>}
              {p.shape && (
                <button className="btn btn-secondary row h44" onClick={() => openFitRoom("fit", p.id)}><span>Not sure? Try it on in 3D</span><span>→</span></button>
              )}
            </div>

            <div className="desk-cta">
              <button className="btn btn-primary row h56" onClick={add} disabled={soldOut}><span>{cta}</span><span>{money(p.price)} →</span></button>
              <button className="btn btn-secondary row h48" onClick={() => toggleWishlist(p.id)} aria-pressed={saved}><span>{saved ? "Saved to wishlist" : "Save to wishlist"}</span><span>{saved ? "✓" : "+"}</span></button>
            </div>

            <div className="spec">
              {p.fabric && <div><span>Fabric</span><span>{p.fabric}</span></div>}
              {p.fit && <div><span>Fit</span><span>{p.fit}</span></div>}
              <div><span>Model</span><span>188 cm, wears M</span></div>
              <div><span>Shipping</span><span>Free over {money(FREE_SHIPPING_OVER)} · 30-day returns</span></div>
            </div>
          </div>
        </div>

        <div className="sec-head"><h2>Wear it with</h2></div>
        <div className="pgrid bt">{related.map((x) => <ProductCard key={x.id} p={x} ratio="45" showCw={false} />)}</div>

        <div className="sticky-buy only-m">
          <button className="btn btn-primary row h52 w100" onClick={add} disabled={soldOut}><span>{soldOut ? "Sold out" : size ? `Add to bag · ${size}` : "Pick a size"}</span><span>{money(p.price)} →</span></button>
        </div>
      </main>
      <Footer />
    </>
  );
}
