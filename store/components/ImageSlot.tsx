"use client";

import { useRef, useState, type DragEvent } from "react";
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
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Stand-in for the design's <image-slot>: fills its positioned parent, shows a
 * striped placeholder when empty, and — when editable — accepts a dropped or
 * browsed image file. Wrap in `.ph` (and `.grayscale` for product photography).
 */
export function ImageSlot({ id, placeholder = "", editable, fit = "cover", round, alt = "" }: Props) {
  const url = useImage(id);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const accept = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("That file isn't an image.");
    if (file.size > MAX_BYTES) return toast("Images must be under 8 MB.");
    await putImage(id, file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void accept(e.dataTransfer.files?.[0]);
  };

  const cls = ["slot", fit === "contain" && "contain", round && "round", editable && "edit", drag && "drag"].filter(Boolean).join(" ");

  if (!editable) {
    return (
      <span className={cls}>
        {url ? <img src={url} alt={alt} draggable={false} /> : placeholder ? <span className="slot-empty">{placeholder}</span> : null}
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
      {url ? <img src={url} alt={alt} draggable={false} /> : <span className="slot-empty">{placeholder || "Drop image"}</span>}
      {url && (
        <span className="slot-tools" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => input.current?.click()}>Replace</button>
          <button type="button" onClick={() => void removeImage(id)}>Remove</button>
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
