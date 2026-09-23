"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ImageSlot, productImg } from "@/components/ImageSlot";
import { EXPRESS_SHIPPING, FREE_SHIPPING_OVER, VAT_RATE, type Order } from "@/lib/data";
import { money, money2 } from "@/lib/format";
import { bagLines, bagSubtotal, placeOrder, useHydrated, useStore } from "@/lib/store";

type Pay = "card" | "paypal" | "klarna" | "applepay";
type Ship = "standard" | "express" | "pickup";
const STANDARD_FEE = 8;

export default function CheckoutPage() {
  return (
    <Suspense>
      <Checkout />
    </Suspense>
  );
}

/** 2i Checkout · one page, numbered sections. */
function Checkout() {
  const s = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const lines = bagLines(s);
  const sub = bagSubtotal(s);
  const role = s.session.role;

  const [f, setF] = useState({ email: "", first: "", last: "", address: "", city: "", postcode: "", country: "Germany", card: "", exp: "", cvc: "", alerts: true });
  const [pay, setPay] = useState<Pay>((params.get("pay") as Pay) || "card");
  const [ship, setShip] = useState<Ship>("standard");
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const [sumOpen, setSumOpen] = useState(false);

  const hydrated = useHydrated();
  useEffect(() => {
    if (hydrated && role === "guest") router.replace("/signin?next=/checkout");
  }, [hydrated, role, router]);

  useEffect(() => {
    if (!s.session.email) return;
    const [first = "", ...rest] = s.session.name.split(" ");
    setF((x) => ({ ...x, email: x.email || s.session.email, first: x.first || first, last: x.last || rest.join(" ") }));
  }, [s.session.email, s.session.name]);

  const shipFee = ship === "express" ? EXPRESS_SHIPPING : ship === "pickup" || sub >= FREE_SHIPPING_OVER ? 0 : STANDARD_FEE;
  const total = sub + shipFee;
  const vat = total - total / (1 + VAT_RATE);

  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (!/^\S+@\S+\.\S+$/.test(f.email)) errors.email = "Enter a valid email.";
  if (!f.first.trim()) errors.first = "Required.";
  if (!f.last.trim()) errors.last = "Required.";
  if (ship !== "pickup") {
    if (!f.address.trim()) errors.address = "Required.";
    if (!f.city.trim()) errors.city = "Required.";
    if (!/^\w[\w -]{2,9}$/.test(f.postcode.trim())) errors.postcode = "Check the postcode.";
    if (!f.country.trim()) errors.country = "Required.";
  }
  if (pay === "card") {
    if (f.card.replace(/\s/g, "").length < 15 || /\D/.test(f.card.replace(/\s/g, ""))) errors.card = "Check the card number.";
    if (!/^(0[1-9]|1[0-2]) ?\/ ?\d{2}$/.test(f.exp.trim())) errors.exp = "Use MM / YY.";
    if (!/^\d{3,4}$/.test(f.cvc.trim())) errors.cvc = "3 or 4 digits.";
  }
  const ok = Object.keys(errors).length === 0;

  const submit = () => {
    setTried(true);
    if (!ok || lines.length === 0) return;
    setDone(placeOrder(total));
    window.scrollTo(0, 0);
  };

  const field = (k: keyof typeof f, label: string, opts: { placeholder?: string; type?: string; autoComplete?: string } = {}) => (
    <div className="field">
      <label htmlFor={`co-${k}`}>{label}</label>
      <input
        id={`co-${k}`}
        className={`input h44 ${tried && errors[k] ? "err" : ""}`}
        value={f[k] as string}
        placeholder={opts.placeholder}
        type={opts.type ?? "text"}
        autoComplete={opts.autoComplete}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        aria-invalid={tried && !!errors[k]}
      />
      {tried && errors[k] && <span className="err-msg">{errors[k]}</span>}
    </div>
  );

  const header = (
    <div className="co-hdr">
      <Link href="/" className="brand">CRATE</Link>
      <span>Secure checkout</span>
      <Link href="/" className="back">← Back to shop</Link>
    </div>
  );

  if (!hydrated || role === "guest") return header;

  if (done) {
    return (
      <>
        {header}
        <main style={{ padding: "48px 32px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 720 }}>
          <span className="kicker">Order placed</span>
          <h1 className="display" style={{ fontSize: "clamp(56px, 10vw, 120px)" }}>THANK YOU.</h1>
          <p style={{ fontSize: 17 }}>Order <b>{done.no}</b> is confirmed: {done.itemCount} item{done.itemCount === 1 ? "" : "s"}, {money2(done.total)}. A receipt is on its way to {done.email}.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/account" className="btn btn-primary row h52" style={{ width: 280 }}><span>View your orders</span><span>→</span></Link>
            <Link href="/shop/new" className="btn btn-secondary row h52" style={{ width: 240 }}><span>Keep shopping</span><span>→</span></Link>
          </div>
        </main>
      </>
    );
  }

  if (lines.length === 0) {
    return (
      <>
        {header}
        <main className="empty-note" style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
          <span>Your bag is empty.</span>
          <Link href="/shop/new" className="btn btn-primary row h52" style={{ width: 280 }}><span>Shop the drop</span><span>→</span></Link>
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="co">
        <div className="main">
          <div className="express">
            <span style={{ fontSize: 13 }}>Express checkout</span>
            <div className="g-pay">
              <button className={`btn h48 ${pay === "applepay" ? "btn-ink" : "btn-secondary"}`} style={{ justifyContent: "flex-start" }} onClick={() => setPay("applepay")}>Apple Pay</button>
              <button className={`btn h48 ${pay === "paypal" ? "btn-ink" : "btn-secondary"}`} style={{ justifyContent: "flex-start" }} onClick={() => setPay("paypal")}>PayPal</button>
              <button className={`btn h48 ${pay === "klarna" ? "btn-ink" : "btn-secondary"}`} style={{ justifyContent: "flex-start" }} onClick={() => setPay("klarna")}>Klarna</button>
            </div>
          </div>

          <section className="step">
            <span className="no">01</span>
            <div>
              <h3>Contact</h3>
              {field("email", "Email", { type: "email", autoComplete: "email" })}
              <label className="radio"><input type="checkbox" checked={f.alerts} onChange={(e) => setF({ ...f, alerts: e.target.checked })} /><span className="dot" />Text me when Drop 08 goes live</label>
            </div>
          </section>

          <section className="step">
            <span className="no">02</span>
            <div>
              <h3>Delivery</h3>
              <div className="g2">{field("first", "First name", { autoComplete: "given-name" })}{field("last", "Last name", { autoComplete: "family-name" })}</div>
              {ship !== "pickup" && (
                <>
                  {field("address", "Address", { autoComplete: "street-address" })}
                  <div className="g3">{field("city", "City", { autoComplete: "address-level2" })}{field("postcode", "Postcode", { autoComplete: "postal-code" })}{field("country", "Country", { autoComplete: "country-name" })}</div>
                </>
              )}
              <div className="ship-opts" role="radiogroup" aria-label="Shipping">
                {([
                  ["standard", "Standard, 3–5 days", sub >= FREE_SHIPPING_OVER ? "Free" : money(STANDARD_FEE)],
                  ["express", "Express, next day", money(EXPRESS_SHIPPING)],
                  ["pickup", "Store pickup, Crate Berlin Mitte", "Free"],
                ] as [Ship, string, string][]).map(([k, l, fee]) => (
                  <label key={k} className="radio">
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="radio" name="ship" checked={ship === k} onChange={() => setShip(k)} /><span className="dot" />{l}</span>
                    <span>{fee}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="step">
            <span className="no">03</span>
            <div>
              <h3>Payment</h3>
              <div className="seg" style={{ alignSelf: "flex-start" }}>
                {([["card", "Card"], ["paypal", "PayPal"], ["klarna", "Klarna"]] as [Pay, string][]).map(([k, l]) => (
                  <label key={k} className="seg-opt"><input type="radio" name="pay" checked={pay === k} onChange={() => setPay(k)} /><span>{l}</span></label>
                ))}
              </div>
              {pay === "card" ? (
                <>
                  {field("card", "Card number", { placeholder: "1234 1234 1234 1234", autoComplete: "cc-number" })}
                  <div className="g2">{field("exp", "Expiry", { placeholder: "MM / YY", autoComplete: "cc-exp" })}{field("cvc", "CVC", { placeholder: "123", autoComplete: "cc-csc" })}</div>
                </>
              ) : (
                <span className="muted" style={{ fontSize: 14 }}>You&apos;ll confirm the payment with {pay === "paypal" ? "PayPal" : pay === "klarna" ? "Klarna" : "Apple Pay"} after placing the order.</span>
              )}
              {tried && !ok && <span className="err-msg" role="alert">Check the highlighted fields.</span>}
              <button className="btn btn-primary row h56" style={{ marginTop: 8 }} onClick={submit}><span>Place order</span><span>{money2(total)} →</span></button>
              <span className="muted" style={{ fontSize: 12 }}>Demo store: no payment is taken.</span>
            </div>
          </section>
        </div>

        <aside className={`sum ${sumOpen ? "" : "closed"}`}>
          <button className="unbtn sum-toggle" onClick={() => setSumOpen((o) => !o)} aria-expanded={sumOpen}><span>{sumOpen ? "Hide" : "Show"} order summary {sumOpen ? "↑" : "↓"}</span><b>{money2(total)}</b></button>
          <h3 style={{ margin: 0 }}>Order · {lines.reduce((a, l) => a + l.qty, 0)} items</h3>
          {lines.map((l) => (
            <div className="it" key={`${l.productId}-${l.size}-${l.colour}`}>
              <div className="ph grayscale"><ImageSlot id={productImg(l.productId)} alt={l.product.name} /></div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{l.product.name}{l.qty > 1 ? ` × ${l.qty}` : ""}</span>
                <span className="muted" style={{ fontSize: 12 }}>{l.colour} · {l.size}</span>
              </div>
              <span style={{ fontSize: 14 }}>{money(l.lineTotal)}</span>
            </div>
          ))}
          <div className="tot">
            <div><span>Subtotal</span><span>{money2(sub)}</span></div>
            <div><span>Shipping</span><span>{shipFee ? money2(shipFee) : "Free"}</span></div>
            <div><span>VAT incl.</span><span>{money2(vat)}</span></div>
          </div>
          <div className="tot" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontWeight: 800, fontSize: 20 }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 32 }}>{money2(total)}</span>
          </div>
        </aside>
      </main>
    </>
  );
}
