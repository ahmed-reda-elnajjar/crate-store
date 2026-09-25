"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BEARDS, BROWS, DEFAULT_LOOK, EYE_COLOURS, HAIR_COLOURS, HAIR_STYLES, SKIN_TONES, type Appearance, type Slot, type Wear } from "@/lib/avatar3d";
import { BOTTOM_MEASURES, SIZE_CHART, TOP_MEASURES, isBottom, type Product } from "@/lib/data";
import { fitSize, recommend, resolveBody, type Body, type Level } from "@/lib/fit";
import { money } from "@/lib/format";
import { useImage, useImages } from "@/lib/images";
import { AVATAR_FILE, AVATAR_SLOT, modelSlot, sizeRatios } from "@/lib/models";
import { addToBag, closeFitRoom, setFitTab, siteFor, toast, useStore } from "@/lib/store";
import { BodyMeasures, BodySliders, overrideCount } from "./BodyProfile";
import { ImageSlot, productImg } from "./ImageSlot";
import type { Focus } from "./Lobby3D";
import { SWATCH } from "./ProductCard";
import { RealTryOn } from "./RealTryOn";

const Lobby3D = dynamic(() => import("./Lobby3D"), { ssr: false, loading: () => <div className="lobby3d"><div className="lobby-fail">Loading 3D…</div></div> });

const DEFAULTS: Partial<Record<Slot, string>> = { top: "boxy-heavy-tee", bottom: "double-knee-carpenter" };
const SLOTS: { k: Slot; l: string }[] = [
  { k: "top", l: "Tops" },
  { k: "outer", l: "Outerwear" },
  { k: "bottom", l: "Bottoms" },
  { k: "head", l: "Caps" },
];
const SLOT_ONE: Record<Slot, string> = { top: "Top", outer: "Outer", bottom: "Bottom", head: "Cap" };
const VIEWS: [string, number][] = [["Front", 0], ["Side", -Math.PI / 2], ["Back", Math.PI]];

type LookRail = "hair" | "colour" | "beard" | "brows" | "eyes" | "skin" | "photo";
const LOOK_RAIL: { k: LookRail; l: string }[] = [
  { k: "hair", l: "Hairstyle" },
  { k: "colour", l: "Hair colour" },
  { k: "beard", l: "Beard" },
  { k: "brows", l: "Brows" },
  { k: "eyes", l: "Eyes" },
  { k: "skin", l: "Skin" },
  { k: "photo", l: "Face photo" },
];

/** Line icons for the locker's side rail. */
const ICONS: Record<Slot | LookRail, ReactNode> = {
  top: <path d="M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3c-1 2-2 3-4 3S9 5 8 3z" />,
  outer: <path d="M8 3 3 6l1 15h5V9m7-6 5 3-1 15h-5V9M8 3l4 4 4-4m-4 4v14" />,
  bottom: <path d="M6 3h12l1 18h-5l-2-11-2 11H5z" />,
  head: <path d="M3 15c0-5 4-9 9-9s9 4 9 9zm9 0h10" />,
  hair: <path d="M4 15c0-7 4-11 8-11s8 4 8 11c-2-3-5-5-8-5s-6 2-8 5z" />,
  colour: <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />,
  beard: <path d="M5 8c0 7 3 12 7 12s7-5 7-12c-2 3-4 4-7 4S7 11 5 8z" />,
  brows: <path d="M3 10c3-3 6-3 8-1m2-1c2-2 5-2 8 1M6 15h3m6 0h3" />,
  eyes: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
  skin: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7" /></>,
  photo: <><path d="M4 7h4l2-2h4l2 2h4v12H4z" /><circle cx="12" cy="13" r="3" /></>,
};
const Icon = ({ k }: { k: Slot | LookRail }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{ICONS[k]}</svg>
);

/** Which part of the outfit a product fills; accessories only if they're a cap or hat. */
function slotOf(p: Product): Slot | undefined {
  if (p.category === "accessories") return /cap|hat|beanie/i.test(p.name) ? "head" : undefined;
  if (p.category === "bottoms" || p.shape === "pants") return "bottom";
  if (p.category === "outerwear") return "outer";
  return "top";
}

/** Card background by price, like item rarity in a game locker. */
const tierOf = (p: Product) => (p.price >= 180 ? "t4" : p.price >= 120 ? "t3" : p.price >= 80 ? "t2" : "t1");

/** Swatch colour for a colourway; unknown names fall back to a neutral step. */
const swatch = (c: string) => SWATCH[c] ?? "var(--color-neutral-500)";

function useLook(): [Appearance, (patch: Partial<Appearance>) => void] {
  const [look, setLook] = useState<Appearance>(DEFAULT_LOOK);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("crate-fit-look");
      if (saved) setLook({ ...DEFAULT_LOOK, ...JSON.parse(saved) });
    } catch {}
  }, []);
  const update = (patch: Partial<Appearance>) =>
    setLook((l) => {
      const next = { ...l, ...patch };
      try {
        localStorage.setItem("crate-fit-look", JSON.stringify(next));
      } catch {}
      return next;
    });
  return [look, update];
}

type ThumbJob = { key: string; run: (t: typeof import("@/lib/thumbs")) => string | Promise<string> };

/** Renders card images one at a time in the background and remembers them. */
function useThumbs(jobs: ThumbJob[]) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const done = useRef<Record<string, string>>({});
  const key = jobs.map((j) => j.key).join("¦");
  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await import("@/lib/thumbs");
      for (const j of jobs) {
        if (!alive) return;
        if (done.current[j.key]) continue;
        try {
          const url = await j.run(t);
          done.current[j.key] = url;
          if (alive) setThumbs((m) => ({ ...m, [j.key]: url }));
        } catch {
          // No WebGL: the card falls back to the product photo.
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return thumbs;
}

/** 3a (desktop modal) and 3b (mobile sheet): size guide + try-on. */
export function FitRoom() {
  const s = useStore();
  const { open, tab, productId } = s.ui.fitRoom;
  if (!open) return null;
  return <FitRoomDialog key={productId ?? "none"} tab={tab} productId={productId} />;
}

function FitRoomDialog({ tab, productId }: { tab: "guide" | "fit" | "real"; productId?: string }) {
  const s = useStore();
  const router = useRouter();
  const products = siteFor(s).products;
  const profile = s.fit;
  const { h } = profile;
  const body = useMemo(() => resolveBody(profile), [profile]);

  // Everything that can be worn in the fit room, grouped by slot.
  const wardrobe = useMemo(() => {
    const out: Record<Slot, Product[]> = { top: [], outer: [], bottom: [], head: [] };
    for (const p of products) {
      const k = slotOf(p);
      if (k && (p.live || p.id === productId) && (p.shape || k === "head")) out[k].push(p);
    }
    return out;
  }, [products, productId]);
  const byId = (id?: string) => (id ? products.find((p) => p.id === id) : undefined);

  // The outfit: one piece per slot, starting with the piece the room was opened for.
  const [outfit, setOutfit] = useState<Partial<Record<Slot, string>>>(() => {
    const o: Partial<Record<Slot, string>> = {};
    const opened = byId(productId);
    const k = opened && slotOf(opened);
    if (opened && k) o[k] = opened.id;
    for (const [slot, id] of Object.entries(DEFAULTS) as [Slot, string][]) if (!o[slot] && byId(id)) o[slot] = id;
    return o;
  });
  const [focusId, setFocusId] = useState<string | undefined>(() => (byId(productId) && slotOf(byId(productId)!) ? productId : outfit.top ?? outfit.bottom));
  const [locker, setLocker] = useState<"wardrobe" | "look" | "body">("wardrobe");
  const [shelf, setShelf] = useState<Slot>(() => (byId(focusId) && slotOf(byId(focusId)!)) || "top");
  const [lookRail, setLookRail] = useState<LookRail>("hair");
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [colours, setColours] = useState<Record<string, string>>({});
  const [heat, setHeat] = useState(false);
  const [cam, setCam] = useState<Focus>("full");
  const [turn, setTurn] = useState({ yaw: 0, n: 0 });
  const [dragging, setDragging] = useState(false);
  const [look, setLook] = useLook();
  const [product, setProduct] = useState<"body" | "product">("body");
  const faceUrl = useImage("fit-face");
  // Your own 3D files: uploaded in admin (this browser) or shipped in public/models.
  const avatarUpload = useImage(AVATAR_SLOT);
  const avatarUrl = avatarUpload ?? AVATAR_FILE ?? null;
  const modelUploads = useImages(products.map((p) => modelSlot(p.id)));
  const modelUrlOf = (p: Product) => modelUploads[modelSlot(p.id)] ?? p.model;

  const g = byId(focusId);
  const sizeFor = (p: Product) => {
    const pick = sizes[p.id];
    if (pick && p.sizes.includes(pick)) return pick;
    return (p.measurements ? recommend(p, body).rec : undefined) ?? p.sizes[0] ?? "";
  };
  const colourFor = (p: Product) => (colours[p.id] && p.colourways.includes(colours[p.id]) ? colours[p.id] : p.colourways[0]);

  const advice = g?.measurements ? recommend(g, body) : undefined;
  const size = g ? sizeFor(g) : "";
  const fit = g ? fitSize(g, body, size) : undefined;
  const row = SIZE_CHART.find((r) => r.size === size);
  const setSizePick = (l: string) => g && setSizes((m) => ({ ...m, [g.id]: l }));
  const resetPick = () => g && setSizes((m) => {
    const { [g.id]: _, ...rest } = m;
    return rest;
  });

  const wearOf = (p: Product, slot: Slot, b: Body): Wear => {
    const z = sizeFor(p);
    const f = fitSize(p, b, z);
    const zones: Record<string, Level> = {};
    for (const zn of f?.zones ?? []) zones[zn.k] = zn.level;
    const url = modelUrlOf(p);
    const base = p.modelSize && p.sizes.includes(p.modelSize) ? p.modelSize : p.sizes.includes("M") ? "M" : p.sizes[Math.floor(p.sizes.length / 2)];
    const model = url ? { url, ratio: sizeRatios(p.measurements?.[z], p.measurements?.[base], slot === "bottom"), recolour: colourFor(p) !== p.colourways[0] } : undefined;
    return { id: p.id, slot, shape: p.shape, fitStyle: p.fitStyle, m: p.measurements?.[z], colour: swatch(colourFor(p)), zones, name: p.name, model };
  };
  const worn = (Object.entries(outfit) as [Slot, string][]).map(([slot, id]) => ({ slot, p: byId(id) })).filter((x): x is { slot: Slot; p: Product } => !!x.p);
  const wear: Wear[] = useMemo(() => worn.map(({ slot, p }) => wearOf(p, slot, body)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(outfit), sizes, colours, body, products, modelUploads]);

  // Card images: every piece on the shelf, and the head with each hair / beard / brow option.
  const shelfItems = locker === "wardrobe" ? wardrobe[shelf] : [];
  const lookJobs: ThumbJob[] = locker !== "look" ? [] :
    lookRail === "hair" ? HAIR_STYLES.map((o) => ({ key: `hair:${o.k}`, look: { ...look, hairStyle: o.k } })).map(({ key, look: l }) => ({ key: `${key}|${JSON.stringify(l)}`, run: (t) => t.headThumb(body, l) })) :
    lookRail === "beard" ? BEARDS.map((o) => ({ ...look, beard: o.k })).map((l) => ({ key: `beard|${JSON.stringify(l)}`, run: (t) => t.headThumb(body, l) })) :
    lookRail === "brows" ? BROWS.map((o) => ({ ...look, brows: o.k })).map((l) => ({ key: `brows|${JSON.stringify(l)}`, run: (t) => t.headThumb(body, l) })) : [];
  const cardKey = (p: Product) => `${p.id}|${colourFor(p)}|${sizeFor(p)}|${body.h}|${body.chest}|${modelUrlOf(p) ?? ""}`;
  const thumbs = useThumbs([
    ...shelfItems.map((p): ThumbJob => ({ key: cardKey(p), run: (t) => t.garmentThumb(body, wearOf(p, slotOf(p)!, body)) })),
    ...lookJobs,
  ]);
  const lookThumb = (patch: Partial<Appearance>) => {
    const want = JSON.stringify({ ...look, ...patch });
    const k = Object.keys(thumbs).find((x) => x.endsWith(`|${want}`) && x.startsWith(lookRail === "hair" ? `hair:${patch.hairStyle}` : `${lookRail}|`));
    return k ? thumbs[k] : undefined;
  };

  const equip = (p: Product) => {
    const k = slotOf(p);
    if (!k) return;
    if (outfit[k] === p.id) {
      // Second tap on the focused piece takes it off (the bottom slot is never left empty).
      if (focusId === p.id && k !== "bottom") {
        setOutfit((o) => ({ ...o, [k]: undefined }));
        setFocusId(worn.find((x) => x.p.id !== p.id)?.p.id);
        return;
      }
    } else setOutfit((o) => ({ ...o, [k]: p.id }));
    setFocusId(p.id);
    setCam(k === "bottom" ? "bottom" : "top");
  };
  const unequip = (k: Slot) => {
    const id = outfit[k];
    setOutfit((o) => ({ ...o, [k]: undefined }));
    if (id === focusId) setFocusId(worn.find((x) => x.slot !== k)?.p.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeFitRoom();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  const guestGate = () => {
    if (s.session.role !== "guest") return false;
    closeFitRoom();
    toast("Sign in to add pieces to your bag.");
    router.push(`/signin?next=/product/${g?.id ?? ""}`);
    return true;
  };
  const inStock = (p: Product, z: string) => (p.stock[z] ?? 0) > 0;
  const available = !!g && !!size && inStock(g, size);
  const add = () => {
    if (!g || !size || guestGate()) return;
    addToBag(g.id, size, colourFor(g));
  };
  const lookable = worn.filter(({ p }) => inStock(p, sizeFor(p)));
  const lookTotal = lookable.reduce((t, { p }) => t + p.price, 0);
  const addLook = () => {
    if (guestGate()) return;
    for (const { p } of lookable) addToBag(p.id, sizeFor(p), colourFor(p));
  };

  const rec = advice?.rec;
  const ctaLabel = !g ? "Pick a piece" : available ? `Add ${size} to bag` : `${size} is sold out`;
  const overrides = overrideCount(profile);
  const zones = fit?.zones ?? [];
  const verdict = fit?.verdict ?? (g?.measurements ? "No specs yet" : "One size");
  const verdictAccent = fit ? fit.verdictAccent : false;

  // Product chart: four key garment measurements, widths doubled to circumferences.
  const productCols = (g && isBottom(g) ? BOTTOM_MEASURES : TOP_MEASURES).filter((c) => c.k !== "hemW" && c.k !== "shoulder" && c.k !== "rise").slice(0, 4);
  const cm = (v: number | undefined, flat: boolean) => (v === undefined ? "—" : String(flat ? v * 2 : v));

  const railOf = locker === "wardrobe"
    ? SLOTS.filter((x) => wardrobe[x.k].length).map((x) => ({ k: x.k as Slot | LookRail, l: x.l, on: shelf === x.k, go: () => setShelf(x.k) }))
    : locker === "look"
      ? LOOK_RAIL.map((x) => ({ k: x.k as Slot | LookRail, l: x.l, on: lookRail === x.k, go: () => setLookRail(x.k) }))
      : [];

  const card = (key: string, opts: { on: boolean; tier: string; img?: ReactNode; label: string; sub?: string; go: () => void; focus?: boolean }) => (
    <button key={key} className={`lcard ${opts.tier} ${opts.on ? "on" : ""} ${opts.focus ? "focus" : ""}`} onClick={opts.go} aria-pressed={opts.on}>
      <span className="art">{opts.img}</span>
      {opts.on && <span className="tick" aria-hidden="true">✓</span>}
      <span className="nm"><b>{opts.label}</b>{opts.sub && <span>{opts.sub}</span>}</span>
    </button>
  );
  const colourCard = (key: string, c: string, on: boolean, label: string, go: () => void) =>
    card(key, { on, tier: "t0", img: <i className="chip-c" style={{ background: c }} />, label, go });

  return (
    <div className="fit-backdrop" onClick={(e) => e.target === e.currentTarget && closeFitRoom()}>
      <div className="fit" role="dialog" aria-modal="true" aria-label="Fit room">
        <div className="fit-tabs">
          <button className={`pick ${tab === "guide" ? "acc" : ""}`} onClick={() => setFitTab("guide")}>01 Size guide</button>
          <button className={`pick ${tab === "fit" ? "acc" : ""}`} onClick={() => setFitTab("fit")}>02<span className="only-d">&nbsp;Locker &amp;</span> fit</button>
          <button className={`pick ${tab === "real" ? "acc" : ""}`} onClick={() => setFitTab("real")}>03<span className="only-d">&nbsp;Real</span> try-on</button>
          <button className="close" onClick={closeFitRoom}>Close ×</button>
        </div>

        {tab === "real" ? (
          <RealTryOn productId={productId} />
        ) : tab === "fit" ? (
          <div className="fit-body lobby-body">
            <div className={`stage lobby ${dragging ? "dragging" : ""}`}>
              <Lobby3D body={body} wear={wear} look={look} faceUrl={faceUrl} avatarUrl={avatarUrl} heat={heat} focus={cam} turn={turn} onDragChange={setDragging} />
              <div className="top">
                <div className="views">
                  {VIEWS.map(([l, yaw]) => (
                    <button key={l} className="pick" onClick={() => setTurn((t) => ({ yaw, n: t.n + 1 }))}>{l}</button>
                  ))}
                </div>
                <div className="views">
                  <button className={`pick ${cam === "full" ? "on" : ""}`} onClick={() => setCam("full")}>Full look</button>
                  <button className={`pick ${heat ? "on" : ""}`} onClick={() => setHeat(!heat)} aria-pressed={heat}>Fit heat</button>
                </div>
              </div>
              {heat && (
                <div className="heat-key" aria-label="Fit heat key">
                  <span><i style={{ background: "#e0321b" }} />Tight</span>
                  <span><i style={{ background: "#3aa76d" }} />Right</span>
                  <span><i style={{ background: "#2f5fc4" }} />Loose</span>
                </div>
              )}
              <div className="loadout">
                {SLOTS.map(({ k }) => {
                  const p = byId(outfit[k]);
                  if (!p) return null;
                  return (
                    <div key={k} className={`chip ${focusId === p.id ? "on" : ""}`}>
                      <button className="unbtn" onClick={() => { setFocusId(p.id); setShelf(k); setLocker("wardrobe"); setCam(k === "bottom" ? "bottom" : "top"); }}>
                        <span className="muted">{SLOT_ONE[k]}</span> <b>{p.name}</b> · {sizeFor(p)}
                      </button>
                      {k !== "bottom" && <button className="unbtn x" aria-label={`Take off ${p.name}`} onClick={() => unequip(k)}>×</button>}
                    </div>
                  );
                })}
              </div>
              <span className="hint drag-hint">Drag to turn · scroll to zoom</span>
            </div>

            <aside className="locker">
              <div className="locker-tabs">
                {([["wardrobe", "Wardrobe"], ["look", "Appearance"], ["body", "Body"]] as const).map(([k, l]) => (
                  <button key={k} className={`pick ${locker === k ? "on" : ""}`} onClick={() => setLocker(k)}>{l}</button>
                ))}
              </div>
              <div className="locker-main">
                <div className="locker-scroll">
                  {locker === "wardrobe" && (
                    <>
                      <div className="lgrid">
                        {wardrobe[shelf].map((p) => {
                          const art = thumbs[cardKey(p)];
                          return card(p.id, {
                            on: outfit[shelf] === p.id,
                            focus: focusId === p.id,
                            tier: tierOf(p),
                            img: art ? <img src={art} alt="" draggable={false} /> : <ImageSlot id={productImg(p.id)} src={p.photo} placeholder="" fit="contain" />,
                            label: p.name,
                            sub: money(p.price),
                            go: () => equip(p),
                          });
                        })}
                      </div>
                      {g && (
                        <div className="ldetail">
                          <div className={`verdict ${verdictAccent ? "acc" : ""}`}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name} · {size}</span>
                            <b>{verdict}</b>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", gap: 8 }}>
                            <span className="muted">Size</span>
                            {rec && <span style={{ color: "var(--color-accent-700)", fontWeight: 600, whiteSpace: "nowrap" }}>We recommend {rec}</span>}
                          </div>
                          <div className="fsizes cells boxed" style={{ gridTemplateColumns: `repeat(${Math.max(1, g.sizes.length)}, 1fr)` }}>
                            {g.sizes.map((l) => (
                              <button key={l} className={`pick ${l === size ? "on" : l === rec ? "rec" : ""}`} onClick={() => setSizePick(l)} aria-pressed={l === size}>
                                <span>{l}</span>
                                <small>{l === rec ? "FOR YOU" : " "}</small>
                              </button>
                            ))}
                          </div>
                          {g.colourways.length > 1 && (
                            <div className="cw-row" role="radiogroup" aria-label="Colour">
                              {g.colourways.map((c) => (
                                <button key={c} role="radio" aria-checked={c === colourFor(g)} aria-label={c} title={c} className={`swatch ${c === colourFor(g) ? "on" : ""}`} style={{ background: swatch(c) }} onClick={() => setColours((m) => ({ ...m, [g.id]: c }))} />
                              ))}
                              <span className="muted" style={{ fontSize: 13 }}>{colourFor(g)}</span>
                            </div>
                          )}
                          <div className="zones">
                            {zones.map((z) => (
                              <div className="zone" key={z.k}>
                                <div className="t"><span>{z.k}</span><span><b>{z.label}</b> · {z.note}</span></div>
                                <div className="bar">{z.bar.map((c, i) => <span key={i} style={{ background: c }} />)}</div>
                              </div>
                            ))}
                          </div>
                          {advice ? <p className="why">{advice.why}</p> : <p className="why muted">No fit to check: this piece is one size.</p>}
                        </div>
                      )}
                    </>
                  )}

                  {locker === "look" && (
                    <div className="lgrid">
                      {lookRail === "hair" && HAIR_STYLES.map((o) => card(o.k, { on: look.hairStyle === o.k, tier: "t0", img: lookThumb({ hairStyle: o.k }) ? <img src={lookThumb({ hairStyle: o.k })} alt="" /> : null, label: o.l, go: () => setLook({ hairStyle: o.k }) }))}
                      {lookRail === "beard" && BEARDS.map((o) => card(o.k, { on: look.beard === o.k, tier: "t0", img: lookThumb({ beard: o.k }) ? <img src={lookThumb({ beard: o.k })} alt="" /> : null, label: o.l, go: () => setLook({ beard: o.k }) }))}
                      {lookRail === "brows" && BROWS.map((o) => card(o.k, { on: look.brows === o.k, tier: "t0", img: lookThumb({ brows: o.k }) ? <img src={lookThumb({ brows: o.k })} alt="" /> : null, label: o.l, go: () => setLook({ brows: o.k }) }))}
                      {lookRail === "colour" && HAIR_COLOURS.map((c, i) => colourCard(c, c, look.hair === c, `Shade ${i + 1}`, () => setLook({ hair: c })))}
                      {lookRail === "eyes" && EYE_COLOURS.map((c, i) => colourCard(c, c, look.eyes === c, ["Brown", "Hazel", "Green", "Blue", "Grey"][i] ?? `Shade ${i + 1}`, () => setLook({ eyes: c })))}
                      {lookRail === "skin" && SKIN_TONES.map((c, i) => colourCard(c, c, look.skin === c, `Tone ${i + 1}`, () => setLook({ skin: c })))}
                      {lookRail === "photo" && (
                        <div className="lphoto">
                          <div className="ph"><ImageSlot id="fit-face" round editable placeholder="Add face photo" /></div>
                          <p className="muted">Optional. A front-facing, well-lit photo goes on your avatar&rsquo;s face in place of the drawn features. It stays on this device.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {locker === "body" && (
                    <div className="lbody">
                      <BodySliders profile={profile} onChange={() => setSizes({})} />
                      <details className="measures-d" open>
                        <summary>
                          <span>Your measurements</span>
                          <span className="muted">{overrides ? `${overrides} of 6 yours, rest estimated` : "Estimated from height and weight"}</span>
                        </summary>
                        <BodyMeasures profile={profile} onChange={() => setSizes({})} />
                      </details>
                      <span className="label">Your sizes in this look</span>
                      {worn.map(({ p }) => (
                        <div key={p.id} className="real-line"><span>{p.name}</span><b>{sizeFor(p)}</b></div>
                      ))}
                    </div>
                  )}
                </div>
                {railOf.length > 0 && (
                  <nav className="locker-rail" aria-label="Categories">
                    {railOf.map((x) => (
                      <button key={x.k} className={x.on ? "on" : ""} onClick={x.go} title={x.l} aria-label={x.l} aria-pressed={x.on}><Icon k={x.k} /></button>
                    ))}
                  </nav>
                )}
              </div>
              <div className="locker-cta">
                <button className="btn btn-primary row h52" onClick={add} disabled={!available} style={{ fontSize: 15 }}><span>{ctaLabel}</span><span>→</span></button>
                {worn.length > 1 && (
                  <button className="btn btn-secondary row h44" onClick={addLook} disabled={!lookable.length}>
                    <span>Add the look ({lookable.length})</span><span>{money(lookTotal)} →</span>
                  </button>
                )}
                {rec && g && sizes[g.id] && sizes[g.id] !== rec && <button className="btn btn-secondary row h44" onClick={resetPick}><span>Use recommended ({rec})</span><span>↺</span></button>}
              </div>
            </aside>
          </div>
        ) : (
          <div className="fit-body">
            <div className="guide-l">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="label">Stretch</span>
                <div className="stretch"><span>None</span><span className="on">Slight</span><span>Medium</span><span>High</span></div>
              </div>
              <div className="body-fig">
                <svg viewBox="0 0 200 440" width="260" height="572" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
                  <circle cx="100" cy="38" r="22" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
                  <path d="M92 58 L92 76 M108 58 L108 76 M62 84 C48 88 44 104 44 120 L38 240 L50 242 L60 130 M138 84 C152 88 156 104 156 120 L162 240 L150 242 L140 130 M64 205 L68 420 L94 420 L99 225 L101 225 L106 420 L132 420 L136 205 M60 82 Q100 70 140 82 L134 170 Q132 190 136 205 L64 205 Q68 190 66 170 Z" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
                  <ellipse cx="100" cy="108" rx="44" ry="7" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
                  <ellipse cx="100" cy="165" rx="36" ry="6" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
                  <line x1="180" y1="16" x2="180" y2="420" stroke="var(--color-accent)" strokeWidth="3" />
                </svg>
                <span className="lbl" style={{ left: -100, top: 128 }}>Chest {row?.chest ?? body.chest}</span>
                <span className="lbl" style={{ left: -100, top: 202 }}>Waist {row?.waist ?? body.waist}</span>
                <span className="lbl" style={{ left: 200, top: 280 }}>{row?.height ?? h}</span>
              </div>
            </div>
            <div className="guide-r">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="seg">
                  <label className="seg-opt"><input type="radio" name="chart" checked={product === "body"} onChange={() => setProduct("body")} /><span>Body chart</span></label>
                  <label className="seg-opt"><input type="radio" name="chart" checked={product === "product"} onChange={() => setProduct("product")} /><span>Product chart</span></label>
                </div>
                <span style={{ fontSize: 13 }}>Units: cm · EU</span>
              </div>
              {product === "body" ? (
                <div className="chart">
                  <div className="hd"><span>Size</span><span>EU</span><span>Chest</span><span>Waist</span><span>Height</span></div>
                  {SIZE_CHART.map((r) => (
                    <button key={r.size} className={`pick ${r.size === size ? "sel" : ""}`} onClick={() => g?.sizes.includes(r.size) && setSizePick(r.size)}>
                      <span>{r.size}</span><span>{r.eu}</span><span>{r.chest}</span><span>{r.waist}</span><span>{r.height}</span>
                    </button>
                  ))}
                </div>
              ) : g?.measurements && Object.keys(g.measurements).length ? (
                <>
                  <div className="chart">
                    <div className="hd"><span>Size</span>{productCols.map((c) => <span key={c.k}>{c.l.replace(/ (width|length)$/, "")}</span>)}</div>
                    {g.sizes.map((z) => {
                      const m = g.measurements?.[z] ?? {};
                      return (
                        <button key={z} className={`pick ${z === size ? "sel" : ""}`} onClick={() => setSizePick(z)}>
                          <span>{z}</span>
                          {productCols.map((c) => <span key={c.k}>{cm(m[c.k], c.k.endsWith("W"))}</span>)}
                        </button>
                      );
                    })}
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>{g.name}, measured flat. Chest, waist, hip and thigh widths are doubled to circumferences so you can compare them with your body.</span>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>We don&rsquo;t have garment measurements for {g?.name ?? "this piece"} yet.</p>
              )}
              <div className="model-note">
                <div className="ph grayscale"><ImageSlot id="fit-model" round placeholder="model" editable={s.session.role === "admin"} /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Model wears M · True to size</span>
                  <span className="muted" style={{ fontSize: 13 }}>Height 188 cm · Chest 98 cm · Waist 82 cm</span>
                </div>
              </div>
              <button className="btn btn-primary row h52" style={{ marginTop: "auto" }} onClick={() => setFitTab("fit")}><span>Not sure? Try it on in 3D</span><span>→</span></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
