"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { CATEGORIES, TRENDING, type Product } from "@/lib/data";
import { siteFor, useStore } from "@/lib/store";

export default function SearchPage() {
  return (
    <Suspense>
      <Search />
    </Suspense>
  );
}

const haystack = (p: Product) => `${p.name} ${p.category} ${p.fabric} ${p.fit} ${p.colourways.join(" ")} drop ${p.drop}`.toLowerCase();

/** Wrap the typed part of a suggestion in <b>, as in 2m ("<b>carg</b>o short"). */
function Hl({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<b>{text.slice(i, i + q.length)}</b>{text.slice(i + q.length)}</>;
}

/** 2m Search · Grid overlay with suggestions while typing. */
function Search() {
  const s = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const input = useRef<HTMLInputElement>(null);
  const live = siteFor(s).products.filter((p) => p.live);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", { scroll: false }), 250);
    return () => clearTimeout(t);
  }, [q, router]);

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length ? live.filter((p) => terms.every((t) => haystack(p).includes(t))) : [...live].sort((a, b) => b.added - a.added).slice(0, 8);
  const last = terms[terms.length - 1] ?? "";
  const suggestions = last
    ? [
        ...live.filter((p) => p.name.toLowerCase().includes(last)).map((p) => ({ label: p.name.toLowerCase(), href: `/product/${p.id}` })),
        ...CATEGORIES.filter((c) => live.some((p) => p.category === c.key && haystack(p).includes(last))).map((c) => ({ label: `${last} in ${c.name}`, href: `/shop/${c.key}` })),
      ].slice(0, 5)
    : [];

  return (
    <>
      <Header active="search" />
      <main>
        <form className="srch-bar" role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="q" className="sr-only">Search</label>
          <input id="q" ref={input} value={q} placeholder="Search" autoComplete="off" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && router.back()} />
          <button type="button" className="unbtn" style={{ fontSize: 14 }} onClick={() => (q ? setQ("") : router.back())}>
            <span className="only-d">{q ? "Clear" : "Esc to close"}</span><span className="only-m">{q ? "Clear" : "Cancel"}</span>
          </button>
        </form>
        <div className="srch">
          <div className="left">
            {suggestions.length > 0 && (
              <div className="sugg">
                <span className="label">Suggestions</span>
                {suggestions.map((x) => <Link key={x.label} href={x.href}><Hl text={x.label} q={last} /></Link>)}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="label">Trending</span>
              <div className="chips">{TRENDING.map((t) => <button key={t} className={q === t ? "on" : undefined} onClick={() => setQ(t)}>{t}</button>)}</div>
            </div>
          </div>
          <div className="right">
            <div className="rhd"><span>{terms.length ? `Products · ${results.length}` : "Latest pieces"}</span></div>
            {results.length ? (
              <div className="pgrid bb">{results.map((p) => <ProductCard key={p.id} p={p} showCw={false} />)}</div>
            ) : (
              <div className="empty-note">No results for &ldquo;{q}&rdquo;. Try one of the trending searches.</div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
