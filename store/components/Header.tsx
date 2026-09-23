"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/data";
import { bagCount, isDirty, openBag, setMenu, signOut, useStore } from "@/lib/store";

export type NavKey = "new" | "tops" | "bottoms" | "outerwear" | "accessories" | "lookbook" | "search" | "account" | "bag";

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "new", label: "New", href: "/shop/new" },
  ...CATEGORIES.map((c) => ({ key: c.key as NavKey, label: c.name, href: `/shop/${c.key}` })),
  { key: "lookbook", label: "Lookbook", href: "/lookbook" },
];

export function Header({ active, back }: { active?: NavKey; back?: boolean }) {
  const s = useStore();
  const router = useRouter();
  const n = bagCount(s);
  const role = s.session.role;
  const on = (k: NavKey) => (k === active ? "on" : undefined);

  return (
    <>
      <header className="hdr">
        <Link href="/" className="brand">CRATE</Link>
        <nav aria-label="Shop">
          {NAV.map((x) => (
            <Link key={x.key} href={x.href} className={on(x.key)}>{x.label}</Link>
          ))}
        </nav>
        <div className="tools">
          <Link href="/search" className={on("search")}>Search</Link>
          {role === "admin" ? (
            <Link href="/admin">Admin</Link>
          ) : (
            <Link href={role === "guest" ? "/signin" : "/account"} className={on("account")}>{role === "guest" ? "Sign in" : "Account"}</Link>
          )}
          <button className={`unbtn ${on("bag") ?? ""}`} onClick={openBag}>Bag ({n})</button>
        </div>
      </header>

      <header className="hdr-m">
        {back ? (
          <>
            <button className="unbtn" onClick={() => router.back()}>← Back</button>
            <Link href="/" className="brand">CRATE</Link>
            <button className="unbtn" onClick={openBag}>Bag {n}</button>
          </>
        ) : (
          <>
            <Link href="/" className="brand">CRATE</Link>
            <div className="tools">
              <Link href="/search">Search</Link>
              <button className="unbtn" onClick={openBag}>Bag {n}</button>
              <button className="unbtn" onClick={() => setMenu(true)} aria-expanded={s.ui.menuOpen}>Menu</button>
            </div>
          </>
        )}
      </header>

      {s.ui.menuOpen && (
        <div className="menu-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="hdr-m" style={{ display: "flex" }}>
            <span className="brand">CRATE</span>
            <button className="unbtn" onClick={() => setMenu(false)}>Close ×</button>
          </div>
          {NAV.map((x) => (
            <Link key={x.key} href={x.href} onClick={() => setMenu(false)}>{x.label}</Link>
          ))}
          {role === "admin" && <Link href="/admin" onClick={() => setMenu(false)}>Admin</Link>}
          {role === "customer" && <Link href="/account" onClick={() => setMenu(false)}>Account</Link>}
          {role === "guest" ? (
            <Link href="/signin" onClick={() => setMenu(false)}>Sign in</Link>
          ) : (
            <button className="item" onClick={() => (signOut(), setMenu(false))}>Sign out</button>
          )}
        </div>
      )}

      {role === "admin" && (
        <div className="preview-bar">
          <span>Admin preview: this is what customers see{isDirty(s) ? " once you publish your draft" : ""}.</span>
          <Link href="/admin" className="u b" style={{ color: "inherit" }}>Back to admin</Link>
        </div>
      )}
    </>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div><span className="brand" style={{ fontSize: 18 }}>CRATE</span><span className="muted">Limited runs. No restocks.</span></div>
      <div><span className="label">Shop</span>{CATEGORIES.map((c) => <Link key={c.key} href={`/shop/${c.key}`}>{c.name}</Link>)}</div>
      <div><span className="label">Help</span><span>Free shipping over $150</span><span>30-day returns</span></div>
      <div><span className="label">Account</span><Link href="/account">Orders</Link><Link href="/signin">Sign in</Link></div>
    </footer>
  );
}
