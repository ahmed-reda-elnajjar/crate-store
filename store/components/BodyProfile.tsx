"use client";

import { useEffect, useId, useState } from "react";
import { BODY_FIELDS, HEIGHT_RANGE, WEIGHT_RANGE, estimateBody, type BodyKey, type BodyProfile } from "@/lib/fit";
import { setFit } from "@/lib/store";

/** Height and weight sliders. Changing them re-estimates every measurement that wasn't overridden. */
export function BodySliders({ profile, onChange }: { profile: BodyProfile; onChange?: () => void }) {
  const set = (patch: Partial<BodyProfile>) => (setFit(patch), onChange?.());
  return (
    <div className="body-sliders">
      <label className="slider">
        <span className="t"><span>Height</span><b>{profile.h} cm</b></span>
        <input type="range" min={HEIGHT_RANGE[0]} max={HEIGHT_RANGE[1]} value={profile.h} onChange={(e) => set({ h: +e.target.value })} />
      </label>
      <label className="slider">
        <span className="t"><span>Weight</span><b>{profile.w} kg</b></span>
        <input type="range" min={WEIGHT_RANGE[0]} max={WEIGHT_RANGE[1]} value={profile.w} onChange={(e) => set({ w: +e.target.value })} />
      </label>
    </div>
  );
}

/** The six body measurements: each shows the estimate from height and weight until the customer types their own. */
export function BodyMeasures({ profile, onChange }: { profile: BodyProfile; onChange?: () => void }) {
  const est = estimateBody(profile.h, profile.w);
  return (
    <div className="measures">
      {BODY_FIELDS.map((f) => (
        <MeasureField key={f.k} k={f.k} label={f.l} hint={f.hint} min={f.min} max={f.max} value={profile[f.k]} estimate={est[f.k]} onChange={onChange} />
      ))}
    </div>
  );
}

export const overrideCount = (p: BodyProfile) => BODY_FIELDS.filter((f) => typeof p[f.k] === "number").length;

function MeasureField({ k, label, hint, min, max, value, estimate, onChange }: {
  k: BodyKey; label: string; hint: string; min: number; max: number; value?: number; estimate: number; onChange?: () => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  // Follow outside changes (reset, another tab) without clobbering what's being typed.
  useEffect(() => {
    setText((t) => {
      const cur = t.trim() === "" ? undefined : Number(t.replace(",", "."));
      return cur === value ? t : value === undefined ? "" : String(value);
    });
  }, [value]);
  const n = Number(text.replace(",", "."));
  const [typing, setTyping] = useState(false);
  // Only flag a bad value once the customer leaves the field, not while they type "9" on the way to "98".
  const bad = !typing && text !== "" && !(Number.isFinite(n) && n >= min && n <= max);
  const id = useId();
  const commit = (t: string) => {
    setText(t);
    const v = Number(t.replace(",", "."));
    if (t.trim() === "") setFit({ [k]: undefined } as Partial<BodyProfile>);
    else if (Number.isFinite(v) && v >= min && v <= max) setFit({ [k]: Math.round(v * 10) / 10 } as Partial<BodyProfile>);
    else return;
    onChange?.();
  };
  return (
    <div className="measure">
      <label htmlFor={id} title={hint}>
        <span>{label}</span>
        {value === undefined ? <span className="est">est.</span> : <button type="button" className="unbtn est" onClick={() => commit("")} aria-label={`Reset ${label} to the estimate`}>reset</button>}
      </label>
      <div className={`cm ${bad ? "err" : ""}`}>
        <input id={id} className="input" inputMode="decimal" placeholder={String(estimate)} value={text} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onChange={(e) => commit(e.target.value)} aria-invalid={bad} aria-describedby={bad ? `${id}-err` : undefined} />
        <span>cm</span>
      </div>
      {bad && <span id={`${id}-err`} className="err-t">{min}–{max} cm</span>}
    </div>
  );
}
