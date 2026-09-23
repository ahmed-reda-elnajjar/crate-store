"use client";

// Turns a product shot on a plain background (white, grey, cream) into a
// transparent PNG trimmed to the garment, so every garment in the wear
// carousel shares the same framing: collar at the top edge, sleeves at the
// sides. Runs in the browser on upload; no server or AI service involved.
//
// Method: estimate the background colour from the image border, flood-fill
// from every border pixel through pixels close to that colour, make them
// transparent, soften the one-pixel edge, then crop to what is left.
// Garment pixels that match the background but are enclosed by the garment
// (e.g. a white logo) are kept, because the fill only spreads from the edge.

const MAX_SIDE = 1400;
/** Colour distance (0–441) under which a pixel counts as background. */
const TOLERANCE = 38;
/** Pixels on the garment's edge within this distance are made semi-transparent. */
const SOFT = 70;

function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function cutoutGarment(file: Blob, opts: { trim?: boolean } = {}): Promise<Blob> {
  const trim = opts.trim ?? true;
  const src = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Already a cut-out? (transparent border) → only trim.
  let transparentBorder = 0;
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  for (const i of border) if (px[i * 4 + 3] < 20) transparentBorder++;

  if (transparentBorder < border.length * 0.5) {
    // Background colour = per-channel median of the border.
    const ch = [0, 1, 2].map((c) => border.map((i) => px[i * 4 + c]).sort((a, b) => a - b)[border.length >> 1]);
    const dist = (i: number) => Math.hypot(px[i * 4] - ch[0], px[i * 4 + 1] - ch[1], px[i * 4 + 2] - ch[2]);

    const bg = new Uint8Array(w * h);
    const stack: number[] = [];
    for (const i of border) if (!bg[i] && dist(i) < TOLERANCE) (bg[i] = 1), stack.push(i);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const n of next) if (n >= 0 && !bg[n] && dist(n) < TOLERANCE) (bg[n] = 1), stack.push(n);
    }

    // Enclosed background-coloured holes (the neck opening inside a collar) are
    // background too; small ones (a white logo, a zip pull) stay part of the garment.
    const minHole = w * h * 0.002;
    const seen = new Uint8Array(w * h);
    for (let start = 0; start < w * h; start++) {
      if (bg[start] || seen[start] || dist(start) >= TOLERANCE) continue;
      const region = [start];
      seen[start] = 1;
      for (let k = 0; k < region.length; k++) {
        const i = region[k];
        const x = i % w;
        const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
        for (const n of next) if (n >= 0 && !bg[n] && !seen[n] && dist(n) < TOLERANCE) (seen[n] = 1), region.push(n);
      }
      if (region.length > minHole) for (const i of region) bg[i] = 1;
    }

    for (let i = 0; i < w * h; i++) {
      if (bg[i]) {
        px[i * 4 + 3] = 0;
        continue;
      }
      // Anti-alias the rim: garment pixels touching the background fade by closeness to it.
      const x = i % w;
      const touches = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < w * (h - 1) && bg[i + w]);
      if (touches) {
        const d = dist(i);
        if (d < SOFT) px[i * 4 + 3] = Math.round((px[i * 4 + 3] * (d - TOLERANCE * 0.5)) / (SOFT - TOLERANCE * 0.5));
      }
    }
  }

  if (!trim) {
    // Keep the full canvas so the garment stays registered to the model photo.
    ctx.putImageData(img, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/png"));
  }

  // Trim to the opaque bounding box.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return file; // nothing left: the photo was not on a plain background
  ctx.putImageData(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob((b) => resolve(b ?? file), "image/png"));
}
