// Your own 3D files in the fit room: an avatar (.glb) and one .glb per garment,
// modelled on that avatar in the same pose. Files either ship with the site
// (public/models, listed below and on each product's `model`) or are uploaded
// by an admin (kept in the browser like product photos, under the slot ids
// below). The avatar is scaled to the customer's height and build; a garment is
// scaled from the size it was modelled in to the size being tried on.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Measurements } from "./data";
import type { Body } from "./fit";

/** Avatar file that ships with the site, e.g. "/models/avatar.glb". Leave undefined for the built-in avatar. */
export const AVATAR_FILE: string | undefined = undefined;

export const AVATAR_SLOT = "model-avatar";
export const modelSlot = (productId: string) => `model-${productId}`;

/** The body the avatar file is assumed to be modelled for (the fit room's default body). */
const REF = { h: 178, chest: 98, waist: 84, hips: 97 };

const cache = new Map<string, Promise<GLTF>>();
export function loadGLB(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** A fresh copy of the file's scene (skinned meshes keep their own skeleton). */
function instance(g: GLTF): THREE.Object3D {
  const o = cloneSkinned(g.scene);
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      // Own the materials so recolouring one garment never touches another copy.
      m.material = Array.isArray(m.material) ? m.material.map((q) => q.clone()) : m.material.clone();
    }
  });
  return o;
}

export interface Fitted {
  root: THREE.Group;
  clips: { target: THREE.Object3D; clip: THREE.AnimationClip }[];
}

/**
 * Where the avatar file sits in the scene, in metres: feet on the floor, centred,
 * as tall as the customer and as broad as their chest, waist and hips allow.
 * Garments reuse the same transform so they stay where they were modelled.
 */
export function avatarTransform(g: GLTF, body: Body) {
  const box = new THREE.Box3().setFromObject(g.scene);
  const size = box.getSize(new THREE.Vector3());
  const sy = body.h / 100 / (size.y || 1);
  const build = (body.chest / REF.chest + body.waist / REF.waist + body.hips / REF.hips) / 3;
  const sxz = sy * Math.max(0.75, Math.min(1.45, build));
  const c = box.getCenter(new THREE.Vector3());
  return new THREE.Matrix4()
    .makeTranslation(0, 0, 0)
    .multiply(new THREE.Matrix4().makeScale(sxz, sy, sxz))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
}

/** Width and length ratios between the size tried on and the size the file was modelled in. */
export function sizeRatios(m: Measurements | undefined, base: Measurements | undefined, bottom: boolean) {
  const r = (k: keyof Measurements) => (m?.[k] && base?.[k] ? m[k]! / base[k]! : 1);
  return bottom ? { w: r("hipW") !== 1 ? r("hipW") : r("waistW"), l: r("inseam") } : { w: r("chestW"), l: r("length") };
}

function wrap(obj: THREE.Object3D, T: THREE.Matrix4) {
  const g = new THREE.Group();
  g.applyMatrix4(T);
  g.add(obj);
  return g;
}

export function fitAvatar(g: GLTF, T: THREE.Matrix4): Fitted {
  const obj = instance(g);
  const root = new THREE.Group();
  root.add(wrap(obj, T));
  return { root, clips: g.animations.length ? [{ target: obj, clip: g.animations[0] }] : [] };
}

/**
 * A garment file on the avatar: same transform, then scaled from its modelled size.
 * Width scales round the body's centre line; length hangs from the garment's top edge.
 * `colour` repaints untextured materials when another colourway is picked.
 */
export function fitGarment(g: GLTF, T: THREE.Matrix4, ratio: { w: number; l: number }, colour?: string): Fitted {
  const obj = instance(g);
  if (colour) {
    obj.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      for (const q of Array.isArray(m.material) ? m.material : [m.material]) {
        const std = q as THREE.MeshStandardMaterial;
        if (std.color && !std.map) std.color.set(colour);
      }
    });
  }
  const placed = wrap(obj, T);
  const probe = new THREE.Group();
  probe.add(placed);
  const box = new THREE.Box3().setFromObject(probe);
  const top = box.max.y;
  const sizer = new THREE.Group();
  sizer.position.set(0, top, 0);
  sizer.scale.set(ratio.w, ratio.l, ratio.w);
  placed.position.y -= top;
  sizer.add(placed);
  const root = new THREE.Group();
  root.add(sizer);
  return { root, clips: g.animations.length ? [{ target: obj, clip: g.animations[0] }] : [] };
}

/** One garment file on its own, framed for a wardrobe card (no avatar needed). */
export function standalone(g: GLTF, colour?: string): THREE.Group {
  const f = fitGarment(g, new THREE.Matrix4(), { w: 1, l: 1 }, colour);
  return f.root;
}
