"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ImageSlot, productImg } from "@/components/ImageSlot";
import { CATEGORIES, type CategoryKey, type Product } from "@/lib/data";
import { longDate, money2 } from "@/lib/format";
import {
  addProduct, discardDraft, isDirty, moveSection, publish, removeProduct, signOut, stockLeft,
  toast, toggleSection, updateHero, updateProduct, useHydrated, useStore,
} from "@/lib/store";

type Tab = "products" | "site" | "orders" | "users";

/** 4b After sign-in, admin role: products, photos, homepage sections, orders and roles. */
export default function Admin() {
  const s = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const role = s.session.role;
  const hydrated = useHydrated();

  if (!hydrated) return null;
  if (role !== "admin") {
    return (
      <main className="empty-note" style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
        <h1 style={{ fontSize: 42 }}>Admins only.</h1>
        <p style={{ margin: 0 }}>{role === "guest" ? "Sign in with an admin account to edit the store." : "Your account can browse and buy, but not edit the store."}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/signin?next=/admin" className="btn btn-primary row h52" style={{ width: 240 }}><span>Sign in</span><span>→</span></Link>
          <Link href="/" className="btn btn-secondary row h52" style={{ width: 200 }}><span>Back to shop</span><span>→</span></Link>
        </div>
      </main>
    );
  }

  const d = s.draft;
  const dirty = isDirty(s);
  const tabs: [Tab, string, string | number][] = [
    ["products", "Products", d.products.length],
    ["site", "Site sections", `${d.sections.filter((x) => x.on).length}/${d.sections.length}`],
    ["orders", "Orders", s.orders.length],
    ["users", "Users & roles", s.users.length],
  ];

  return (
    <>
      <div className="adm-bar">
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span className="adm-badge">ADMIN</span>
          <span>Editing mode is on. Changes save as a draft until you publish.</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>{dirty ? "Unpublished changes" : "All changes published"}</span>
          {dirty && <button className="lnk" onClick={() => window.confirm("Discard all unpublished changes?") && discardDraft()}>Discard</button>}
          <button className="btn btn-primary h32" disabled={!dirty} onClick={() => (publish(), toast("Published. Customers now see your changes."))}>Publish</button>
          <button className="lnk" onClick={() => (signOut(), router.push("/"))}>Sign out</button>
        </div>
      </div>
      <div className="adm">
        <nav className="side" aria-label="Admin">
          <span className="brand">CRATE Admin</span>
          {tabs.map(([k, l, n]) => (
            <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}><span>{l}</span><span>{n}</span></button>
          ))}
          <Link href="/" className="out">View as customer →</Link>
          <Link href="/lookbook" className="out">Edit wear carousel →</Link>
        </nav>
        {tab === "products" && <Products products={d.products} />}
        {tab === "site" && <Site />}
        {tab === "orders" && <Orders />}
        {tab === "users" && <Users />}
      </div>
    </>
  );
}

/** Text input that commits on every keystroke but lets the field be empty while typing. */
function NumInput({ value, onCommit, prefix = "", label }: { value: number; onCommit: (n: number) => void; prefix?: string; label: string }) {
  const [text, setText] = useState(`${prefix}${value}`);
  useEffect(() => setText((t) => (Number(t.replace(/[^\d.]/g, "")) === value ? t : `${prefix}${value}`)), [value, prefix]);
  return (
    <input
      className="input num"
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(/[^\d.]/g, ""));
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => setText(`${prefix}${value}`)}
    />
  );
}

/** Setting a total rescales the per-size split (even split when nothing is in stock). */
function withTotal(p: Product, total: number): Record<string, number> {
  const cur = stockLeft(p);
  const t = Math.max(0, Math.round(total));
  const stock: Record<string, number> = {};
  let given = 0;
  p.sizes.forEach((z, i) => {
    const share = cur ? (p.stock[z] ?? 0) / cur : 1 / p.sizes.length;
    const n = i === p.sizes.length - 1 ? t - given : Math.floor(t * share);
    stock[z] = n;
    given += n;
  });
  return stock;
}

function Products({ products }: { products: Product[] }) {
  return (
    <div className="pane">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <h1>Products</h1>
        <button className="btn btn-primary h44" style={{ gap: 24 }} onClick={addProduct}><span>Add product</span><span>+</span></button>
      </div>
      <div className="prow head"><span>Photo</span><span>Name</span><span>Price</span><span>Stock</span><span>Status</span><span /></div>
      {products.map((p) => (
        <div className="prow" key={p.id}>
          <div className="ph grayscale"><ImageSlot id={productImg(p.id)} placeholder="drop photo" editable alt={p.name} /></div>
          <div className="nmcol">
            <input className="input" style={{ fontWeight: 600 }} aria-label="Name" value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} />
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <select aria-label="Category" value={p.category} onChange={(e) => updateProduct(p.id, { category: e.target.value as CategoryKey })}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
              <Link href={`/product/${p.id}`} className="u" style={{ fontSize: 12 }}>Photos &amp; page →</Link>
            </div>
          </div>
          <NumInput label="Price" prefix="$" value={p.price} onCommit={(price) => updateProduct(p.id, { price })} />
          <NumInput label="Stock" value={stockLeft(p)} onCommit={(n) => updateProduct(p.id, { stock: withTotal(p, n) })} />
          <button className={p.live ? "tag tag-accent" : "tag tag-outline"} onClick={() => updateProduct(p.id, { live: !p.live })} aria-pressed={p.live} title="Show or hide in the store">{p.live ? "Live" : "Hidden"}</button>
          <button className="unbtn u" style={{ fontSize: 13 }} onClick={() => window.confirm(`Delete ${p.name}?`) && removeProduct(p.id)}>Delete</button>
        </div>
      ))}
      <span className="muted" style={{ fontSize: 12 }}>Photos save straight away. Names, prices, stock and visibility go live when you publish. Open a product page to add its other gallery photos.</span>
    </div>
  );
}

function Site() {
  const s = useStore();
  const d = s.draft;
  return (
    <div className="site">
      <div className="pane">
        <h1>Homepage sections</h1>
        <span className="muted" style={{ fontSize: 14 }}>Show, hide and reorder the blocks customers see on the home page.</span>
        <div className="bt">
          {d.sections.map((x, i) => (
            <div className="sec-row" key={x.k} style={{ opacity: x.on ? 1 : 0.5 }}>
              <span className="no">{String(i + 1).padStart(2, "0")}</span>
              <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 700, fontSize: 16 }}>{x.l}</span><span className="muted" style={{ fontSize: 12 }}>{x.d}</span></div>
              <div style={{ display: "flex", gap: 2 }}>
                <button className="btn btn-secondary" aria-label={`Move ${x.l} up`} disabled={i === 0} onClick={() => moveSection(i, -1)}>↑</button>
                <button className="btn btn-secondary" aria-label={`Move ${x.l} down`} disabled={i === d.sections.length - 1} onClick={() => moveSection(i, 1)}>↓</button>
              </div>
              <button className={`btn state ${x.on ? "btn-ink" : "btn-secondary"}`} onClick={() => toggleSection(i)} aria-pressed={x.on}>{x.on ? "Shown" : "Hidden"}</button>
            </div>
          ))}
        </div>
      </div>
      <div className="hero-edit">
        <span className="label">Hero block</span>
        <div className="ph grayscale"><ImageSlot id="hero" placeholder="drop hero image" editable alt="Hero" /></div>
        <div className="field"><label htmlFor="h-title">Headline</label><input id="h-title" className="input h44" value={d.hero.title} onChange={(e) => updateHero({ title: e.target.value })} /></div>
        <div className="field"><label htmlFor="h-kicker">Kicker</label><input id="h-kicker" className="input h44" value={d.hero.kicker} onChange={(e) => updateHero({ kicker: e.target.value })} /></div>
        <div className="field"><label htmlFor="h-body">Intro</label><textarea id="h-body" className="input" value={d.hero.body} onChange={(e) => updateHero({ body: e.target.value })} /></div>
        <div className="field"><label htmlFor="h-cta">Button label</label><input id="h-cta" className="input h44" value={d.hero.cta} onChange={(e) => updateHero({ cta: e.target.value })} /></div>
        <span className="muted" style={{ fontSize: 12 }}>This hero image is the same one shown on the <Link href="/" className="u">home page</Link>.</span>
      </div>
    </div>
  );
}

const TAG: Record<string, string> = { "In transit": "tag tag-accent", Processing: "tag tag-accent", Delivered: "tag tag-neutral", Returned: "tag tag-outline" };

function Orders() {
  const s = useStore();
  return (
    <div className="pane">
      <h1>Orders</h1>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: 15 }}>
          <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            {s.orders.map((o) => (
              <tr key={o.no}>
                <td style={{ fontWeight: 600 }}>{o.no}</td>
                <td>{o.email}</td>
                <td>{longDate(o.date)}</td>
                <td>{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</td>
                <td>{money2(o.total)}</td>
                <td><span className={TAG[o.status]}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Users() {
  const s = useStore();
  return (
    <div className="pane">
      <h1>Users &amp; roles</h1>
      <div className="bt">
        {s.users.map((u) => (
          <div className="urow" key={u.email}>
            <b>{u.name}</b>
            <span>{u.email}</span>
            <span className={u.role === "admin" ? "tag tag-accent" : "tag tag-neutral"} style={{ justifySelf: "start" }}>{u.role === "admin" ? "Admin" : "Customer"}</span>
          </div>
        ))}
      </div>
      <span className="muted" style={{ fontSize: 13 }}>Admins can edit products, photos and site sections. Customers can browse, buy and manage their own orders.</span>
    </div>
  );
}
