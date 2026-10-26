import { useEffect, useId, useRef, useState } from "react";
import type { Topic } from "../types";
import { formatDate } from "../lib/format";
import { canMarkHotovo } from "../lib/hotovo";
import {
  defaultAdvanceGap,
  LOW_SCORE,
  METHOD_LABEL,
  normalizeScore,
  orderedMethods,
  preferredMethodsFor,
  SCORES,
  sessionPatch,
  type RetrievalMethod,
  type SessionWriteInput,
  type TrainingSession,
} from "../lib/sessions";
import { SubjectBadge } from "./SubjectBadge";

type History = { status: "loading" } | { status: "ready"; sessions: TrainingSession[] } | { status: "error"; message: string };

const SCORE_HINT: Record<number, string> = { 1: "katastrofa", 2: "slabé", 3: "půl na půl", 4: "dobré", 5: "jistý" };

const isQuizletLink = (url: string | null) => {
  try {
    return url !== null && /(^|\.)quizlet\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

/**
 * Fáze 6 session sheet: Metoda, Skóre 1 to 5, Datum, Posunout gap, Uložit.
 * Writes one Tréninky row; with Posunout gap on it also advances Hotovo.
 * Without a configured Tréninky DB it says so and offers only the old Hotovo.
 */
export function SessionSheet({
  topic,
  today,
  initialMethod,
  treninkyError,
  configured,
  onClose,
  onSave,
  onPlainHotovo,
}: {
  topic: Topic;
  today: string;
  initialMethod?: RetrievalMethod;
  configured: boolean;
  treninkyError: string | null;
  onClose: () => void;
  /** Resolves to an error message, or null when saved. */
  onSave: (input: SessionWriteInput) => Promise<string | null>;
  onPlainHotovo: () => void;
}) {
  const methods = orderedMethods(topic.subject);
  const preferred = preferredMethodsFor(topic.subject);
  const [method, setMethod] = useState<RetrievalMethod | null>(initialMethod ?? methods[0] ?? null);
  const [score, setScore] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [advanceGap, setAdvanceGap] = useState(() => defaultAdvanceGap(topic));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History>({ status: "loading" });
  const titleId = useId();
  const firstRef = useRef<HTMLButtonElement>(null);

  const canAdvance = canMarkHotovo(topic);
  const preview = advanceGap ? sessionPatch(topic, { advanceGap, date: date || today }) : null;

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  useEffect(() => {
    if (!configured) return;
    let live = true;
    fetch(`/api/topics/${topic.id}/sessions`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (live) setHistory({ status: "ready", sessions: json.sessions as TrainingSession[] });
      })
      .catch((err: unknown) => live && setHistory({ status: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [topic.id, configured]);

  async function save(m: RetrievalMethod | null) {
    const s = normalizeScore(score);
    if (!m) return setError("Vyber metodu");
    if (s === null) return setError("Vyber skóre 1 až 5");
    if (!date || date > today) return setError("Datum nemůže být v budoucnu");
    setError(null);
    setSaving(true);
    setMethod(m);
    const message = await onSave({ method: m, score: s, date, advanceGap: advanceGap && canAdvance });
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <div className="sheet-backdrop" onClick={() => !saving && onClose()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <SubjectBadge code={topic.subject} />
          <h2 id={titleId} className="sheet-title">
            {topic.title}
          </h2>
          <button type="button" className="sheet-close" onClick={onClose} disabled={saving} aria-label="Zavřít">
            ×
          </button>
        </header>

        {!configured ? (
          <div className="error" role="alert">
            <strong>{treninkyError ?? "Chybí Tréninky DB"}</strong>
            <p>Metoda a skóre se zatím neuloží. Hotovo jde dál potvrdit postaru.</p>
            {canAdvance && (topic.dueState === "overdue" || topic.dueState === "today") && (
              <button type="button" className="sheet-primary sheet-fallback" onClick={onPlainHotovo}>
                Jen Hotovo (bez skóre)
              </button>
            )}
          </div>
        ) : (
          <>
            <fieldset className="sheet-field">
              <legend>Metoda</legend>
              <div className="segmented" role="radiogroup" aria-label="Metoda">
                {methods.map((m, i) => (
                  <button
                    key={m}
                    ref={i === 0 ? firstRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    className={`seg${method === m ? " seg-on" : ""}${preferred.includes(m) ? "" : " seg-other"}`}
                    onClick={() => setMethod(m)}
                    disabled={saving}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="sheet-field">
              <legend>
                Skóre{score !== null && <span className="sheet-hint"> {SCORE_HINT[score]}</span>}
              </legend>
              <div className="scores" role="radiogroup" aria-label="Skóre 1 až 5">
                {SCORES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={score === n}
                    aria-label={`${n}, ${SCORE_HINT[n]}`}
                    className={`score score-${n}${score === n ? " score-on" : ""}`}
                    onClick={() => setScore(n)}
                    disabled={saving}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="sheet-hint">1 katastrofa, 5 jistý</p>
              {score !== null && score <= LOW_SCORE && <p className="sheet-tip">Zkus příště jinou metodu.</p>}
            </fieldset>

            <div className="sheet-row">
              <label className="sheet-date">
                Datum
                <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} disabled={saving} />
              </label>
              <label className={`sheet-toggle${canAdvance ? "" : " sheet-toggle-off"}`}>
                <input
                  type="checkbox"
                  checked={advanceGap && canAdvance}
                  onChange={(e) => setAdvanceGap(e.target.checked)}
                  disabled={saving || !canAdvance}
                />
                Posunout gap
              </label>
            </div>
            <p className="sheet-hint sheet-effect">
              {!canAdvance
                ? "Hotovo už nejde posunout, uloží se jen trénink."
                : preview
                  ? `Hotovo ${topic.hotovo ?? "Neučeno"} na ${preview.patch.hotovo}${preview.termin ? `, další opakování ${formatDate(preview.termin, today)}` : "."}`
                  : "Jen zápis do Tréninků, Hotovo zůstane."}
            </p>

            {error && (
              <p className="sheet-error" role="alert">
                {error}
              </p>
            )}

            <div className="sheet-actions">
              <button type="button" className="sheet-primary" disabled={saving || !method || score === null} onClick={() => void save(method)}>
                {saving ? "Ukládám…" : "Uložit"}
              </button>
              <button
                type="button"
                className="sheet-secondary"
                disabled={saving || score === null}
                title={score === null ? "Nejdřív vyber skóre" : undefined}
                onClick={() => void save("quizlet")}
              >
                Hotovo z Quizletu
              </button>
            </div>
            {isQuizletLink(topic.odkaz) && (
              <a className="sheet-link" href={topic.odkaz!} target="_blank" rel="noreferrer">
                Otevřít v Quizletu
              </a>
            )}

            <section className="sheet-history">
              <h3 className="sub-title">Historie</h3>
              {history.status === "loading" && <p className="sheet-hint">Načítám…</p>}
              {history.status === "error" && <p className="sheet-error">{history.message}</p>}
              {history.status === "ready" && history.sessions.length === 0 && <p className="sheet-hint">Zatím žádný trénink</p>}
              {history.status === "ready" && history.sessions.length > 0 && (
                <ul className="history">
                  {history.sessions.map((s) => (
                    <li key={s.id}>
                      <span className="history-date">{s.date ? formatDate(s.date, today) : "bez data"}</span>
                      <span>{s.method ? METHOD_LABEL[s.method] : "?"}</span>
                      {s.score !== null && <span className={`chip chip-score chip-score-${s.score}`}>Skóre {s.score}</span>}
                      {s.advancedGap && <span className="history-gap">gap posunut</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
