// Unit tests for the fit engine. Run with `npm test` (Node's built-in runner;
// Node 22.18+ strips the TypeScript types itself, so nothing extra is installed).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEED_PRODUCTS, type Product } from "./data.ts";
import { barOf, estimateBody, fitSize, levelOf, recommend, resolveBody } from "./fit.ts";

const product = (id: string) => SEED_PRODUCTS.find((p) => p.id === id)!;
const avg = estimateBody(178, 74);

describe("estimateBody", () => {
  it("matches the size chart for an average build", () => {
    assert.deepEqual(avg, { h: 178, w: 74, chest: 98, waist: 84, hips: 97, shoulder: 45, arm: 63, inseam: 80 });
  });

  it("grows with weight at the same height", () => {
    const heavy = estimateBody(178, 95);
    assert.ok(heavy.chest > avg.chest && heavy.waist > avg.waist && heavy.hips > avg.hips);
    assert.equal(heavy.inseam, avg.inseam);
  });

  it("scales lengths with height", () => {
    const tall = estimateBody(195, 85);
    assert.ok(tall.arm > avg.arm && tall.inseam > avg.inseam);
  });

  it("stays inside the field ranges for extreme inputs", () => {
    const b = estimateBody(150, 130);
    assert.ok(b.chest <= 160 && b.waist <= 160 && b.hips <= 170);
  });
});

describe("resolveBody", () => {
  it("uses overrides and estimates the rest", () => {
    const b = resolveBody({ h: 178, w: 74, chest: 104 });
    assert.equal(b.chest, 104);
    assert.equal(b.waist, avg.waist);
  });

  it("ignores empty or invalid overrides", () => {
    assert.deepEqual(resolveBody({ h: 178, w: 74, chest: 0, waist: Number.NaN }), avg);
  });
});

describe("levelOf", () => {
  it("maps delta in steps of the tolerance", () => {
    assert.equal(levelOf(0, 4), 0);
    assert.equal(levelOf(2, 4), 0);
    assert.equal(levelOf(-3, 4), -1);
    assert.equal(levelOf(5, 4), 1);
    assert.equal(levelOf(-7, 4), -2);
    assert.equal(levelOf(9, 4), 2);
  });

  it("is too tight whenever the garment is below its floor", () => {
    assert.equal(levelOf(0, 4, -1, 0), -2);
  });

  it("lights one bar segment, red at the extremes", () => {
    const bar = barOf(-2);
    assert.equal(bar[0], "var(--color-accent)");
    assert.equal(bar.filter((c) => c !== "var(--color-neutral-200)").length, 1);
    assert.equal(barOf(0)[2], "var(--color-text)");
  });
});

describe("fitSize", () => {
  it("reports chest ease as garment circumference minus body", () => {
    const f = fitSize(product("boxy-heavy-tee"), avg, "M")!;
    const chest = f.zones.find((z) => z.k === "Chest")!;
    assert.equal(chest.diff, 60 * 2 - 98);
    assert.equal(chest.note, "+22 cm ease");
    assert.equal(chest.label, "Right");
  });

  it("skips short sleeves and shorts' inseam", () => {
    assert.ok(!fitSize(product("boxy-heavy-tee"), avg, "M")!.zones.some((z) => z.k === "Sleeves"));
    assert.ok(!fitSize(product("ripstop-cargo-short"), avg, "32")!.zones.some((z) => z.k === "Leg length"));
  });

  it("uses bottom zones for trousers", () => {
    const f = fitSize(product("double-knee-carpenter"), avg, "32")!;
    assert.deepEqual(f.zones.map((z) => z.k), ["Waist", "Hips", "Thigh", "Leg length", "Rise"]);
  });

  it("calls a garment smaller than the body too tight", () => {
    const f = fitSize(product("double-knee-carpenter"), avg, "28")!;
    assert.equal(f.zones.find((z) => z.k === "Waist")!.label, "Too tight");
    assert.equal(f.verdict, "Too tight");
    assert.ok(f.verdictAccent);
  });

  it("is undefined for sizes without measurements", () => {
    assert.equal(fitSize(product("5-panel-cap"), avg, "One size"), undefined);
  });

  it("aims for more ease in an oversized cut than a slim one", () => {
    const base = product("nylon-track-jacket");
    const slim: Product = { ...base, fitStyle: "slim" };
    const chestOf = (p: Product) => fitSize(p, avg, "M")!.zones.find((z) => z.k === "Chest")!.level;
    assert.ok(chestOf(slim) > chestOf(base));
  });
});

describe("recommend", () => {
  it("picks M tops and a 32 waist for an average build", () => {
    for (const id of ["boxy-heavy-tee", "nylon-track-jacket", "480gsm-hoodie", "racing-crew"]) {
      assert.equal(recommend(product(id), avg).rec, "M", id);
    }
    assert.equal(recommend(product("double-knee-carpenter"), avg).rec, "32");
  });

  it("sizes up for a bigger build and down for a smaller one", () => {
    assert.equal(recommend(product("nylon-track-jacket"), estimateBody(188, 95)).rec, "XL");
    assert.equal(recommend(product("nylon-track-jacket"), estimateBody(170, 60)).rec, "S");
    assert.equal(recommend(product("double-knee-carpenter"), estimateBody(185, 95)).rec, "36");
  });

  it("follows an overridden measurement", () => {
    const b = resolveBody({ h: 178, w: 74, chest: 108 });
    assert.equal(recommend(product("boxy-heavy-tee"), b).rec, "L");
  });

  it("only considers sizes the product is cut in", () => {
    const r = recommend(product("fleece-quarter-zip"), estimateBody(165, 55));
    assert.equal(r.rec, "M");
    assert.deepEqual(r.fits.map((f) => f.size), ["M", "L", "XL"]);
  });

  it("explains the choice and names a neighbour", () => {
    const r = recommend(product("nylon-track-jacket"), avg);
    assert.match(r.why, /^M fits best: /);
    assert.match(r.why, /(S|L) would be /);
  });

  it("has no recommendation without measurements", () => {
    const r = recommend(product("5-panel-cap"), avg);
    assert.equal(r.rec, undefined);
    assert.match(r.why, /don't have measurements/);
  });
});

describe("explain", () => {
  it("names a tight zone before a loose one", () => {
    const r = recommend(product("nylon-track-jacket"), resolveBody({ h: 178, w: 74, chest: 110 }));
    assert.match(r.why, /Chest reads snug/);
  });
});
