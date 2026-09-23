"use client";

import Link from "next/link";
import { useState } from "react";
import { DropBar } from "@/components/DropBar";
import { Footer, Header } from "@/components/Header";
import { ImageSlot } from "@/components/ImageSlot";
import { ProductCard } from "@/components/ProductCard";
import { WearCarousel } from "@/components/WearCarousel";
import { CATEGORIES, type SectionKey } from "@/lib/data";
import { siteFor, toast, useStore } from "@/lib/store";

/** 2a Home · Grid, with its blocks ordered and toggled from Admin → Site sections. */
export default function Home() {
  const s = useStore();
  const site = siteFor(s);
  const live = site.products.filter((p) => p.live);
  const latest = [...live].sort((a, b) => b.added - a.added).slice(0, 4);

  const blocks: Record<SectionKey, React.ReactNode> = {
    hero: (
      <div className="hero">
        <div className="img ph grayscale"><ImageSlot id="hero" placeholder="campaign image" alt={site.hero.title} /></div>
        <div className="copy">
          <div className="top"><span className="kicker">{site.hero.kicker}</span><span>Out now</span></div>
          <div className="main">
            <h1 className="display">{site.hero.title}</h1>
            <p>{site.hero.body}</p>
            <Link href="/shop/new" className="btn btn-primary row h52"><span>{site.hero.cta}</span><span>→</span></Link>
          </div>
        </div>
      </div>
    ),
    countdown: <DropBar />,
    grid: (
      <div>
        <div className="sec-head"><h2>Latest</h2><Link href="/shop/new" style={{ fontSize: 14 }}>View all {live.length} →</Link></div>
        <div className="pgrid bt bb">{latest.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </div>
    ),
    wear: <WearCarousel wear={site.wear} products={site.products} />,
    cats: (
      <div className="cat-tiles">
        {CATEGORIES.map((c, i) => (
          <Link key={c.key} href={`/shop/${c.key}`}>
            <span style={{ fontSize: 12 }}>{String(i + 1).padStart(2, "0")}</span>
            <span className="nm"><b>{c.name}</b><span style={{ fontSize: 13 }}>{live.filter((p) => p.category === c.key).length}</span></span>
          </Link>
        ))}
      </div>
    ),
    news: <Newsletter />,
  };

  return (
    <>
      <Header />
      <main>
        {site.sections.filter((x) => x.on).map((x) => <div key={x.k}>{blocks[x.k]}</div>)}
      </main>
      <Footer />
    </>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  return (
    <div className="news">
      <span className="big">Get drop alerts first.</span>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Enter a valid email address.");
          setEmail("");
          toast("You're on the list for drop alerts.");
        }}
      >
        <label htmlFor="news-email" className="sr-only">Email address</label>
        <input id="news-email" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" aria-label="Sign up">→</button>
      </form>
    </div>
  );
}
