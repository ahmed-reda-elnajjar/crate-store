"use client";

import { useRef } from "react";
import { putImage, removeImage, useImage } from "@/lib/images";
import { toast } from "@/lib/store";

const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Upload / replace / remove a .glb 3D file kept in this browser under `slot`
 * (the same store as product photos). `shipped` names a file already in
 * public/models, shown when nothing has been uploaded over it.
 */
export function ModelUpload({ slot, label, shipped }: { slot: string; label: string; shipped?: string }) {
  const url = useImage(slot);
  const input = useRef<HTMLInputElement>(null);
  const accept = async (file?: File | null) => {
    if (!file) return;
    if (!/\.glb$/i.test(file.name)) return toast("Use a .glb file (glTF binary, textures embedded).");
    if (file.size > MAX_BYTES) return toast("3D files must be under 40 MB.");
    await putImage(slot, file);
    toast(`${label}: 3D file saved.`);
  };
  return (
    <span className="model-up">
      <span className="muted">{url ? "Uploaded 3D file" : shipped ? `Using ${shipped}` : "No 3D file"}</span>
      <button type="button" className="unbtn u" onClick={() => input.current?.click()}>{url ? "Replace .glb" : "Upload .glb"}</button>
      {url && <button type="button" className="unbtn u" onClick={() => void removeImage(slot)}>Remove</button>}
      <input
        ref={input}
        type="file"
        accept=".glb,model/gltf-binary"
        hidden
        aria-label={`${label} 3D file`}
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </span>
  );
}
