// Builds the shipped garment files (public/models/garments/*.glb) by wrapping the
// avatar file (public/models/avatar/avatar.glb): each garment is the body surface
// cut to the garment's outline, loosened, and saved in the avatar's own coordinates,
// as the fit room expects ("modelled on the avatar, same pose, size M / 32").
// Run: node tools/make-garments.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public", "models");

// ---------- read the avatar (positions in cm, y up, feet on y=0) ----------
const buf = fs.readFileSync(path.join(pub, "avatar", "avatar.glb"));
const jl = buf.readUInt32LE(12);
const gj = JSON.parse(buf.subarray(20, 20 + jl).toString());
const bin0 = 20 + jl + 8;
const prim = gj.meshes[0].primitives[0];
function readAcc(i, comps, T) {
  const a = gj.accessors[i], bv = gj.bufferViews[a.bufferView];
  const stride = bv.byteStride || comps * T.BYTES_PER_ELEMENT;
  const out = new Float64Array(a.count * comps);
  const dv = new DataView(buf.buffer, buf.byteOffset + bin0 + (bv.byteOffset || 0) + (a.byteOffset || 0));
  const get = { 5126: "getFloat32", 5125: "getUint32", 5123: "getUint16", 5121: "getUint8" }[a.componentType];
  const sz = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) out[k * comps + c] = dv[get](k * stride + c * sz, true);
  return out;
}
const P0 = readAcc(prim.attributes.POSITION, 3, Float32Array);
const I0 = readAcc(prim.indices, 1, Uint32Array);
const J0 = readAcc(prim.attributes.JOINTS_0, 4, Uint16Array);
const W0 = readAcc(prim.attributes.WEIGHTS_0, 4, Float32Array);
const IBM = readAcc(gj.skins[0].inverseBindMatrices, 16, Float32Array);
const first = [];

// weld duplicate vertices (texture seams) so normals and smoothing are continuous
const map = new Map(), wid = new Int32Array(P0.length / 3), W = [];
for (let i = 0; i < P0.length / 3; i++) {
  const k = `${Math.round(P0[i * 3] * 500)},${Math.round(P0[i * 3 + 1] * 500)},${Math.round(P0[i * 3 + 2] * 500)}`;
  let w = map.get(k);
  if (w === undefined) { w = W.length / 3; map.set(k, w); first.push(i); W.push(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]); }
  wid[i] = w;
}
const N = W.length / 3;
const TRI = [];
for (let t = 0; t < I0.length; t += 3) {
  const a = wid[I0[t]], b = wid[I0[t + 1]], c = wid[I0[t + 2]];
  if (a !== b && b !== c && a !== c) TRI.push(a, b, c);
}

function normals(P, tris) {
  const n = new Float64Array(P.length);
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { n[i] += nx; n[i + 1] += ny; n[i + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
const NB = normals(W, TRI);

// ---------- body measurements per height (cm) ----------
const X = (i) => W[i * 3], Y = (i) => W[i * 3 + 1], Z = (i) => W[i * 3 + 2];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const torso = {}; // y -> {hx, zc, hz}
for (let y = 60; y <= 150; y++) {
  let hx = 0, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) if (Math.abs(Y(i) - y) <= 1.2 && Math.abs(X(i)) < 24) {
    hx = Math.max(hx, Math.abs(X(i))); z0 = Math.min(z0, Z(i)); z1 = Math.max(z1, Z(i));
  }
  torso[y] = { hx: hx || 17, zc: (z0 + z1) / 2 || 0, hz: (z1 - z0) / 2 || 10 };
}
const leg = { 1: {}, "-1": {} }; // side -> y -> centre
for (const s of [1, -1]) for (let y = 0; y <= 82; y++) {
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < N; i++) if (Math.abs(Y(i) - y) <= 1.2 && X(i) * s > 1) { sx += X(i); sz += Z(i); n++; }
  leg[s][y] = n ? { x: sx / n, z: sz / n } : leg[s][y - 1] || { x: s * 9, z: 0 };
}
const legAt = (s, y) => leg[s][clamp(Math.round(y), 0, 82)];
const T = (y) => torso[clamp(Math.round(y), 60, 150)];

// ---------- garments ----------
const GARMENTS = [
  {
    file: "boxy-heavy-tee.glb", name: "Boxy Heavy Tee", colour: "#d8d1bd",
    keep: (x, y, z) => y >= 93 && y <= 158 && Math.abs(x) <= 42 && (y <= 146 - (z > 1 ? 3 : 0) || (x / 10) ** 2 + ((z - 1) / 10.5) ** 2 > 1),
    snap: (p, edge) => { if (!edge) return p; if (p[1] < 97) p[1] = 93; if (Math.abs(p[0]) > 38) p[0] = Math.sign(p[0]) * 41; return p; },
    move(i) {
      let x = X(i), y = Y(i), z = Z(i);
      const ax = Math.abs(x);
      const chest = T(130), tgtX = chest.hx + 1.8, tgtZ = chest.hz + 0.8;
      const w = smooth(146, 134, y) * (1 - smooth(22, 28, ax));
      if (w > 0 && y <= 146) {
        const b = T(y);
        const sx = clamp(tgtX / b.hx, 1, 1.4), sz = clamp(tgtZ / b.hz, 1, 1.4);
        x *= 1 + (sx - 1) * w;
        z = b.zc + (z - b.zc) * (1 + (sz - 1) * w);
      }
      const off = 1.2 + 2.6 * smooth(18, 30, ax);
      return [x + NB[i * 3] * off, y + NB[i * 3 + 1] * off, z + NB[i * 3 + 2] * off];
    },
  },
  {
    file: "double-knee-carpenter.glb", name: "Double-Knee Carpenter", colour: "#1b1b1c",
    keep: (x, y, z) => y >= 9 && y <= 101,
    snap: (p, edge) => { if (!edge) return p; if (p[1] < 16) p[1] = 9; if (p[1] > 94) p[1] = 101; return p; },
    move(i) {
      let x = X(i), y = Y(i), z = Z(i);
      const s = x >= 0 ? 1 : -1;
      const t = smooth(90, 76, y);          // 1 in the legs, 0 in the hips
      // hips and seat: loose about the body's centre line
      const b = T(clamp(y, 90, 150)), yy = clamp(y, 60, 150), bb = torso[Math.round(yy)];
      const hip = [x * 1.1, y, bb.zc + (z - bb.zc) * 1.1];
      // legs: wide, straight, slightly narrower at the cuff
      const c = legAt(s, y), f = 1.34 - 0.14 * (1 - clamp(y / 76, 0, 1));
      const lg = [c.x + (x - c.x) * f, y, c.z + (z - c.z) * f];
      let px = hip[0] * (1 - t) + lg[0] * t, py = y, pz = hip[2] * (1 - t) + lg[2] * t;
      // legs never cross the centre line
      if (t > 0.05) px = s > 0 ? Math.max(px, 0.6) : Math.min(px, -0.6);
      const off = 0.9;
      return [px + NB[i * 3] * off, py + NB[i * 3 + 1] * off, pz + NB[i * 3 + 2] * off];
    },
  },
];

function build(g) {
  const idx = new Int32Array(N).fill(-1), P = [], keepV = new Uint8Array(N);
  for (let i = 0; i < N; i++) keepV[i] = g.keep(X(i), Y(i), Z(i)) ? 1 : 0;
  const tris = [];
  for (let t = 0; t < TRI.length; t += 3) if (keepV[TRI[t]] && keepV[TRI[t + 1]] && keepV[TRI[t + 2]]) tris.push(TRI[t], TRI[t + 1], TRI[t + 2]);
  const used = new Set(tris);
  const old = [];
  const J = [], Wt = [];
  for (const i of [...used].sort((a, b) => a - b)) {
    idx[i] = old.length; old.push(i); const p = g.move(i); P.push(p[0], p[1], p[2]);
    for (let c = 0; c < 4; c++) { J.push(J0[first[i] * 4 + c]); Wt.push(W0[first[i] * 4 + c]); }
  }
  const T2 = tris.map((v) => idx[v]);
  // smooth (Taubin), boundary vertices stay where they were cut
  const cnt = new Map();
  const edge = new Map();
  const nb = Array.from({ length: old.length }, () => new Set());
  for (let t = 0; t < T2.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = T2[t + e], b = T2[t + (e + 1) % 3];
    nb[a].add(b); nb[b].add(a);
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    edge.set(k, (edge.get(k) || 0) + 1);
  }
  const bnd = new Uint8Array(old.length);
  for (const [k, v] of edge) if (v === 1) { const [a, b] = k.split("_").map(Number); bnd[a] = bnd[b] = 1; }
  let A = Float64Array.from(P);
  for (let it = 0; it < 6; it++) {
    const lam = it % 2 ? -0.53 : 0.5, B = Float64Array.from(A);
    for (let v = 0; v < old.length; v++) {
      if (bnd[v] || !nb[v].size) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const u of nb[v]) { sx += A[u * 3]; sy += A[u * 3 + 1]; sz += A[u * 3 + 2]; }
      const n = nb[v].size;
      B[v * 3] += lam * (sx / n - A[v * 3]); B[v * 3 + 1] += lam * (sy / n - A[v * 3 + 1]); B[v * 3 + 2] += lam * (sz / n - A[v * 3 + 2]);
    }
    A = B;
  }
  // straighten the cut edges: snap to the cut plane, then even out along each edge loop
  const bn = Array.from({ length: old.length }, () => []);
  for (const [k, v] of edge) if (v === 1) { const [a, b] = k.split("_").map(Number); bn[a].push(b); bn[b].push(a); }
  const snapAll = () => { for (let v = 0; v < old.length; v++) if (bnd[v]) { const q = g.snap([A[v * 3], A[v * 3 + 1], A[v * 3 + 2]], true); A[v * 3] = q[0]; A[v * 3 + 1] = q[1]; A[v * 3 + 2] = q[2]; } };
  snapAll();
  for (let it = 0; it < 10; it++) {
    const B = Float64Array.from(A);
    for (let v = 0; v < old.length; v++) if (bnd[v] && bn[v].length === 2)
      for (let c = 0; c < 3; c++) B[v * 3 + c] = 0.5 * A[v * 3 + c] + 0.25 * (A[bn[v][0] * 3 + c] + A[bn[v][1] * 3 + c]);
    A = B; snapAll();
  }
  return { P: A, T: T2, J, Wt };
}

function toGLB(g, P, tris, J, Wt) {
  const pos = new Float32Array(P.length), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i++) { pos[i] = P[i]; lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
  const nrm = Float32Array.from(normals(pos, tris));
  const ind = Uint32Array.from(tris);
  const jnt = Uint16Array.from(J), wgt = Float32Array.from(Wt), ibm = Float32Array.from(IBM);
  const parts = [Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(jnt.buffer), Buffer.from(wgt.buffer), Buffer.from(ind.buffer), Buffer.from(ibm.buffer)];
  const bin = Buffer.concat(parts);
  const lin = (h) => { const v = parseInt(h, 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const c = g.colour.slice(1).match(/../g).map(lin);
  const json = {
    asset: { version: "2.0", generator: "tools/make-garments.mjs" },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: gj.nodes,
    skins: [{ ...gj.skins[0], inverseBindMatrices: 5 }],
    meshes: [{ name: g.name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 4, material: 0 }] }],
    materials: [{ name: "fabric", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0, roughnessFactor: 0.92 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: lo, max: hi },
      { bufferView: 1, componentType: 5126, count: nrm.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: jnt.length / 4, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: wgt.length / 4, type: "VEC4" },
      { bufferView: 4, componentType: 5125, count: ind.length, type: "SCALAR" },
      { bufferView: 5, componentType: 5126, count: ibm.length / 16, type: "MAT4" },
    ],
    bufferViews: parts.map((q, k) => ({ buffer: 0, byteOffset: parts.slice(0, k).reduce((n, x) => n + x.length, 0), byteLength: q.length, ...(k === 4 ? { target: 34963 } : k < 4 ? { target: 34962 } : {}) })),
    buffers: [{ byteLength: bin.length }],
  };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 32)]);
  const bp = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12); head.write("glTF"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bp.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length); h1.write("JSON", 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(bp.length); h2.write("BIN\0", 4);
  return Buffer.concat([head, h1, js, h2, bp]);
}

fs.mkdirSync(path.join(pub, "garments"), { recursive: true });
for (const g of GARMENTS) {
  const { P, T: tris, J, Wt } = build(g);
  const out = toGLB(g, P, tris, J, Wt);
  fs.writeFileSync(path.join(pub, "garments", g.file), out);
  console.log(g.file, (out.length / 1024).toFixed(0) + " KB", P.length / 3, "verts", tris.length / 3, "tris");
}
