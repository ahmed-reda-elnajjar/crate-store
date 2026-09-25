// Server-only: photorealistic virtual try-on behind one small interface, so the
// service can be swapped without touching the UI. Chosen with TRYON_PROVIDER;
// keys come from the environment and never reach the browser.
//
//   TRYON_PROVIDER=fashn      FASHN_API_KEY=...      https://docs.fashn.ai/api-reference/tryon-v1-6
//   TRYON_PROVIDER=replicate  REPLICATE_API_TOKEN=... (IDM-VTON, cuuupid/idm-vton)
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
  category: GarmentCategory;
  description?: string;
}

export interface TryOnProvider {
  name: string;
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
  if (which === "mock") return mock;
  return null;
}

export { ProviderError };
