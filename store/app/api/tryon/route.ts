import { NextResponse } from "next/server";
import { getProvider, ProviderError, type GarmentCategory } from "@/lib/tryon/provider";

// Photorealistic try-on. The browser sends the person photo and 1–3 garment
// photos (as data: URLs, already downscaled); garments are applied one after
// another (bottoms, then tops, then outerwear) so a whole outfit can be worn.
// Nothing is stored here: photos only pass through to the try-on service.

export const runtime = "nodejs";
export const maxDuration = 120;

const DAILY_LIMIT = Number(process.env.TRYON_DAILY_LIMIT ?? 20);
const MAX_URL_BYTES = 4_000_000; // keeps the whole request under hosting limits
const MAX_ITEMS = 3;

// Per-client daily counter. In-memory: resets on restart and is per server
// instance, which is fine for a demo; use a database or KV store in production.
const usage = new Map<string, { day: string; n: number }>();
const today = () => new Date().toISOString().slice(0, 10);
function remaining(client: string) {
  const u = usage.get(client);
  return DAILY_LIMIT - (u && u.day === today() ? u.n : 0);
}
function count(client: string) {
  const u = usage.get(client);
  usage.set(client, { day: today(), n: (u && u.day === today() ? u.n : 0) + 1 });
}
const clientOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export async function GET(req: Request) {
  const p = getProvider();
  return NextResponse.json({ configured: !!p, provider: p?.name ?? null, remaining: remaining(clientOf(req)), dailyLimit: DAILY_LIMIT });
}

interface Item { garment: string; category: GarmentCategory; layer: number; description?: string }

const isImageRef = (s: unknown): s is string =>
  typeof s === "string" && s.length < MAX_URL_BYTES && (/^data:image\/(png|jpe?g|webp);base64,/.test(s) || /^https:\/\//.test(s));

export async function POST(req: Request) {
  const provider = getProvider();
  if (!provider) return NextResponse.json({ error: "The try-on service isn't set up yet. Add TRYON_PROVIDER and its API key to .env.local." }, { status: 501 });

  const client = clientOf(req);
  if (remaining(client) <= 0) return NextResponse.json({ error: `Daily limit reached (${DAILY_LIMIT} looks). Try again tomorrow.`, remaining: 0 }, { status: 429 });

  let body: { person?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const items = (Array.isArray(body.items) ? body.items : []) as Item[];
  if (!isImageRef(body.person)) return NextResponse.json({ error: "Add a photo of the person first." }, { status: 400 });
  if (items.length < 1 || items.length > MAX_ITEMS || !items.every((i) => isImageRef(i.garment) && (i.category === "tops" || i.category === "bottoms")))
    return NextResponse.json({ error: `Pick 1 to ${MAX_ITEMS} pieces with photos.` }, { status: 400 });

  count(client);
  try {
    let person = body.person;
    for (const it of [...items].sort((a, b) => a.layer - b.layer)) {
      person = await provider.run({ person, garment: it.garment, category: it.category, description: it.description });
    }
    // Return the image itself, so the browser can keep it without cross-origin fetches.
    let image = person;
    if (/^https:\/\//.test(person)) {
      const r = await fetch(person);
      if (!r.ok) throw new ProviderError("Couldn't download the result.");
      const type = r.headers.get("content-type") ?? "image/jpeg";
      image = `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    }
    return NextResponse.json({ image, provider: provider.name, remaining: remaining(client) });
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : "The try-on service didn't respond. Try again in a minute.";
    return NextResponse.json({ error: msg, remaining: remaining(client) }, { status: 502 });
  }
}
