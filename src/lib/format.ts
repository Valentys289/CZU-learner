import { daysBetween } from "./termin";

/** "26. 10." (adds the year when it differs from today's). */
export function formatDate(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return sameYear ? `${d}. ${m}.` : `${d}. ${m}. ${y}`;
}

export function pluralDny(n: number): string {
  if (n === 1) return "1 den";
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

/** Short relative label for a Termín: "dnes", "včera", "před 3 dny", "zítra", "za 5 dní". */
export function relativeLabel(termin: string, today: string): string {
  const diff = daysBetween(today, termin);
  if (diff === 0) return "dnes";
  if (diff === -1) return "včera";
  if (diff === 1) return "zítra";
  if (diff < 0) return `před ${-diff} dny`;
  return `za ${pluralDny(diff)}`;
}

/** "pondělí 26. 10." */
export function formatToday(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("cs-CZ", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return `${weekday} ${d}. ${m}.`;
}

export function pluralTemat(n: number): string {
  if (n === 1) return "1 téma";
  if (n >= 2 && n <= 4) return `${n} témata`;
  return `${n} témat`;
}

/** "1 nové téma", "3 nová témata", "5 nových témat". */
export function pluralNovychTemat(n: number): string {
  if (n === 1) return "1 nové téma";
  if (n >= 2 && n <= 4) return `${n} nová témata`;
  return `${n} nových témat`;
}

/** "1 předmět", "3 předměty", "5 předmětů". */
export function pluralPredmetu(n: number): string {
  if (n === 1) return "1 předmět";
  if (n >= 2 && n <= 4) return `${n} předměty`;
  return `${n} předmětů`;
}

/** "skryt 1 předmět", "skryty 2 předměty", "skryto 5 předmětů". */
export function skrytoPredmetu(n: number): string {
  const verb = n === 1 ? "skryt" : n >= 2 && n <= 4 ? "skryty" : "skryto";
  return `${verb} ${pluralPredmetu(n)}`;
}
