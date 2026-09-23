"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { putImage, removeImage, useImage } from "@/lib/images";
import { toast } from "@/lib/store";

interface Props {
  id: string;
  placeholder?: string;
  /** Shows drop / browse / remove controls. Admin-only for catalogue photos. */
  editable?: boolean;
  fit?: "cover" | "contain";
  round?: boolean;
  alt?: string;
  /** Pin the image to the top edge instead of centring it (garments: collar at the top). */
  anchorTop?: boolean;
  /** Built-in image shown until someone uploads one to this slot. */
  src?: string;
  /** Reports the loaded image's height / width, so a parent can size its box to it. */
  onAspect?: (ratio: number) => void;
  /** Transform an uploaded file before it is stored (e.g. background removal). */
  process?: (file: File) => Promise<Blob>;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Stand-in for the design's <image-slot>: fills its positioned parent, shows a
 * striped placeholder when empty, and — when editable — accepts a dropped or
 * browsed image file. Wrap in `.ph` (and `.grayscale` for product photography).
 */
export function ImageSlot({ id, placeholder = "", editable, fit = "cover", round, alt = "", anchorTop, process, onAspect, src }: Props) {
  const uploaded = useImage(id);
  const url = uploaded ?? src ?? null;
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("That file isn't an image.");
    if (file.size > MAX_BYTES) return toast("Images must be under 8 MB.");
    if (!process) return putImage(id, file);
    setBusy(true);
    try {
      await putImage(id, await process(file));
    } catch {
      await putImage(id, file);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void accept(e.dataTransfer.files?.[0]);
  };

  const imgRef = useRef<HTMLImageElement>(null);
  const report = (i: HTMLImageElement | null) => {
    if (onAspect && i?.naturalWidth) onAspect(i.naturalHeight / i.naturalWidth);
  };
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => report(e.currentTarget);
  // A cached image can finish loading before hydration attaches onLoad; read it directly too.
  useEffect(() => {
    if (imgRef.current?.complete) report(imgRef.current);
  });

  const cls = ["slot", fit === "contain" && "contain", anchorTop && "top", round && "round", editable && "edit", drag && "drag"].filter(Boolean).join(" ");

  if (!editable) {
    return (
      <span className={cls}>
        {url ? <img ref={imgRef} src={url} alt={alt} draggable={false} onLoad={onLoad} /> : placeholder ? <span className="slot-empty">{placeholder}</span> : null}
      </span>
    );
  }

  return (
    <span
      className={cls}
      role="button"
      tabIndex={0}
      aria-label={url ? `Replace image: ${placeholder || id}` : `Add image: ${placeholder || id}`}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      {busy ? <span className="slot-empty">Removing background…</span> : url ? <img ref={imgRef} src={url} alt={alt} draggable={false} onLoad={onLoad} /> : <span className="slot-empty">{placeholder || "Drop image"}</span>}
      {url && (
        <span className="slot-tools" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => input.current?.click()}>Replace</button>
          {uploaded && <button type="button" onClick={() => void removeImage(id)}>{src ? "Reset" : "Remove"}</button>}
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </span>
  );
}

/** Slot id for a product photo; index 0 is the card / cover image. */
export const productImg = (productId: string, i = 0) => `p-${productId}-${i}`;
