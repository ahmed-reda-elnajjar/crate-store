"use client";

// Photo storage for the mock backend. Images are kept as Blobs in IndexedDB
// (localStorage is far too small for photos) and keyed by slot id, the same
// ids the design's <image-slot> elements used (e.g. "hero", "p-<id>-0",
// "wear-model"). Swap this module for uploads to object storage later.

import { useEffect, useState } from "react";
import SNAPSHOT from "./snapshot.json";

// Photos the owner copied into the site with /snapshot (public/snapshot/*): every
// browser shows them until it uploads its own for that slot or removes it.
const SHIPPED: Record<string, string> = (SNAPSHOT as { images?: Record<string, string> }).images ?? {};
const REMOVED = "crate-images-removed";
function removed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(REMOVED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markRemoved(id: string, on: boolean) {
  if (!SHIPPED[id]) return;
  const set = removed();
  if (on) set.add(id);
  else set.delete(id);
  try {
    localStorage.setItem(REMOVED, JSON.stringify([...set]));
  } catch {
    // storage blocked
  }
}
const shipped = (id: string) => (SHIPPED[id] && !removed().has(id) ? SHIPPED[id] : null);

const DB = "crate-images";
const STORE = "slots";

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const urls = new Map<string, string | null>();
const listeners = new Map<string, Set<() => void>>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DB) : null;

function emit(id: string) {
  listeners.get(id)?.forEach((l) => l());
}

async function refresh(id: string) {
  const blob = await tx<Blob | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
  const old = urls.get(id);
  if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
  urls.set(id, blob ? URL.createObjectURL(blob) : shipped(id));
  emit(id);
}

channel?.addEventListener("message", (e) => {
  if (typeof e.data === "string" && listeners.has(e.data)) void refresh(e.data);
});

export async function putImage(id: string, file: Blob) {
  await tx("readwrite", (s) => s.put(file, id));
  markRemoved(id, false);
  await refresh(id);
  channel?.postMessage(id);
}

export async function getImageBlob(id: string): Promise<Blob | undefined> {
  const own = await tx<Blob | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
  if (own) return own;
  const url = shipped(id);
  if (!url) return undefined;
  const r = await fetch(url);
  return r.ok ? r.blob() : undefined;
}

export async function removeImage(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  markRemoved(id, true);
  await refresh(id);
  channel?.postMessage(id);
}

/** Object URL for the image stored under `id`, or null when the slot is empty. */
export function useImage(id: string): string | null {
  const [url, setUrl] = useState<string | null>(() => urls.get(id) ?? null);
  useEffect(() => {
    const update = () => setUrl(urls.get(id) ?? null);
    let set = listeners.get(id);
    if (!set) listeners.set(id, (set = new Set()));
    set.add(update);
    if (urls.has(id)) update();
    else void refresh(id);
    return () => {
      set!.delete(update);
    };
  }, [id]);
  return url;
}

/** Object URLs for several slots at once (slot id → URL, only filled slots). */
export function useImages(ids: string[]): Record<string, string> {
  const key = ids.join("|");
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const list = key ? key.split("|") : [];
    const update = () => {
      const next: Record<string, string> = {};
      for (const id of list) {
        const u = urls.get(id);
        if (u) next[id] = u;
      }
      setMap(next);
    };
    for (const id of list) {
      let set = listeners.get(id);
      if (!set) listeners.set(id, (set = new Set()));
      set.add(update);
      if (!urls.has(id)) void refresh(id);
    }
    update();
    return () => {
      for (const id of list) listeners.get(id)?.delete(update);
    };
  }, [key]);
  return map;
}
