// Local-only: writes this browser's store (catalogue, pages, photos, 3D files) into
// the project, as lib/snapshot.json + public/snapshot/*, so the deployed site ships
// with it for every visitor. Used by /snapshot while `npm run dev` runs; answers 404
// on a deployed site.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";

const DIR = path.join(process.cwd(), "public", "snapshot");
const JSON_FILE = path.join(process.cwd(), "lib", "snapshot.json");
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "model/gltf-binary": "glb",
};

const notFound = () => new Response("Not found", { status: 404 });

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return notFound();
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(req.url).hostname)) return notFound();
  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");

  if (kind === "begin") {
    fs.rmSync(DIR, { recursive: true, force: true });
    fs.mkdirSync(DIR, { recursive: true });
    return Response.json({ ok: true });
  }

  if (kind === "image") {
    const slot = String(form!.get("slot") ?? "");
    const file = form!.get("file");
    if (!/^[\w-]{1,160}$/.test(slot) || !(file instanceof Blob)) return Response.json({ error: "Bad image." }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = EXT[file.type] ?? (buf.subarray(0, 4).toString("latin1") === "glTF" ? "glb" : "png");
    const name = `${slot}-${crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8)}.${ext}`;
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, name), buf);
    return Response.json({ path: `/snapshot/${name}`, bytes: buf.length });
  }

  if (kind === "state") {
    let data: { content?: unknown; images?: Record<string, string> };
    try {
      data = JSON.parse(String(form!.get("json") ?? ""));
    } catch {
      return Response.json({ error: "Bad data." }, { status: 400 });
    }
    if (!data.content || typeof data.content !== "object") return Response.json({ error: "No store data." }, { status: 400 });
    const now = new Date().toISOString();
    fs.writeFileSync(JSON_FILE, JSON.stringify({ version: now, exportedAt: now, content: data.content, images: data.images ?? {} }, null, 1) + "\n");
    return Response.json({ ok: true, version: now });
  }

  return Response.json({ error: "Unknown step." }, { status: 400 });
}
