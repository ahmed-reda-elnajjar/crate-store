"use client";

import { NEXT_DROP } from "@/lib/data";
import { countdown, pad2, useNow } from "@/lib/format";
import { toast, useStore } from "@/lib/store";

/** The red drop banner (Poster direction, mixed into Grid): live countdown to the next drop. */
export function DropBar() {
  const s = useStore();
  const now = useNow(15000);
  const c = countdown(NEXT_DROP.at, now);
  const member = s.session.role === "customer";
  const early = new Date(NEXT_DROP.at.getTime() - NEXT_DROP.earlyAccessMinutes * 60000);
  // Drop times are announced in Berlin time, whatever the visitor's zone.
  const earlyLabel = early.toLocaleTimeString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

  const title = !c.ready
    ? `${NEXT_DROP.name.toUpperCase()}`
    : c.live
      ? `${NEXT_DROP.name.toUpperCase()} · LIVE NOW`
      : `${NEXT_DROP.name.toUpperCase()} · ${pad2(c.days)}D ${pad2(c.hours)}H ${pad2(c.minutes)}M`;

  return (
    <div className="drop-bar">
      <span className="big" aria-live="off">{title}</span>
      <div className="side">
        <span>{member && !c.live ? `Your early access opens ${earlyLabel}` : NEXT_DROP.label}</span>
        <button className="btn btn-secondary h40" onClick={() => toast(`We'll let you know when ${NEXT_DROP.name} goes live.`)}>Notify me →</button>
      </div>
    </div>
  );
}
