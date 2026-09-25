// Server-only: photorealistic virtual try-on behind one small interface, so the
// service can be swapped without touching the UI. Chosen with TRYON_PROVIDER;
// keys come from the environment and never reach the browser.
//
//   TRYON_PROVIDER=fashn      FASHN_API_KEY=...      https://docs.fashn.ai/api-reference/tryon-v1-6
//   TRYON_PROVIDER=replicate  REPLICATE_API_TOKEN=... (IDM-VTON, cuuupid/idm-vton)
//   TRYON_PROVIDER=meta       MODEL_API_KEY=...      Meta Model API, Muse Image (https://dev.meta.ai/docs/image-generation)
//   TRYON_PROVIDER=mock       no key; returns the person photo unchanged (UI testing only)
//
// Request/response shapes follow each service's public API docs as of Sept 2026;
// check them again if a call starts failing.

import "server-only";

export type GarmentCategory = "tops" | "bottoms";

export interface TryOnStep {
  /** The person: a data: URL or an https URL (e.g. the previous step's result). */
  person: string;
  /** The garment photo: a data: URL or an https URL. */
  garment: string;
  /** More photos of the same piece (back, detail); only some providers use them. */
  extra?: string[];
  category: GarmentCategory;
  description?: string;
}

export interface TryOnProvider {
  name: string;
  /** Optional: dress the person in every garment in one call (used instead of `run` when present). */
  runAll?(person: string, steps: Omit<TryOnStep, "person">[]): Promise<string>;
  /** Returns an https URL or a data: URL of the person wearing the garment. */
  run(step: TryOnStep): Promise<string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ProviderError extends Error {}

function fashn(key: string): TryOnProvider {
  const base = "https://api.fashn.ai/v1";
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    name: "fashn",
    async run({ person, garment, category }) {
      const res = await fetch(`${base}/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model_name: "tryon-v1.6",
          inputs: { model_image: person, garment_image: garment, category },
        }),
      });
      const started = await res.json().catch(() => ({}));
      if (!res.ok || !started.id) throw new ProviderError(started.error?.message ?? started.error ?? `FASHN refused the request (${res.status}).`);
      for (let i = 0; i < 60; i++) {
        await sleep(1500);
        const st = await (await fetch(`${base}/status/${started.id}`, { headers })).json().catch(() => ({}));
        if (st.status === "completed" && st.output?.[0]) return st.output[0] as string;
        if (st.status === "failed" || st.status === "canceled") throw new ProviderError(st.error?.message ?? st.error ?? "The try-on failed.");
      }
      throw new ProviderError("The try-on took too long. Try again.");
    },
  };
}

function replicate(token: string): TryOnProvider {
  // cuuupid/idm-vton, pinned version (see replicate.com/cuuupid/idm-vton/versions).
  const version = "3b032a70c29aef7b9c3222f2e40b71660201d8c288336475ba326f3ca278a3e1";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=60" };
  return {
    name: "replicate",
    async run({ person, garment, category, description }) {
      const res = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          version,
          input: {
            human_img: person,
            garm_img: garment,
            category: category === "bottoms" ? "lower_body" : "upper_body",
            garment_des: description ?? "",
            crop: false,
            steps: 30,
          },
        }),
      });
      let p = await res.json().catch(() => ({}));
      if (!res.ok || !p.id) throw new ProviderError(p.detail ?? `Replicate refused the request (${res.status}).`);
      for (let i = 0; i < 60 && p.status !== "succeeded"; i++) {
        if (p.status === "failed" || p.status === "canceled") throw new ProviderError(p.error ?? "The try-on failed.");
        await sleep(2000);
        p = await (await fetch(`https://api.replicate.com/v1/predictions/${p.id}`, { headers })).json();
      }
      const out = Array.isArray(p.output) ? p.output[0] : p.output;
      if (p.status !== "succeeded" || !out) throw new ProviderError("The try-on took too long. Try again.");
      return out as string;
    },
  };
}

/**
 * Meta's Muse Image (muse-image-1.0): a general image editor, not a dedicated try-on model,
 * so the outfit is described in the prompt and the person + product photos go in together.
 * POST https://api.meta.ai/v1/images/edits  { model, prompt, images: [{ image_url }], ... }
 */
function meta(key: string): TryOnProvider {
  const format = "jpeg";
  const size = process.env.META_IMAGE_SIZE; // optional "WxH", e.g. 768x1024; unset keeps the model's default
  return {
    name: "meta",
    async run(step) {
      return this.runAll!(step.person, [step]);
    },
    async runAll(person, steps) {
      let n = 2;
      const list = steps
        .map((s) => {
          const at = [s.garment, ...(s.extra ?? [])].map(() => n++);
          return `${s.description || "a garment"} (${s.category === "bottoms" ? "worn on the legs" : "worn on the upper body"}): ${at.length > 1 ? "images" : "image"} ${at.join(", ")}`;
        })
        .join("; ");
      const prompt =
        `Image 1 is a full-body photo of a real person. The other images are product photos of the clothing to put on them: ${list}. ` +
        `A product photo may show the garment flat, on a mannequin or worn by another person; copy only the garment and ignore that person, their pose and the background. ` +
        `Several images of the same piece show it from different sides or in detail, so use them all. ` +
        `Edit image 1 so that the same person is wearing exactly those garments, replacing whatever they wear on those parts of the body. ` +
        `Copy each garment exactly as it appears in its photos: the same colour, fabric texture, prints, graphics, logos and text (same placement and size), neckline, sleeves, hem length and fit. ` +
        `STRICT RULES: use only what is visible in the product photos and in the written details. Never add a zipper, zip placket, buttons, collar, hood, pocket, stripe, patch, drawstring or any other detail that is not in the photos, and never remove one that is. ` +
        `If a piece is a plain round-neck T-shirt with no zipper, the result must have a round neck and no zipper or collar. If the written details say "no zip", "no collar" or similar, obey them exactly. ` +
        `Do not redesign, restyle, recolour, simplify or substitute any garment, and do not turn it into a different type of garment. ` +
        `Keep the person's face, hair, skin tone, body shape, pose, the background and the lighting unchanged. Photorealistic result, no added text or watermark.`;
      const res = await fetch("https://api.meta.ai/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "muse-image-1.0",
          prompt,
          images: [person, ...steps.flatMap((s) => [s.garment, ...(s.extra ?? [])])].map((image_url) => ({ image_url })),
          n: 1,
          output_format: format,
          response_format: "b64_json",
          ...(size ? { size } : {}),
        }),
      });
      const out = await res.json().catch(() => ({}));
      const b64 = out?.data?.[0]?.b64_json as string | undefined;
      if (!res.ok || !b64) throw new ProviderError(out?.error?.message ?? (typeof out?.error === "string" ? out.error : `Meta refused the request (${res.status}).`));
      return `data:image/${out.output_format ?? format};base64,${b64}`;
    },
  };
}

const mock: TryOnProvider = {
  name: "mock",
  async run({ person }) {
    await sleep(1200);
    return person;
  },
};

export function getProvider(): TryOnProvider | null {
  const which = (process.env.TRYON_PROVIDER ?? "").toLowerCase();
  if (which === "fashn" && process.env.FASHN_API_KEY) return fashn(process.env.FASHN_API_KEY);
  if (which === "replicate" && process.env.REPLICATE_API_TOKEN) return replicate(process.env.REPLICATE_API_TOKEN);
  if (which === "meta" && (process.env.MODEL_API_KEY || process.env.META_API_KEY)) return meta((process.env.MODEL_API_KEY || process.env.META_API_KEY)!);
  if (which === "mock") return mock;
  return null;
}

export { ProviderError };
