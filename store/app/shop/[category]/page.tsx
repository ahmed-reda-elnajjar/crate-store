"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Footer, Header, type NavKey } from "@/components/Header";
import { ImageSlot, productImg } from "@/components/ImageSlot";
import { ProductCard } from "@/components/ProductCard";
import { CATEGORIES } from "@/lib/data";
import { money } from "@/lib/format";
import { siteFor, stockLeft, useStore } from "@/lib/store";

const PRICE: Record<string, (n: number) => boolean> = {
  Any: () => true,
  "Under $100": (n) => n < 100,
  "$100–150": (n) => n >= 100 && n <= 150,
  "Over $150": (n) => n > 150,
};
const SORT = ["Newest", "Price: low–high", "Price: high–low"] as const;
const PAGE = 8;

/** 2c Category · Grid with ruled filter bar, plus the 2d index list as a Grid/Index toggle. */
export default function Category() {
  const { category } = useParams<{ category: string }>();
  const s = useStore();
  const cat = CATEGORIES.find((c) => c.key === category);
  const title = cat?.name ?? "New";
  const all = siteFor(s).products.filter((p) => p.live && (!cat || p.category === cat.key));

  const [colour, setColour] = useState("Any");
  const [size, setSize] = useState("Any");
  const [price, setPrice] = useState("Any");
  const [drop, setDrop] = useState("Any");
  const [sort, setSort] = useState<(typeof SORT)[number]>("Newest");
  const [view, setView] = useState<"grid" | "index">("grid");
  const [shown, setShown] = useState(PAGE);
  const [hot, setHot] = useState(0);

  const opts = useMemo(() => {
    const uniq = (xs: string[]) => ["Any", ...Array.from(new Set(xs))];
    return {
      colour: uniq(all.flatMap((p) => p.colourways)),
      size: uniq(all.flatMap((p) => p.sizes)),
      drop: uniq(all.map((p) => p.drop).sort().reverse()),
    };
  }, [all]);

  const list = all
    .filter((p) => colour === "Any" || p.colourways.includes(colour))
    .filter((p) => size === "Any" || (p.stock[size] ?? 0) > 0)
    .filter((p) => PRICE[price](p.price))
    .filter((p) => drop === "Any" || p.drop === drop)
    .sort((a, b) => (sort === "Newest" ? b.added - a.added : sort === "Price: low–high" ? a.price - b.price : b.price - a.price));
  const page = list.slice(0, shown);
  const preview = page[hot] ?? page[0];
  const activeFilters = [colour, size, price, drop].filter((x) => x !== "Any").length;

  const cell = (k: string, v: string, set: (v: string) => void, options: readonly string[]) => (
    <label className="fcell">
      <span><span className="muted">{k}</span> {v}</span><span aria-hidden>↓</span>
      <select value={v} onChange={(e) => (set(e.target.value), setShown(PAGE))} aria-label={k}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <Header active={(cat?.key ?? "new") as NavKey} />
      <main>
        <div className="cat-head">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="crumb muted" style={{ fontSize: 13 }}><Link href="/">Shop</Link> / {title}</span>
            <h1>{title}</h1>
          </div>
          <span style={{ fontSize: 14 }}>{list.length} piece{list.length === 1 ? "" : "s"}{activeFilters ? ` · ${activeFilters} filter${activeFilters > 1 ? "s" : ""}` : ""}</span>
        </div>
        <div className="filters">
          {cell("Colour", colour, setColour, opts.colour)}
          {cell("Size", size, setSize, opts.size)}
          {cell("Price", price, setPrice, Object.keys(PRICE))}
          {cell("Drop", drop, setDrop, opts.drop)}
          {cell("Sort", sort, (v) => setSort(v as (typeof SORT)[number]), SORT)}
          <div className="fcell seg-cell">
            <button className={view === "grid" ? "on" : undefined} onClick={() => setView("grid")} aria-pressed={view === "grid"}>Grid</button>
            <button className={view === "index" ? "on" : undefined} onClick={() => setView("index")} aria-pressed={view === "index"}>Index</button>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="empty-note bb">Nothing matches those filters. <button className="unbtn u" onClick={() => (setColour("Any"), setSize("Any"), setPrice("Any"), setDrop("Any"))}>Clear filters</button></div>
        ) : view === "grid" ? (
          <div className="pgrid bb">{page.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        ) : (
          <div className="idx bb">
            <div className="list">
              <div className="row head"><span>No.</span><span>Piece</span><span className="hide-m">Colourways</span><span className="hide-m">Sizes</span><span style={{ textAlign: "right" }}>Price</span></div>
              {page.map((p, i) => (
                <Link key={p.id} href={`/product/${p.id}`} className={`row ${i === hot ? "hot" : ""}`} onMouseEnter={() => setHot(i)} onFocus={() => setHot(i)}>
                  <span className="s">{String(i + 1).padStart(2, "0")}</span>
                  <span className="nm">{p.name}</span>
                  <span className="s hide-m">{p.colourways.length} colourway{p.colourways.length === 1 ? "" : "s"}</span>
                  <span className="s hide-m">{p.sizes.length > 1 ? `${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}` : p.sizes[0]}</span>
                  <span style={{ textAlign: "right" }}>{money(p.price)}</span>
                </Link>
              ))}
            </div>
            {preview && (
              <div className="preview">
                <div className="ph grayscale"><ImageSlot id={productImg(preview.id)} src={preview.photo} placeholder={`preview: ${preview.name.toLowerCase()}`} alt={preview.name} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span className="b">{String(hot + 1).padStart(2, "0")} {preview.name}</span><span>{money(preview.price)}</span></div>
                <PreviewStock left={stockLeft(preview)} />
              </div>
            )}
          </div>
        )}

        {list.length > 0 && (
          <div className="cat-foot">
            <span style={{ fontSize: 14 }}>Showing {page.length} of {list.length}</span>
            {shown < list.length && (
              <button className="btn btn-secondary row h48" style={{ width: 240, borderWidth: 2 }} onClick={() => setShown((n) => n + PAGE)}><span>Load more</span><span>↓</span></button>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function PreviewStock({ left }: { left: number }) {
  if (left === 0) return <span style={{ fontSize: 12, color: "var(--color-accent-700)" }}>Sold out</span>;
  if (left <= 12) return <span style={{ fontSize: 12, color: "var(--color-accent-700)" }}>Low stock: {left} left</span>;
  return <span className="muted" style={{ fontSize: 12 }}>In stock</span>;
}
