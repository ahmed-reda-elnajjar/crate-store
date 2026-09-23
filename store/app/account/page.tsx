"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer, Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { NEXT_DROP, type Order } from "@/lib/data";
import { recommendSize, FIT_SIZES } from "@/lib/fit";
import { longDate, money2 } from "@/lib/format";
import { addToBag, openFitRoom, setFit, siteFor, signOut, toast, useHydrated, useStore } from "@/lib/store";

type Tab = "orders" | "wishlist" | "fit" | "details";
const TAG: Record<Order["status"], string> = { "In transit": "tag tag-accent", Processing: "tag tag-accent", Delivered: "tag tag-neutral", Returned: "tag tag-outline" };
const ACTION: Record<Order["status"], string> = { "In transit": "Track", Processing: "Track", Delivered: "Reorder", Returned: "View" };

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const short = (iso: string) => longDate(iso).slice(0, 6);

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2026-09-25" → "Thu 25 Sep" */
const withDay = (iso: string) => `${DAYS[new Date(iso + "T12:00:00").getDay()]} ${short(iso)}`;

/** Tracking stages. Seed orders carry no timeline, so dates are estimated from the order date. */
function stages(o: Order) {
  const idx = o.status === "Processing" ? 0 : o.status === "In transit" ? 2 : 3;
  const dates = [0, 1, 3, 6].map((n) => short(addDays(o.date, n)));
  return ["Ordered", "Packed", "Shipped", "Delivered"].map((l, i) => ({
    l,
    d: i <= idx ? dates[i] : i === 3 ? `Est. ${dates[3]}` : "—",
    cls: i < idx || (i === idx && idx === 3) ? "done" : i === idx ? "now" : "",
  }));
}

/** 2k Account · tracking plus order table, with the 2l membership strip. */
export default function Account() {
  const s = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("orders");
  const [trackNo, setTrackNo] = useState<string | null>(null);
  const hydrated = useHydrated();
  const { role, email, name } = s.session;

  useEffect(() => {
    if (hydrated && role === "guest") router.replace("/signin?next=/account");
  }, [hydrated, role, router]);
  if (!hydrated || role === "guest") return <Header active="account" />;

  const products = siteFor(s).products;
  const orders = s.orders.filter((o) => o.email === email);
  const active = orders.find((o) => o.no === trackNo) ?? orders.find((o) => o.status === "In transit" || o.status === "Processing");
  const saved = products.filter((p) => s.wishlist.includes(p.id) && p.live);
  const first = name.split(" ")[0] || "there";
  const earlyAt = new Date(NEXT_DROP.at.getTime() - NEXT_DROP.earlyAccessMinutes * 60000);
  const early = earlyAt.toLocaleString("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");
  const rec = FIT_SIZES[recommendSize(s.fit.h, s.fit.w).rec];

  const act = (o: Order) => {
    if (o.status === "Delivered") {
      if (!o.lines.length) return router.push("/shop/new");
      o.lines.forEach((l) => addToBag(l.productId, l.size, l.colour));
      return;
    }
    setTrackNo(o.no);
    if (o.status === "Returned") toast(`${o.no} was returned and refunded.`);
  };

  const tabs: [Tab, string][] = [["orders", "Orders"], ["wishlist", `Wishlist (${saved.length})`], ["fit", "Fit profile"], ["details", "Details"]];

  return (
    <>
      <Header active="account" />
      <main className="acct">
        <nav className="side" aria-label="Account">
          {tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : undefined} onClick={() => setTab(k)}>{l}</button>)}
          <button onClick={() => (signOut(), router.push("/"))} style={{ marginTop: 24, color: "var(--color-neutral-700)" }}>Log out</button>
        </nav>

        <div className="main">
          <h1>Hi, {first}</h1>
          <div className="m-tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : undefined} onClick={() => setTab(k)}>{l}</button>)}</div>

          {tab === "orders" && (
            <>
              <div className="member">
                <div><span className="kicker">Early access</span><b>{NEXT_DROP.name} opens for you {early}</b></div>
                <div><span className="kicker">{active ? active.status : "Orders"}</span><b>{active ? `${active.no} arrives ${withDay(addDays(active.date, 6))}` : "Nothing on the way"}</b></div>
                <div><span className="kicker">Wishlist</span><b>{saved.length ? `${saved.length} saved piece${saved.length > 1 ? "s" : ""}` : "Save pieces to watch them"}</b></div>
              </div>

              {active && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, gap: 12 }}>
                    <span><b>{active.no}</b> · {active.status === "Processing" ? "Being packed" : active.status}, arrives {withDay(addDays(active.date, 6))}</span>
                    {active.status === "In transit" && <span className="u">Tracked with DHL</span>}
                  </div>
                  <div className="track">
                    {stages(active).map((st) => <div key={st.l} className={st.cls}><span>{st.l}</span><span>{st.d}</span></div>)}
                  </div>
                </div>
              )}

              {orders.length === 0 ? (
                <p className="muted">No orders yet. <Link href="/shop/new" className="u">Shop the drop</Link></p>
              ) : (
                <>
                  <div className="table-wrap orders-table">
                    <table className="table" style={{ fontSize: 15 }}>
                      <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.no}>
                            <td style={{ fontWeight: 600 }}>{o.no}</td>
                            <td>{longDate(o.date)}</td>
                            <td>{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</td>
                            <td>{money2(o.total)}</td>
                            <td><span className={TAG[o.status]}>{o.status}</span></td>
                            <td style={{ textAlign: "right" }}><button className="unbtn u" onClick={() => act(o)}>{ACTION[o.status]}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="orders-list">
                    {orders.map((o) => (
                      <button key={o.no} className="unbtn" style={{ width: "100%" }} onClick={() => act(o)}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{o.no}</span>
                        <span style={{ fontSize: 15, textAlign: "right" }}>{money2(o.total)}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{longDate(o.date)} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span>
                        <span className={TAG[o.status]} style={{ justifySelf: "end" }}>{o.status}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {tab === "wishlist" && (
            saved.length ? (
              <div className="pgrid boxed">{saved.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            ) : (
              <p className="muted">Nothing saved yet. Tap &ldquo;Save to wishlist&rdquo; on any piece.</p>
            )
          )}

          {tab === "fit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
              <p className="muted" style={{ margin: 0 }}>Your fit profile sets the size we recommend in the fit room.</p>
              <label className="slider"><span className="t"><span>Height</span><b>{s.fit.h} cm</b></span><input type="range" min={150} max={200} value={s.fit.h} onChange={(e) => setFit({ h: +e.target.value })} /></label>
              <label className="slider"><span className="t"><span>Weight</span><b>{s.fit.w} kg</b></span><input type="range" min={45} max={130} value={s.fit.w} onChange={(e) => setFit({ w: +e.target.value })} /></label>
              <span style={{ fontSize: 15 }}>We recommend <b>{rec}</b> in tops and outerwear.</span>
              <button className="btn btn-primary row h52" onClick={() => openFitRoom("fit")}><span>Open the fit room</span><span>→</span></button>
            </div>
          )}

          {tab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, fontSize: 15 }}>
              <div className="spec">
                <div><span>Name</span><span>{name}</span></div>
                <div><span>Email</span><span>{email}</span></div>
                <div><span>Role</span><span>{role === "admin" ? "Admin" : "Customer"}</span></div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
