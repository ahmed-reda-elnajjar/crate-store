// Skeletal motions for the avatar file, built in code: they drive the bones by name,
// so the same clip plays on the avatar and on every garment made on its skeleton.
// Add your own by adding a case to `DEFS` (angles are degrees about the WORLD axes
// in the avatar's rest pose: X = pitch, Y = turn, Z = roll; positions are cm).
// Animations exported inside the avatar .glb (with the same bone names) also appear as motions.

import * as THREE from "three";

export const BUILT_IN_MOTIONS = ["idle", "walk"] as const;

type Sample = { rx?: number; ry?: number; rz?: number; px?: number; py?: number; pz?: number };
/** side: +1 for the bone on the character's +x side, -1 for the other, 0 for the centre line. */
type Fn = (t: number, side: number) => Sample;
interface Def { duration: number; step: number; bones: Record<string, Fn> }

const S = (x: number) => Math.sin(x);
const C = (x: number) => Math.cos(x);
const tri = (t: number, at: number, dur: number) => { const k = (t - at) / dur; return k < 0 || k > 1 ? 0 : 1 - Math.abs(2 * k - 1); };


/** Relaxed, slightly curled fingers (curl towards the palm, which faces the thigh), with a slow breathing drift. */
const fingers = (drift: (t: number) => number): Record<string, Fn> => {
  const curl = (deg: number, k = 1): Fn => (t, s) => ({ rz: -(s || 1) * (deg + 2.5 * k * drift(t)) });
  return {
    index_01: curl(10), index_02: curl(15), index_03: curl(10),
    middle_01: curl(14), middle_02: curl(19), middle_03: curl(12),
    ring_01: curl(18), ring_02: curl(23), ring_03: curl(14),
    pinky_01: curl(22), pinky_02: curl(27), pinky_03: curl(16),
    thumb_01: (t, s) => ({ rz: -(s || 1) * 6 }), thumb_02: curl(8), thumb_03: curl(8),
  };
};

const walk = (): Def => {
  const T = 1.2, A = 26, B = 16, Ay = 6;
  const ph = (t: number) => (2 * Math.PI * t) / T;
  const leg = (t: number, s: number) => { const p = ph(t) + (s > 0 ? Math.PI : 0); return { swing: A * S(p), knee: 5 + 40 * Math.max(0, C(p)) ** 1.4 }; };
  const arm = (t: number, s: number) => s * B * S(ph(t));
  return {
    duration: T, step: 0.05,
    bones: {
      hip: (t) => ({ ry: Ay * S(ph(t)), rz: 2.5 * C(ph(t)), py: 1.3 * C(2 * ph(t)) }),
      spine_01: (t) => ({ ry: -0.4 * Ay * S(ph(t)) }),
      spine_02: (t) => ({ ry: -0.6 * Ay * S(ph(t)), rz: -2 * C(ph(t)) }),
      spine_03: (t) => ({ ry: -0.6 * Ay * S(ph(t)), rx: -1 }),
      neck: (t) => ({ ry: 0.3 * Ay * S(ph(t)), rx: -1 }),
      head: (t) => ({ ry: 0.3 * Ay * S(ph(t)) + 2 * S(ph(t) + 1), rx: -2, rz: -0.4 * C(ph(t)) }),
      upperleg: (t, s) => ({ rx: -leg(t, s).swing }),
      lowerleg: (t, s) => ({ rx: leg(t, s).knee }),
      foot: (t, s) => { const l = leg(t, s); return { rx: 0.8 * (l.swing - l.knee) }; },
      upperarm: (t, s) => ({ rx: -arm(t, s) }),
      lowerarm: (t, s) => { const f = arm(t, s) / B; return { rx: -(12 + 10 * Math.max(0, f)) }; },
      hand: (t, s) => ({ rx: -4, rz: -(s || 1) * (3 + 2 * S(ph(t))) }),
      ...fingers((t) => S(ph(t))),
      eyelid: (t) => ({ rx: 32 * tri(t, 0.5, 0.16) }),
      eye: (t) => ({ ry: 3 * S(ph(t) + 0.5) }),
    },
  };
};

const idle = (): Def => {
  const T = 6;
  const w = (t: number) => (2 * Math.PI * t) / T;
  const b = (t: number) => S((2 * Math.PI * t) / 3);
  return {
    duration: T, step: 0.05,
    bones: {
      hip: (t) => ({ rz: 1.4 * S(w(t)), px: 1.2 * S(w(t)) }),
      spine_01: (t) => ({ rx: -0.4 * b(t) }),
      spine_02: (t) => ({ rx: -0.7 * b(t), rz: -0.9 * S(w(t)) }),
      spine_03: (t) => ({ rx: -0.9 * b(t) }),
      shoulder: (t, s) => ({ rz: -s * 0.8 * Math.max(0, b(t)) }),
      neck: (t) => ({ rx: 0.4 * b(t) }),
      head: (t) => ({ ry: 3 * S(w(t) + 1), rx: 1.5 * S(2 * w(t) + 0.5), rz: -0.5 * S(w(t)) }),
      upperarm: (t, s) => ({ rx: 3.2 * S(2 * w(t) + (s > 0 ? 0 : 1.3)) + 1.2 * S(w(t) + s), rz: -s * (1.2 * S(2 * w(t) + 0.8 + (s > 0 ? 0 : 1.3)) + 0.8 * S(w(t))) }),
      lowerarm: (t, s) => ({ rx: -(9 + 3 * S(2 * w(t) + 0.9 + (s > 0 ? 0 : 1.6)) + 1.5 * S(w(t) + 2 * s)) }),
      hand: (t, s) => ({ rx: 3 * S(2 * w(t) + 1.7 + (s > 0 ? 0 : 1.1)), rz: -s * (4 + 3 * S(2 * w(t) + 0.4 + (s > 0 ? 0 : 1.5))) }),
      ...fingers((t) => S(2 * w(t) + 1)),
      eyelid: (t) => ({ rx: 32 * (tri(t, 2.0, 0.16) + tri(t, 5.0, 0.16)) }),
      eye: (t) => ({ ry: 3 * S(w(t) + 2) }),
    },
  };
};

const DEFS: Record<string, () => Def> = { walk, idle };

/** Bones by key: "upperarm" gives both upperarm_l_024 and upperarm_r_049, "hip" gives hip_02. */
function bonesOf(root: THREE.Object3D, key: string) {
  const out: THREE.Bone[] = [];
  root.traverse((x) => {
    const b = x as THREE.Bone;
    if (!b.isBone) return;
    const n = b.name;
    const m = /^(.*?)(?:_[lr])?_(\d+)$/.exec(n);
    if (m && m[1] === key) out.push(b);
  });
  return out;
}

/** Build a clip for `name` from the avatar's (already posed) rest state. Null if it isn't a built-in motion. */
export function motionClip(root: THREE.Object3D, name: string): THREE.AnimationClip | null {
  const def = DEFS[name]?.();
  if (!def) return null;
  root.updateMatrixWorld(true);
  const times: number[] = [];
  for (let t = 0; t <= def.duration + 1e-6; t += def.step) times.push(+t.toFixed(4));
  const tracks: THREE.KeyframeTrack[] = [];
  const v = new THREE.Vector3(), pq = new THREE.Quaternion(), pqi = new THREE.Quaternion(), q = new THREE.Quaternion(), D = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, "ZYX");
  for (const [key, fn] of Object.entries(def.bones)) {
    for (const bone of bonesOf(root, key)) {
      if (!bone.parent) continue;
      bone.getWorldPosition(v);
      const side = /_l_\d+$/.test(bone.name) || /_r_\d+$/.test(bone.name) ? (v.x >= 0 ? 1 : -1) : 0;
      bone.parent.getWorldQuaternion(pq);
      pqi.copy(pq).invert();
      const rest = bone.quaternion.clone(), restPos = bone.position.clone();
      const qv: number[] = [], pv: number[] = [];
      let moves = false;
      for (const t of times) {
        const s = fn(t, side);
        E.set(((s.rx ?? 0) * Math.PI) / 180, ((s.ry ?? 0) * Math.PI) / 180, ((s.rz ?? 0) * Math.PI) / 180, "ZYX");
        D.setFromEuler(E);
        q.copy(pqi).multiply(D).multiply(pq).multiply(rest);
        qv.push(q.x, q.y, q.z, q.w);
        const dp = new THREE.Vector3(s.px ?? 0, s.py ?? 0, s.pz ?? 0);
        if (dp.lengthSq() > 0) moves = true;
        dp.applyQuaternion(pqi).add(restPos);
        pv.push(dp.x, dp.y, dp.z);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, qv));
      if (moves) tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, pv));
    }
  }
  return new THREE.AnimationClip(name, def.duration, tracks);
}
