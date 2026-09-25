"use client";

import Link from "next/link";
import type { Product } from "@/lib/data";
import { money } from "@/lib/format";
import { stockLeft } from "@/lib/store";
import { ImageSlot, productImg } from "./ImageSlot";

/** The tag shown on a card: sold-out wins, otherwise the product's own tag. */
export function cardTag(p: Product) {
  return stockLeft(p) === 0 ? "Sold out" : p.tag;
}

export function ProductCard({ p, ratio = "34", showCw = true, bold }: { p: Product; ratio?: "34" | "45"; showCw?: boolean; bold?: boolean }) {
  const tag = cardTag(p);
  return (
    <Link href={`/product/${p.id}`} className={`pcard ${ratio === "45" ? "r45" : ""}`} style={{ color: "inherit" }}>
      <div className="ph grayscale">
        <ImageSlot id={productImg(p.id)} src={p.photo} placeholder="product shot" alt={p.name} />
        {tag && <span className="ov-tag">{tag}</span>}
      </div>
      <div className="meta">
        <span className="n" style={bold ? { fontWeight: 800, fontSize: 18, letterSpacing: "-.01em" } : undefined}>{p.name}</span>
        <span>{money(p.price)}</span>
      </div>
      {showCw && <div className="cw">{p.colourways.length} colourway{p.colourways.length === 1 ? "" : "s"}</div>}
    </Link>
  );
}

/** Swatch colours for named colourways. Unknown names fall back to a neutral step. */
export const SWATCH: Record<string, string> = {
  Black: "#1d1c1b", Stone: "#8c8a84", Bone: "#e6e0d4", Ash: "#b7b4ae", Olive: "#5d5f3f", Tan: "#b08d64",
  Grey: "#8c8a84", Navy: "#23293a", Red: "var(--color-accent)", Sand: "#cdbb98", Orange: "#e2682a",
  White: "#fbfaf8", Cream: "#efe8da",
};
