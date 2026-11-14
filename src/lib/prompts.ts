// Fáze 10: one higher-order question during retrieval (connect, compare, judge).
// Pure: the sheet passes a seed, so the question is stable until "Jiná otázka".

/** {other} = another learned topic of the same subject. */
export const LINK_PROMPTS = [
  "Jak to souvisí s tématem „{other}“?",
  "V čem se to liší od „{other}“ a v čem je to stejné?",
] as const;

export const PROMPTS = [
  "Jaká je na to analogie z běžného života?",
  "Kam to patří v celkovém obrazu předmětu?",
  "K čemu to slouží, jakou to má funkci?",
  "Jaký problém tím vyřešíš? Vymysli vlastní příklad.",
  "Co je na tom nejdůležitější a proč?",
  "Jakou zákeřnou otázku by na to mohl dát zkoušející?",
] as const;

/** Small stable string hash (FNV-1a), so a topic gets the same question all day. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The question for `seed`. Link questions only when there is another topic to
 * link to; `others` are titles of learned topics of the same subject (not this one).
 */
export function pickPrompt(others: readonly string[], seed: number): string {
  const pool: string[] = [...PROMPTS];
  if (others.length > 0) pool.push(...LINK_PROMPTS, ...LINK_PROMPTS); // link questions weigh double
  const s = Math.abs(Math.floor(seed));
  const template = pool[s % pool.length];
  if (!template.includes("{other}")) return template;
  const other = others[Math.floor(s / pool.length) % others.length];
  return template.replace("{other}", other.length > 60 ? `${other.slice(0, 59).trimEnd()}…` : other);
}
