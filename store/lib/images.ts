"use client";

// Photo storage for the mock backend. Images are kept as Blobs in IndexedDB
// (localStorage is far too small for photos) and keyed by slot id, the same
// ids the design's <image-slot> elements used (e.g. "hero", "p-<id>-0",
// "wear-model"). Swap this module for uploads to object storage later.

import { useEffect, useState } from "react";

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
  if (old) URL.revokeObjectURL(old);
  urls.set(id, blob ? URL.createObjectURL(blob) : null);
  emit(id);
}

channel?.addEventListener("message", (e) => {
  if (typeof e.data === "string" && listeners.has(e.data)) void refresh(e.data);
});

export async function putImage(id: string, file: Blob) {
  await tx("readwrite", (s) => s.put(file, id));
  await refresh(id);
  channel?.postMessage(id);
}

export function getImageBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>("readonly", (s) => s.get(id));
}

export async function removeImage(id: string) {
  await tx("readwrite", (s) => s.delete(id));
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
