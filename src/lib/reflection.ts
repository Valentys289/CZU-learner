// Fáze 10: optional reflection after a training (mistakes as a diagnostic tool).
// Never required: an empty reflection writes nothing to Notion.

export const MISTAKES = [
  { key: "recall", label: "Nešlo si vybavit" },
  { key: "link", label: "Nechápu souvislost" },
  { key: "careless", label: "Z nepozornosti" },
  { key: "method", label: "Metoda nesedí" },
  { key: "time", label: "Málo času" },
] as const;

export type MistakeKey = (typeof MISTAKES)[number]["key"];

/** The reflection shows for skóre up to this (4 and 5 need no diagnosis). */
export const REFLECTION_MAX_SCORE = 3;

/** Longest "Příště zkusím" text. */
export const NEXT_MAX = 200;

/**
 * Poznámka text: "Chyba: nevybavil jsem si, metoda nesedí · Příště: …".
 * Unknown keys are dropped; nothing picked and nothing typed gives "".
 */
export function reflectionNote(keys: readonly string[], next: string): string {
  const labels = MISTAKES.filter((m) => keys.includes(m.key)).map((m) => m.label.toLowerCase());
  const parts: string[] = [];
  if (labels.length) parts.push(`Chyba: ${labels.join(", ")}`);
  const n = next.trim().slice(0, NEXT_MAX);
  if (n) parts.push(`Příště: ${n}`);
  return parts.join(" · ");
}

/** Growth mindset line under a low skóre (replaces "Zkus příště jinou metodu"). */
export function scoreTip(score: number | null): string | null {
  if (score === null) return null;
  if (score <= 2) return "Zatím to nesedí, a to je užitečná informace. Téma se vrátí brzo.";
  if (score === 3) return "Půl na půl: stejný interval ještě jednou.";
  return null;
}
