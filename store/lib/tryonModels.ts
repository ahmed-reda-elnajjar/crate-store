// The people the photo try-on can dress when the customer doesn't use their own photo.
// An admin uploads one full-body photo per group (Admin → Products → Try-on model photos);
// "male" falls back to the built-in model photo until then.

export type ModelKey = "male" | "female";

export const TRYON_MODELS: { key: ModelKey; label: string; slot: string; src?: string }[] = [
  { key: "male", label: "Male", slot: "tryon-model-male", src: "/lookbook/model.jpg" },
  { key: "female", label: "Female", slot: "tryon-model-female" },
];

export const tryonModel = (k: ModelKey) => TRYON_MODELS.find((m) => m.key === k)!;
