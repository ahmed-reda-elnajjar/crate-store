"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HEAT, buildAvatar, cssColour, disposeTree, type Appearance, type Look, type Wear } from "@/lib/avatar3d";
import { avatarTransform, fitAvatar, fitGarment, loadGLB } from "@/lib/models";
import { motionClip } from "@/lib/motions";
import type { Body } from "@/lib/fit";

export type Focus = "full" | "top" | "bottom";

interface Props {
  body: Body;
  wear: Wear[];
  look: Appearance;
  faceUrl?: string | null;
  /** Your own avatar file; used when every piece being worn has its own file too. */
  avatarUrl?: string | null;
  heat: boolean;
  focus: Focus;
  /** Turn the avatar to this yaw (radians); bump `n` to repeat the same angle. */
  turn: { yaw: number; n: number };
  /** Which motion the avatar file plays: "idle", "walk", or an animation stored in the file. */
  motion?: string;
  /** Called with the motions available for the avatar file. */
  onMotions?: (names: string[]) => void;
  onDragChange?: (dragging: boolean) => void;
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });

/**
 * Game-lobby style fit stage: the avatar stands on a lit platform, drags round
 * 360°, zooms with the wheel or a pinch, and the camera moves to whichever
 * piece is being looked at.
 */
export default function Lobby3D({ body, wear, look, faceUrl, avatarUrl, heat, focus, turn, motion = "idle", onMotions, onDragChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    pivot: THREE.Group;
    avatar?: THREE.Group;
    /** Scene units per model unit: 0.01 for the built-in avatar (cm), 1 for files (m). */
    base: number;
    mixers: THREE.AnimationMixer[];
    rigged: boolean;
    yaw: number;
    yawTarget: number;
    zoom: number;
    focus: Focus;
    h: number;
    pop: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const onDragRef = useRef(onDragChange);
  const onMotionsRef = useRef(onMotions);
  useEffect(() => {
    onMotionsRef.current = onMotions;
  });
  useEffect(() => {
    onDragRef.current = onDragChange;
  }, [onDragChange]);

  // Scene, lights, platform and the render loop: once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    const accent = new THREE.Color(cssColour("var(--color-accent)"));

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3835, 1.1));
    const key = new THREE.DirectionalLight(0xfff6ec, 2.1);
    key.position.set(1.6, 3.2, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.2;
    key.shadow.camera.right = 1.2;
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -0.4;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 2.2);
    rim.position.set(-2.2, 2.4, -2.4);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.7);
    fill.position.set(-2.5, 1.2, 2);
    scene.add(fill);

    // Platform: a dark disc with a lit accent edge and a soft glow on the floor.
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 96), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.45, metalness: 0.3 }));
    plat.position.y = -0.03;
    plat.receiveShadow = true;
    scene.add(plat);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.006, 8, 128), new THREE.MeshBasicMaterial({ color: accent }));
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.001;
    scene.add(edge);
    const glowCv = document.createElement("canvas");
    glowCv.width = glowCv.height = 256;
    const gx = glowCv.getContext("2d")!;
    const grad = gx.createRadialGradient(128, 128, 40, 128, 128, 128);
    grad.addColorStop(0, `rgba(${Math.round(accent.r * 255)},${Math.round(accent.g * 255)},${Math.round(accent.b * 255)},0.35)`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    gx.fillStyle = grad;
    gx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCv), transparent: true, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.058;
    scene.add(glow);
    const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(0.6, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.0015;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const st: NonNullable<typeof three.current> = { renderer, scene, camera, pivot, base: 0.01, mixers: [], rigged: false, yaw: 0, yawTarget: 0, zoom: 1, focus: "full", h: 1.78, pop: 0 };
    three.current = st;

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const target = new THREE.Vector3(0, 0.9, 0);
    const camPos = new THREE.Vector3(0, 1, 6);
    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      st.yaw += (st.yawTarget - st.yaw) * Math.min(1, dt * 8);
      pivot.rotation.y = st.yaw;
      // Idle: breathing and a slow weight shift.
      for (const m of st.mixers) m.update(dt);
      if (st.avatar) {
        const b = st.base;
        if (!st.rigged) {
          st.avatar.scale.set(b, b * (1 + Math.sin(t * 1.6) * 0.0035), b);
          st.avatar.rotation.z = Math.sin(t * 0.5) * 0.006;
        }
        if (st.pop > 0) {
          st.pop = Math.max(0, st.pop - dt * 3);
          const s = b * (1 + Math.sin(st.pop * Math.PI) * 0.025);
          st.avatar.scale.x = s;
          st.avatar.scale.z = s;
        }
      }
      // Frame the whole body, or move in on the top or the legs.
      const H = st.h;
      const fov = (camera.fov * Math.PI) / 180;
      const frame = st.focus === "full" ? H * 1.32 : H * 0.62;
      const ty = st.focus === "full" ? H * 0.46 : st.focus === "top" ? H * 0.7 : H * 0.28;
      const dist = (frame / 2 / Math.tan(fov / 2)) * st.zoom;
      target.lerp(new THREE.Vector3(0, ty, 0), Math.min(1, dt * 5));
      camPos.lerp(new THREE.Vector3(0, ty + H * 0.04, dist), Math.min(1, dt * 5));
      camera.position.copy(camPos);
      camera.lookAt(target);
      renderer.render(scene, camera);
    };
    tick();

    // Drag to turn, wheel / pinch to zoom.
    const el2 = renderer.domElement;
    el2.style.touchAction = "pan-y";
    const pointers = new Map<number, number>();
    let last = 0;
    let pinch = 0;
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, e.clientX);
      el2.setPointerCapture(e.pointerId);
      last = e.clientX;
      if (pointers.size === 1) onDragRef.current?.(true);
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e.clientX);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.abs(a - b);
        if (pinch) st.zoom = Math.max(0.55, Math.min(1.35, st.zoom * (pinch / d)));
        pinch = d;
        return;
      }
      st.yawTarget += (e.clientX - last) * 0.012;
      last = e.clientX;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
      if (!pointers.size) onDragRef.current?.(false);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      st.zoom = Math.max(0.55, Math.min(1.35, st.zoom * (1 + e.deltaY * 0.001)));
    };
    el2.addEventListener("pointerdown", down);
    el2.addEventListener("pointermove", move);
    el2.addEventListener("pointerup", up);
    el2.addEventListener("pointercancel", up);
    el2.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el2.removeEventListener("pointerdown", down);
      el2.removeEventListener("pointermove", move);
      el2.removeEventListener("pointerup", up);
      el2.removeEventListener("pointercancel", up);
      el2.removeEventListener("wheel", wheel);
      if (st.avatar) disposeTree(st.avatar);
      disposeTree(scene);
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      el2.remove();
      three.current = null;
    };
  }, []);

  // Face photo → image element (or none).
  const [face, setFace] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let alive = true;
    if (!faceUrl) {
      setFace(null);
      return;
    }
    loadImage(faceUrl).then((i) => alive && setFace(i)).catch(() => alive && setFace(null));
    return () => {
      alive = false;
    };
  }, [faceUrl]);

  // Rebuild the avatar when the body, the outfit or the look changes.
  const wearKey = JSON.stringify(wear.map((w) => [w.id, w.colour, w.m, w.zones, w.model]));
  const prevWear = useRef("");
  const lookKey = JSON.stringify(look);
  // Notes about pieces without a 3D file are no longer shown over the avatar.
  const [, setNote] = useState<string | null>(null);
  useEffect(() => {
    const st = three.current;
    if (!st) return;
    let alive = true;
    const show = (next: THREE.Group, base: number, mixers: THREE.AnimationMixer[], rigged = false) => {
      if (st.avatar) {
        st.pivot.remove(st.avatar);
        disposeTree(st.avatar);
      }
      for (const m of st.mixers) m.stopAllAction();
      next.scale.setScalar(base);
      st.pivot.add(next);
      st.avatar = next;
      st.base = base;
      st.mixers = mixers;
      st.rigged = rigged;
      st.h = body.h / 100;
      if (prevWear.current && prevWear.current !== wearKey) st.pop = 1;
      prevWear.current = wearKey;
    };
    const builtIn = () => {
      const full: Look = { ...look, face };
      const resolved = wear.map((w) => ({ ...w, colour: cssColour(w.colour) }));
      show(buildAvatar(body, full, resolved, heat), 0.01, []);
    };

    // Your own avatar file, wearing every piece that has a 3D file. Pieces without one are left off.
    const missing = wear.filter((w) => !w.model);
    if (!avatarUrl) {
      setNote(null);
      builtIn();
    } else {
      (async () => {
        try {
          const a = await loadGLB(avatarUrl);
          const T = avatarTransform(a, body);
          const parts = [fitAvatar(a, T)];
          const failedNames: string[] = [];
          for (const w of wear) {
            if (!w.model) continue;
            try {
              const g = await loadGLB(w.model.url);
              const worst = Object.values(w.zones).reduce<number>((x, l) => (Math.abs(l) > Math.abs(x) ? l : x), 0) as keyof typeof HEAT;
              const colour = heat ? HEAT[worst] : w.model.recolour ? cssColour(w.colour) : undefined;
              parts.push(fitGarment(g, T, w.model.ratio, colour));
            } catch {
              failedNames.push(w.name);
            }
          }
          if (!alive) return;
          const root = new THREE.Group();
          const mixers: THREE.AnimationMixer[] = [];
          const own = a.animations.find((c) => c.name === motion);
          const clip = own ?? motionClip(parts[0].obj, motion);
          for (const p of parts) {
            root.add(p.root);
            if (!clip) continue;
            const m = new THREE.AnimationMixer(p.obj);
            m.clipAction(clip).play();
            mixers.push(m);
          }
          onMotionsRef.current?.([...new Set(["idle", "walk", ...a.animations.map((c) => c.name)])]);
          const off = [...missing.map((w) => w.name), ...failedNames];
          setNote(off.length ? `${off.join(", ")} ${off.length > 1 ? "have" : "has"} no 3D file yet, so ${off.length > 1 ? "they aren't" : "it isn't"} shown.` : null);
          show(root, 1, mixers, true);
        } catch {
          if (!alive) return;
          setNote("The 3D avatar file couldn't be opened.");
          builtIn();
        }
      })();
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, wearKey, lookKey, face, heat, avatarUrl, motion]);

  useEffect(() => {
    if (three.current) three.current.focus = focus;
  }, [focus]);

  useEffect(() => {
    const st = three.current;
    if (!st || !turn.n) return;
    // Turn the short way round to the requested angle.
    const full = Math.PI * 2;
    const cur = st.yawTarget;
    let d = (turn.yaw - cur) % full;
    if (d > Math.PI) d -= full;
    if (d < -Math.PI) d += full;
    st.yawTarget = cur + d;
  }, [turn]);

  return (
    <div className="lobby3d" ref={host} aria-label="3D avatar. Drag to turn, scroll to zoom.">
      {failed && <div className="lobby-fail">3D needs WebGL, which this browser has switched off.</div>}
    </div>
  );
}
