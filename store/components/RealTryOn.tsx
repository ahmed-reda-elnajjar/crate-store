"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/data";
import { recommend, resolveBody } from "@/lib/fit";
import { money } from "@/lib/format";
import { getImageBlob, putImage, removeImage, useImage } from "@/lib/images";
import { clearLooks, closeFitRoom, removeLook, saveLook, setFitTab, setTryonConsent, siteFor, toast, useStore } from "@/lib/store";
import { ImageSlot, productImg } from "./ImageSlot";

const PERSON = "tryon-person";
const STORE_MODEL = "/lookbook/model.jpg";
const CACHE_INDEX = "crate-tryon-cache";

type Layer = 0 | 1 | 2; // bottoms, tops, outerwear: worn in that order
const layerOf = (p: Product): Layer => (p.category === "bottoms" ? 0 : p.category === "outerwear" ? 2 : 1);
const LAYER_NAMES = ["Bottoms", "Tops", "Outerwear"];

/** Downscale to ≤1024px JPEG on white, so uploads stay small and transparent PNGs work everywhere. */
async function toDataUrl(src: Blob | string, max = 1024): Promise<string> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

async function sha(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

const readIndex = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_INDEX) ?? "[]");
  } catch {
    return [];
  }
};
const writeIndex = (keys: string[]) => {
  try {
    localStorage.setItem(CACHE_INDEX, JSON.stringify(keys.slice(-40)));
  } catch {
    /* storage blocked: cache stays per session */
  }
};

/**
 * 03 Real try-on: a photoreal image of the customer (or the CRATE model) wearing
 * 1–3 store pieces, from the server's try-on service. The 02 tab still decides
 * the size; this shows the look and whether the colours work together.
 */
export function RealTryOn({ productId }: { productId?: string }) {
  const s = useStore();
  const products = siteFor(s).products;
  const role = s.session.role;
  const consent = s.tryonConsent;
  const personUrl = useImage(PERSON);

  const [status, setStatus] = useState<{ configured: boolean; provider: string | null; remaining: number } | null>(null);
  const [source, setSource] = useState<"me" | "model">("model");
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Record<Layer, string | undefined>>(() => ({ 0: undefined, 1: undefined, 2: undefined }));
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/tryon").then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false, provider: null, remaining: 0 }));
  }, []);
  useEffect(() => {
    if (personUrl) setSource("me");
  }, [personUrl]);

  // Pieces that can be tried on: clothing with a product photo (built-in or uploaded by an admin).
  useEffect(() => {
    let alive = true;
    Promise.all(products.map(async (p) => ((await getImageBlob(productImg(p.id)).catch(() => undefined)) ? p.id : null))).then((ids) => {
      if (alive) setUploaded(new Set(ids.filter((x): x is string => !!x)));
    });
    return () => {
      alive = false;
    };
  }, [products]);
  const pieces = useMemo(() => products.filter((p) => p.live && p.category !== "accessories" && (p.photo || uploaded.has(p.id))), [products, uploaded]);

  // Start with the piece the fit room was opened for.
  useEffect(() => {
    const p = pieces.find((x) => x.id === productId);
    if (p) setPicked((m) => (m[layerOf(p)] ? m : { ...m, [layerOf(p)]: p.id }));
  }, [pieces, productId]);

  const chosen = ([0, 1, 2] as Layer[]).map((l) => pieces.find((p) => p.id === picked[l])).filter((p): p is Product => !!p);
  const body = resolveBody(s.fit);
  const sizeOf = (p: Product) => (p.measurements ? recommend(p, body).rec : undefined);
  const lead = [...chosen].reverse().find((p) => sizeOf(p));
  const rec = lead ? sizeOf(lead) : undefined;

  const garmentSrc = async (p: Product) => (await getImageBlob(productImg(p.id)).catch(() => undefined)) ?? p.photo!;

  const generate = async () => {
    setError(null);
    if (!consent) return setError("Tick the consent box first.");
    if (source === "me" && !personUrl) return setError("Add a full-body photo of yourself, or use the CRATE model.");
    if (!chosen.length) return setError("Pick at least one piece.");
    setResult(null);
    setCompare([]);
    const started = Date.now();
    setBusy(0);
    const tick = setInterval(() => setBusy(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const personBlob = source === "me" ? await getImageBlob(PERSON) : undefined;
      const person = await toDataUrl(personBlob ?? STORE_MODEL);
      const key = `tryon-cache-${await sha(person.slice(0, 20000) + person.length + "|" + chosen.map((p) => p.id).join(","))}`;
      const cached = await getImageBlob(key).catch(() => undefined);
      if (cached) {
        setResult(URL.createObjectURL(cached));
        return;
      }
      const items = await Promise.all(
        chosen.map(async (p) => ({
          garment: await toDataUrl(await garmentSrc(p)),
          category: p.category === "bottoms" ? "bottoms" : "tops",
          layer: layerOf(p),
          description: `${p.name}, ${p.colourways[0]}`,
        })),
      );
      const res = await fetch("/api/tryon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person, items }) });
      const data = await res.json().catch(() => ({}));
      if (typeof data.remaining === "number") setStatus((st) => (st ? { ...st, remaining: data.remaining } : st));
      if (!res.ok || !data.image) throw new Error(data.error ?? "The try-on didn't work. Try again.");
      const blob = await (await fetch(data.image)).blob();
      await putImage(key, blob);
      writeIndex([...readIndex(), key]);
      setResult(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The try-on didn't work.");
    } finally {
      clearInterval(tick);
      setBusy(null);
    }
  };

  const keep = async () => {
    if (!result) return;
    const id = Date.now().toString(36);
    await putImage(`look-${id}`, await (await fetch(result)).blob());
    saveLook({ id, items: chosen.map((p) => p.id), at: Date.now() });
    toast("Look saved. Compare it with others on the right.");
  };

  const deleteAll = async () => {
    await removeImage(PERSON);
    await Promise.all([...readIndex(), ...s.looks.map((l) => `look-${l.id}`)].map((k) => removeImage(k).catch(() => undefined)));
    writeIndex([]);
    clearLooks();
    setTryonConsent(false);
    setResult(null);
    setCompare([]);
    setSource("model");
    toast("Your photo and try-on images were deleted from this device.");
  };

  if (role === "guest") {
    return (
      <div className="fit-body real-empty">
        <div>
          <span className="display" style={{ fontSize: 44 }}>See it on you.</span>
          <p>Photo try-on puts store pieces on a real photo of you, or on the CRATE model. Sign in to use it.</p>
          <Link href="/signin" className="btn btn-primary row h52" style={{ width: 260 }} onClick={closeFitRoom}><span>Sign in</span><span>→</span></Link>
        </div>
      </div>
    );
  }

  const ready = !!status?.configured;
  const lookItems = (ids: string[]) => ids.map((id) => products.find((p) => p.id === id)?.name).filter(Boolean).join(" + ");

  return (
    <div className="fit-body">
      <div className="fit-ctl">
        <section>
          <span className="label">Who wears it</span>
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            <label className="seg-opt"><input type="radio" name="who" checked={source === "me"} onChange={() => setSource("me")} /><span>My photo</span></label>
            <label className="seg-opt"><input type="radio" name="who" checked={source === "model"} onChange={() => setSource("model")} /><span>CRATE model</span></label>
          </div>
          <label className="radio" style={{ alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setTryonConsent(e.target.checked)} />
            <span className="dot" style={{ marginTop: 2 }} />
            <span>I agree that the photo I use is sent to our try-on service to make the image. CRATE keeps it only on this device.</span>
          </label>
          {source === "me" && (
            <div className="real-person">
              <div className="ph">
                {consent ? (
                  <ImageSlot id={PERSON} fit="contain" editable placeholder="Drop a full-body photo" alt="Your photo" />
                ) : (
                  <span className="slot-empty">Tick the box above to add your photo</span>
                )}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>Full body, facing the camera, arms slightly away from your sides, fitted clothes, plain background and good light.</span>
            </div>
          )}
          {(personUrl || s.looks.length > 0) && (
            <button className="unbtn u" style={{ fontSize: 13, alignSelf: "flex-start" }} onClick={() => void deleteAll()}>Delete my photos and looks</button>
          )}
        </section>
        <section>
          <span className="label">Pieces · one per group</span>
          {([1, 2, 0] as Layer[]).map((l) => {
            const list = pieces.filter((p) => layerOf(p) === l);
            if (!list.length) return null;
            return (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12 }}>{LAYER_NAMES[l]}</span>
                <div className="real-pieces">
                  {list.map((p) => {
                    const on = picked[l] === p.id;
                    return (
                      <button key={p.id} className={`pick ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setPicked((m) => ({ ...m, [l]: on ? undefined : p.id }))}>
                        <span className="ph"><ImageSlot id={productImg(p.id)} src={p.photo} alt="" /></span>
                        <span className="nm">{p.name}</span>
                        <span className="pr">{money(p.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {pieces.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No pieces have photos yet. Admins can add them in Admin → Products.</span>}
        </section>
      </div>

      <div className="real-stage">
        {compare.length > 0 ? (
          <div className="real-compare" style={{ gridTemplateColumns: `repeat(${compare.length}, 1fr)` }}>
            {compare.map((id) => (
              <figure key={id}>
                <SavedImage id={id} />
                <figcaption>{lookItems(s.looks.find((l) => l.id === id)?.items ?? [])}</figcaption>
              </figure>
            ))}
          </div>
        ) : result ? (
          <img src={result} alt={`Try-on: ${chosen.map((p) => p.name).join(", ")}`} className="real-img" />
        ) : (
          <div className="real-placeholder">
            {busy !== null ? (
              <>
                <b>Dressing {source === "me" ? "you" : "the model"}…</b>
                <span>{busy}s · usually 10–40 seconds per piece</span>
              </>
            ) : source === "me" && personUrl ? (
              <img src={personUrl} alt="Your photo" className="real-img dim" />
            ) : source === "model" ? (
              <img src={STORE_MODEL} alt="CRATE model" className="real-img dim" />
            ) : (
              <span>Add your photo on the left</span>
            )}
          </div>
        )}
        {status && !ready && (
          <div className="real-note">Photo try-on isn&apos;t switched on for this store yet. The owner adds a try-on service key in the server settings (TRYON_PROVIDER in .env.local).</div>
        )}
        {status?.provider === "mock" && result && <div className="real-note">Test mode: no try-on service is connected, so the photo comes back unchanged.</div>}
        {error && <div className="real-note err" role="alert">{error}</div>}
      </div>

      <div className="fit-res">
        <div className="verdict">
          <span style={{ fontSize: 13, fontWeight: 600 }}>Your size</span>
          <b>{rec ?? "—"}</b>
          <span style={{ fontSize: 12 }}>{lead ? `${lead.name}, from your body profile. Check each zone in 02.` : "Pick a measured piece to see your size."}</span>
        </div>
        <div className="real-side">
          <span className="label">This look</span>
          {chosen.length ? chosen.map((p) => (
            <div key={p.id} className="real-line"><span>{p.name}{sizeOf(p) ? ` · ${sizeOf(p)}` : ""}</span><span>{money(p.price)}</span></div>
          )) : <span className="muted" style={{ fontSize: 13 }}>Nothing picked yet.</span>}
          {s.looks.length > 0 && (
            <>
              <span className="label" style={{ marginTop: 12 }}>Saved looks · pick up to 3 to compare</span>
              <div className="real-saved">
                {s.looks.map((l) => {
                  const on = compare.includes(l.id);
                  return (
                    <div key={l.id} className={`real-thumb ${on ? "on" : ""}`}>
                      <button className="unbtn" aria-pressed={on} title={lookItems(l.items)} onClick={() => setCompare((c) => (on ? c.filter((x) => x !== l.id) : [...c, l.id].slice(-3)))}>
                        <SavedImage id={l.id} />
                      </button>
                      <button className="unbtn x" aria-label="Delete look" onClick={() => (removeLook(l.id), setCompare((c) => c.filter((x) => x !== l.id)), void removeImage(`look-${l.id}`))}>×</button>
                    </div>
                  );
                })}
              </div>
              {compare.length > 0 && <button className="unbtn u" style={{ fontSize: 13 }} onClick={() => setCompare([])}>Back to current look</button>}
            </>
          )}
        </div>
        <div className="cta">
          <button className="btn btn-primary row h56" disabled={busy !== null || !ready || !chosen.length} onClick={() => void generate()}>
            <span>{busy !== null ? "Generating…" : result ? "Generate again" : "Generate look"}</span><span>→</span>
          </button>
          {result && <button className="btn btn-secondary row h44" onClick={() => void keep()}><span>Save this look</span><span>+</span></button>}
          <button className="btn btn-ghost row h32" onClick={() => setFitTab("fit")}><span>Check the fit by zone</span><span>→</span></button>
          {status && ready && <span className="muted" style={{ fontSize: 12 }}>{status.remaining} looks left today.</span>}
        </div>
      </div>
    </div>
  );
}

function SavedImage({ id }: { id: string }) {
  const url = useImage(`look-${id}`);
  return url ? <img src={url} alt="Saved look" /> : <span className="slot-empty" />;
}
