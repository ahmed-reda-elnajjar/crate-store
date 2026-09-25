"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/data";
import { recommend, resolveBody } from "@/lib/fit";
import { money } from "@/lib/format";
import { getImageBlob, putImage, removeImage, useImage } from "@/lib/images";
import { clearLooks, closeFitRoom, removeLook, saveLook, setFitTab, setTryonConsent, siteFor, toast, useStore } from "@/lib/store";
import { tryonModel, TRYON_MODELS, type ModelKey } from "@/lib/tryonModels";
import { ImageSlot, productImg } from "./ImageSlot";

const PERSON = "tryon-person";
const CACHE_INDEX = "crate-tryon-cache";
const MAX_PHOTOS = 3; // photos of one piece sent to the try-on service

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
  const [gender, setGender] = useState<ModelKey>("male");
  const maleUpload = useImage(tryonModel("male").slot);
  const femaleUpload = useImage(tryonModel("female").slot);
  const model = tryonModel(gender);
  // The CRATE model shown / dressed: the admin's upload for this group, else the built-in photo (male only).
  const modelUrl = (gender === "male" ? maleUpload : femaleUpload) ?? model.src ?? null;

  const [status, setStatus] = useState<{ configured: boolean; provider: string | null; remaining: number } | null>(null);
  const [source, setSource] = useState<"me" | "model">("model");
  // Which photo slots (0..3) each product has an uploaded photo in; the built-in photo (public/products) is the fallback.
  const [shots, setShots] = useState<Record<string, number[]>>({});
  const [picked, setPicked] = useState<Record<Layer, string | undefined>>(() => ({ 0: undefined, 1: undefined, 2: undefined }));
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Opening the tab shows the most recent saved look, so earlier results are waiting for the customer.
  const [compare, setCompare] = useState<string[]>(() => (s.looks[0] ? [s.looks[0].id] : []));

  useEffect(() => {
    fetch("/api/tryon").then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false, provider: null, remaining: 0 }));
  }, []);
  useEffect(() => {
    if (personUrl) setSource("me");
  }, [personUrl]);

  // Every clothing piece is listed; those without a photo yet are shown but can't be picked.
  useEffect(() => {
    let alive = true;
    Promise.all(
      products.map(async (p) => {
        const have: number[] = [];
        for (let i = 0; i < MAX_PHOTOS; i++) if (await getImageBlob(productImg(p.id, i)).catch(() => undefined)) have.push(i);
        return [p.id, have] as const;
      }),
    ).then((rows) => {
      if (alive) setShots(Object.fromEntries(rows));
    });
    return () => {
      alive = false;
    };
  }, [products]);
  const hasPhoto = (p: Product) => !!p.photo || (shots[p.id]?.length ?? 0) > 0;
  const pieces = useMemo(() => products.filter((p) => p.live && p.category !== "accessories"), [products]);

  // Start with the piece the fit room was opened for.
  useEffect(() => {
    const p = pieces.find((x) => x.id === productId);
    if (p && hasPhoto(p)) setPicked((m) => (m[layerOf(p)] ? m : { ...m, [layerOf(p)]: p.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, productId, shots]);

  const chosen = ([0, 1, 2] as Layer[]).map((l) => pieces.find((p) => p.id === picked[l])).filter((p): p is Product => !!p);
  const body = resolveBody(s.fit);
  const sizeOf = (p: Product) => (p.measurements ? recommend(p, body).rec : undefined);
  const lead = [...chosen].reverse().find((p) => sizeOf(p));
  const rec = lead ? sizeOf(lead) : undefined;

  /** Every photo of the piece (up to MAX_PHOTOS): the uploaded ones, or the built-in photo. */
  const garmentSrcs = async (p: Product): Promise<(Blob | string)[]> => {
    const out: (Blob | string)[] = [];
    for (const i of shots[p.id] ?? []) {
      const b = await getImageBlob(productImg(p.id, i)).catch(() => undefined);
      if (b) out.push(b);
    }
    return out.length ? out : p.photo ? [p.photo] : [];
  };

  /** Every generated image is kept on this device and listed under "Saved looks" (newest 12). */
  const remember = async (blob: Blob, id: string) => {
    if (s.looks.some((l) => l.id === id)) return;
    await putImage(`look-${id}`, blob);
    saveLook({ id, items: chosen.map((p) => p.id), at: Date.now() });
    // The store keeps 12 looks; free the images of the ones that fall off the end.
    s.looks.slice(11).forEach((l) => void removeImage(`look-${l.id}`).catch(() => undefined));
  };

  const generate = async () => {
    setError(null);
    if (!consent) return setError("Tick the consent box first.");
    if (source === "me" && !personUrl) return setError("Add a full-body photo of yourself, or use the CRATE model.");
    if (source === "model" && !modelUrl) return setError(`There is no ${model.label.toLowerCase()} model photo yet. Ask the store to add one.`);
    if (!chosen.length) return setError("Pick at least one piece.");
    setResult(null);
    setCompare([]);
    const started = Date.now();
    setBusy(0);
    const tick = setInterval(() => setBusy(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const personBlob = await getImageBlob(source === "me" ? PERSON : model.slot).catch(() => undefined);
      const person = await toDataUrl(personBlob ?? (source === "me" ? PERSON : model.src!));
      const key = `tryon-cache-${await sha(person.slice(0, 20000) + person.length + "|" + chosen.map((p) => `${p.id}:${(shots[p.id] ?? []).join(".")}`).join(","))}`;
      const lookId = key.slice("tryon-cache-".length);
      const cached = await getImageBlob(key).catch(() => undefined);
      if (cached) {
        await remember(cached, lookId);
        setResult(URL.createObjectURL(cached));
        return;
      }
      const items = await Promise.all(
        chosen.map(async (p) => {
          const srcs = await garmentSrcs(p);
          return {
            garment: await toDataUrl(srcs[0]),
            // Extra photos of the same piece (back, detail) help the service copy it exactly.
            extra: await Promise.all(srcs.slice(1).map((x) => toDataUrl(x, 800))),
            category: p.category === "bottoms" ? "bottoms" : "tops",
            layer: layerOf(p),
            description: p.tryonNote?.trim() ? `${p.name}. Exact details: ${p.tryonNote.trim()}` : p.name,
          };
        }),
      );
      const res = await fetch("/api/tryon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person, items }) });
      const data = await res.json().catch(() => ({}));
      if (typeof data.remaining === "number") setStatus((st) => (st ? { ...st, remaining: data.remaining } : st));
      if (!res.ok || !data.image) throw new Error(data.error ?? "The try-on didn't work. Try again.");
      const blob = await (await fetch(data.image)).blob();
      await putImage(key, blob);
      writeIndex([...readIndex(), key]);
      await remember(blob, lookId);
      setResult(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The try-on didn't work.");
    } finally {
      clearInterval(tick);
      setBusy(null);
    }
  };

  /** Save the shown image to the device as a file. */
  const download = async (url: string) => {
    const blob = await (await fetch(url)).blob();
    const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `crate-look-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
          {source === "model" && (
            <div className="seg" style={{ alignSelf: "flex-start" }} role="radiogroup" aria-label="Model">
              {TRYON_MODELS.map((m) => (
                <label key={m.key} className="seg-opt"><input type="radio" name="model" checked={gender === m.key} onChange={() => { setGender(m.key); setResult(null); }} /><span>{m.label}</span></label>
              ))}
            </div>
          )}
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
                    const ok = hasPhoto(p);
                    return (
                      <button key={p.id} className={`pick ${on ? "on" : ""}`} aria-pressed={on} disabled={!ok} title={ok ? undefined : "No photo yet. Add one in Admin → Products."} style={ok ? undefined : { opacity: 0.55 }} onClick={() => setPicked((m) => ({ ...m, [l]: on ? undefined : p.id }))}>
                        <span className="ph"><ImageSlot id={productImg(p.id)} src={p.photo} alt="" /></span>
                        <span className="nm">{p.name}</span>
                        <span className="pr">{ok ? money(p.price) : "No photo yet"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {pieces.length > 0 && !pieces.some(hasPhoto) && <span className="muted" style={{ fontSize: 13 }}>No pieces have photos yet. Admins can add them in Admin → Products.</span>}
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
                {status?.provider === "meta" && <MetaBadge />}
                <b>Dressing {source === "me" ? "you" : "the model"}…</b>
                <span>{busy}s · usually 10–40 seconds per piece</span>
              </>
            ) : source === "me" && personUrl ? (
              <img src={personUrl} alt="Your photo" className="real-img dim" />
            ) : source === "model" && modelUrl ? (
              <img src={modelUrl} alt={`CRATE model, ${model.label.toLowerCase()}`} className="real-img dim" />
            ) : source === "model" ? (
              <span>No {model.label.toLowerCase()} model photo yet.</span>
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
              <span className="label" style={{ marginTop: 12 }}>Your saved looks · pick up to 3 to compare</span>
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
          {result && <button className="btn btn-secondary row h44" onClick={() => void download(result)}><span>Download image</span><span>↓</span></button>}
          <button className="btn btn-ghost row h32" onClick={() => setFitTab("fit")}><span>Check the fit by zone</span><span>→</span></button>
          {result && <span className="muted" style={{ fontSize: 12 }}>Saved to your looks on this device.</span>}
          {status && ready && <span className="muted" style={{ fontSize: 12 }}>{status.remaining} looks left today.</span>}
        </div>
      </div>
    </div>
  );
}

/** The Meta AI logo (public/brand/meta-ai.png), spinning while the image is being made. */
function MetaBadge() {
  const [logo, setLogo] = useState(true);
  return (
    <span className="meta-badge" role="status" aria-label="Powered by Meta AI">
      {logo ? <img className="spin" src="/brand/meta-ai.png" alt="" width={64} height={64} onError={() => setLogo(false)} /> : <span className="ring" aria-hidden />}
      <span>Powered by Meta AI</span>
    </span>
  );
}

function SavedImage({ id }: { id: string }) {
  const url = useImage(`look-${id}`);
  return url ? <img src={url} alt="Saved look" /> : <span className="slot-empty" />;
}
