"use client";

// Local-only tool: copies what THIS browser has (the catalogue and pages edited in
// admin, plus every photo and 3D file uploaded) into the project, so the deployed
// site shows exactly the same store to every visitor.

import { useState } from "react";

const STORAGE_KEY = "crate-store:v2";
const SHOP_SLOT = /^(hero$|fit-model$|wear-|p-|model-|tryon-model-)/;

function idb<T>(run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("crate-images", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("slots");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction("slots", "readonly").objectStore("slots"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

/** Is this slot the store's (not a shopper's own photo or saved look), and still in use? */
function keep(slot: string, productIds: Set<string>) {
  if (!SHOP_SLOT.test(slot)) return false;
  const photo = /^p-(.+)-\d+$/.exec(slot);
  if (photo) return productIds.has(photo[1]);
  const cutout = /^wear-g-(.+)$/.exec(slot);
  if (cutout) return productIds.has(cutout[1]);
  const model = /^model-(.+)$/.exec(slot);
  if (model && model[1] !== "avatar-v2") return productIds.has(model[1]);
  return true;
}

export default function Snapshot() {
  const [log, setLog] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const say = (line: string) => setLog((l) => [...l, line]);

  const post = async (fields: Record<string, string | Blob>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await fetch("/api/snapshot", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? (res.status === 404 ? "This only works on your own computer, with npm run dev." : `Failed (${res.status})`));
    return data;
  };

  const run = async () => {
    setState("busy");
    setLog([]);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("This browser has no saved store. Open this page in the browser where your site shows your photos.");
      const saved = JSON.parse(raw);
      const content = saved.draft ?? saved.published;
      if (!content?.products) throw new Error("Couldn't read the store data.");
      say(`Store data: ${content.products.length} products, ${content.sections?.length ?? 0} home sections.`);
      const productIds = new Set<string>(content.products.map((p: { id: string }) => p.id));
      const slots = ((await idb((s) => s.getAllKeys())) as IDBValidKey[]).map(String).filter((k) => keep(k, productIds));
      say(`Photos and 3D files to copy: ${slots.length}`);
      await post({ kind: "begin" });
      const images: Record<string, string> = {};
      let bytes = 0;
      for (const slot of slots) {
        const blob = (await idb((s) => s.get(slot))) as Blob | undefined;
        if (!blob) continue;
        const r = await post({ kind: "image", slot, file: blob });
        images[slot] = r.path;
        bytes += r.bytes;
        say(`✓ ${slot} (${(r.bytes / 1024).toFixed(0)} KB)`);
      }
      await post({ kind: "state", json: JSON.stringify({ content, images }) });
      say(`Done: ${Object.keys(images).length} files, ${(bytes / 1048576).toFixed(1)} MB. You can close this page.`);
      setState("done");
    } catch (e) {
      say(`✗ ${e instanceof Error ? e.message : String(e)}`);
      setState("error");
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Copy this browser&apos;s store into the site</h1>
      <p style={{ color: "#555", marginBottom: 20 }}>
        Takes the products, pages and every photo and 3D file you set up in admin in this browser, and saves them into the
        project so the published site shows the same store to everyone. Run it on your own computer (npm run dev), in the
        browser where you see your photos.
      </p>
      <button
        onClick={() => void run()}
        disabled={state === "busy"}
        style={{ padding: "12px 20px", fontSize: 16, background: "#111", color: "#fff", border: 0, cursor: "pointer" }}
      >
        {state === "busy" ? "Copying…" : state === "done" ? "Copy again" : "Copy my store"}
      </button>
      <pre style={{ marginTop: 20, whiteSpace: "pre-wrap", fontSize: 13, background: "#f4f4f4", padding: 12, minHeight: 80 }}>{log.join("\n")}</pre>
    </main>
  );
}
