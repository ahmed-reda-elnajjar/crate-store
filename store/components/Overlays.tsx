"use client";

import { useStore } from "@/lib/store";
import { BagDrawer } from "./BagDrawer";
import { FitRoom } from "./FitRoom";

/** App-wide overlays: bag drawer (2g), fit room (3a/3b) and the toast. */
export function Overlays() {
  const s = useStore();
  return (
    <>
      <BagDrawer />
      <FitRoom />
      {s.ui.toast && <div className="toast" role="status">{s.ui.toast}</div>}
    </>
  );
}
