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
