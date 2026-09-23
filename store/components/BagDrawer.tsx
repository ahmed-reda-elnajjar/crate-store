"use client";

import Link from "next/link";
import { useEffect } from "react";
import { FREE_SHIPPING_OVER } from "@/lib/data";
import { money, money2 } from "@/lib/format";
import { bagCount, bagLines, bagSubtotal, closeBag, setQty, useStore } from "@/lib/store";
import { ImageSlot, productImg } from "./ImageSlot";

/** 2g: right-hand drawer on desktop, bottom sheet on mobile. */
export function BagDrawer() {
  const s = useStore();
  const open = s.ui.bagOpen;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBag();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const lines = bagLines(s);
  const sub = bagSubtotal(s);
  const toFree = FREE_SHIPPING_OVER - sub;
  const pct = Math.min(100, (sub / FREE_SHIPPING_OVER) * 100);

  return (
    <>
      <div className="scrim" onClick={closeBag} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Bag">
        <div className="grab"><span /></div>
        <div className="hd">
          <b>Bag ({bagCount(s)})</b>
          <button className="unbtn" style={{ fontSize: 14 }} onClick={closeBag}>Close ×</button>
        </div>
        {lines.length === 0 ? (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
            <span style={{ fontSize: 15 }}>Your bag is empty.</span>
            <Link href="/shop/new" className="btn btn-primary row h52" style={{ width: 280 }} onClick={closeBag}><span>Shop the drop</span><span>→</span></Link>
          </div>
        ) : (
          <>
            <div className="ship">
              <span>{toFree <= 0 ? "Free shipping unlocked." : `Add ${money(toFree)} for free shipping.`}</span>
              <div className="meter"><i style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="items">
              {lines.map((l, i) => (
                <div className="line" key={`${l.productId}-${l.size}-${l.colour}`}>
                  <div className="ph grayscale"><ImageSlot id={productImg(l.productId)} alt={l.product.name} /></div>
                  <div className="info">
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <Link href={`/product/${l.productId}`} className="nm" onClick={closeBag}>{l.product.name}</Link>
                      <span className="muted" style={{ fontSize: 13 }}>{l.colour} · {l.size}</span>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13 }}>
                      <div className="qty">
                        <button aria-label="Decrease quantity" onClick={() => setQty(i, l.qty - 1)}>−</button>
                        <span>{l.qty}</span>
                        <button aria-label="Increase quantity" onClick={() => setQty(i, l.qty + 1)}>+</button>
                      </div>
                      <button className="unbtn u" onClick={() => setQty(i, 0)}>Remove</button>
                    </div>
                  </div>
                  <span style={{ fontSize: 15 }}>{money(l.lineTotal)}</span>
                </div>
              ))}
              <div className="muted" style={{ padding: "16px 24px", fontSize: 13 }}>Items in your bag are not reserved. Drop 07 pieces sell through fast.</div>
            </div>
            <div className="ft">
              <div className="r"><span>Subtotal</span><span>{money2(sub)}</span></div>
              <div className="r"><span>Shipping</span><span>{toFree <= 0 ? "Free" : "Calculated at checkout"}</span></div>
              <Link href="/checkout" className="btn btn-primary row h56" onClick={closeBag}><span>Checkout</span><span>{money(sub)} →</span></Link>
              <div className="pays" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Link href="/checkout?pay=applepay" className="btn btn-secondary h44" style={{ justifyContent: "flex-start" }} onClick={closeBag}>Apple Pay</Link>
                <Link href="/checkout?pay=paypal" className="btn btn-secondary h44" style={{ justifyContent: "flex-start" }} onClick={closeBag}>PayPal</Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
