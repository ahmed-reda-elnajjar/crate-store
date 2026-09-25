// Wardrobe card images: each garment (or the customer's head, for hair and beard
// cards) rendered on its own with the same cartoon shading as the fit-room
// avatar, returned as a transparent PNG data URL. Browser only.

import * as THREE from "three";
import { buildAvatar, buildBust, cssColour, disposeTree, type Look, type Wear } from "./avatar3d";
import type { Body } from "./fit";
import { loadGLB, standalone } from "./models";

const W = 240;
const H = 300;

let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
const cache = new Map<string, string>();

function stage() {
  if (ctx) return ctx;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.3));
  const key = new THREE.DirectionalLight(0xfff6ec, 2.2);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-2, 1, -2);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(24, W / H, 0.01, 50);
  ctx = { renderer, scene, camera };
  return ctx;
}

/** Frame the object (built in cm) in the card and render it. */
function shoot(obj: THREE.Group, pad: number, yaw = 0.35, unit = 0.01): string {
  const { renderer, scene, camera } = stage();
  obj.scale.setScalar(unit);
  obj.rotation.y = yaw;
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const fov = (camera.fov * Math.PI) / 180;
  const fitH = (size.y * pad) / 2 / Math.tan(fov / 2);
  const fitW = (Math.max(size.x, size.z) * pad) / 2 / Math.tan(fov / 2) / camera.aspect;
  const dist = Math.max(fitH, fitW) + size.z / 2;
  camera.position.set(centre.x, centre.y + size.y * 0.04, centre.z + dist);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(obj);
  disposeTree(obj);
  return url;
}

const NO_FACE: Look = { skin: "#ccc", hair: "#222", hairStyle: "bald", beard: "none", eyes: "#333", brows: "regular" };

/** One garment on its own, as if on an invisible body: your 3D file when it has one. */
export async function garmentThumb(body: Body, w: Wear): Promise<string> {
  const key = `g|${w.id}|${w.colour}|${JSON.stringify(w.m)}|${body.h}|${body.chest}|${w.model?.url ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const obj = w.model
    ? standalone(await loadGLB(w.model.url), w.model.recolour ? cssColour(w.colour) : undefined)
    : buildAvatar(body, NO_FACE, [{ ...w, colour: cssColour(w.colour) }], false, true);
  // Built-in garments are modelled in cm; files are in metres.
  const url = shoot(obj, 1.12, 0.35, w.model ? 1 : 0.01);
  cache.set(key, url);
  return url;
}

/** The customer's head with one appearance change, for hair and beard cards. */
export function headThumb(body: Body, look: Look): string {
  const key = `h|${JSON.stringify({ ...look, face: undefined })}|${body.h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = shoot(buildBust(body, look), 1.25, 0.45);
  cache.set(key, url);
  return url;
}
