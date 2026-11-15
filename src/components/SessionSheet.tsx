import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Topic } from "../types";
import { formatDate } from "../lib/format";
import { canMarkHotovo } from "../lib/hotovo";
import {
  GAP_LABEL,
  METHOD_LABEL,
  normalizeScore,
  orderedMethods,
  preferredMethodsFor,
  SCORES,
  sessionPatch,
  suggestedGap,
  type GapMode,
  type RetrievalMethod,
  type SessionWriteInput,
  type TrainingSession,
} from "../lib/sessions";
import { isNeuceno } from "../lib/termin";
import { MISTAKES, REFLECTION_MAX_SCORE, reflectionNote, scoreTip, NEXT_MAX } from "../lib/reflection";
import { hashSeed, pickPrompt } from "../lib/prompts";
import { SubjectBadge } from "./SubjectBadge";
import { useStoredFlag } from "./useStoredFlag";
import { BrainDumpField, clearDumpDraft, NextDatePicker, useDumpDraft } from "./PlanControls";
import { canPlan } from "../lib/plan";

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
 * Fáze 6 session sheet: Metoda, Skóre 1 to 5, Datum, Interval, Uložit.
 * Writes one Tréninky row and (unless Jen zápis) moves Hotovo.
 * Fáze 10: the interval follows the skóre until you pick one yourself, an optional
 * reflection (skóre 1 to 3) goes to Poznámka, and one higher-order question sits on top.
 * Both extras can be switched off in the sheet and never block Uložit.
 * Without a configured Tréninky DB it says so and offers only the old Hotovo.
 */
export function SessionSheet({
  topic,
  today,
  others = [],
  initialMethod,
  treninkyError,
  configured,
  onClose,
  onSave,
  onPlainHotovo,
  onPlan,
}: {
  topic: Topic;
  today: string;
  /** Titles of other learned topics of the same subject, for the link question. */
  others?: string[];
  initialMethod?: RetrievalMethod;
  configured: boolean;
  treninkyError: string | null;
  onClose: () => void;
  /** Resolves to an error message, or null when saved. */
  onSave: (input: SessionWriteInput) => Promise<string | null>;
  onPlainHotovo: () => void;
  /** Fáze 12: only move the next retrieval, no session. Resolves to an error or null. */
  onPlan?: (termin: string) => Promise<string | null>;
}) {
  const methods = orderedMethods(topic.subject);
  const preferred = preferredMethodsFor(topic.subject);
  const [method, setMethod] = useState<RetrievalMethod | null>(initialMethod ?? methods[0] ?? null);
  const [score, setScore] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [gap, setGap] = useState<GapMode>(() => suggestedGap(topic, null));
  const [gapTouched, setGapTouched] = useState(false);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [next, setNext] = useState("");
  const [reflectionOn, setReflectionOn] = useStoredFlag("trenink.reflexe", true);
  const [promptOn, setPromptOn] = useStoredFlag("trenink.otazka", true);
  const [promptTurn, setPromptTurn] = useState(0);
  const prompt = useMemo(
    () => pickPrompt(others, hashSeed(`${topic.id}:${today}`) + promptTurn),
    [others, topic.id, today, promptTurn],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History>({ status: "loading" });
  const [termin, setTermin] = useState("");
  const [dump, setDump] = useDumpDraft(topic.id);
  const titleId = useId();
  const firstRef = useRef<HTMLButtonElement>(null);

  const canAdvance = canMarkHotovo(topic);
  // First retrieval (Neučeno with Naučeno): repeat and reset are the same as advance, so only offer advance.
  const gapModes: GapMode[] = !canAdvance ? ["none"] : isNeuceno(topic) ? ["advance", "none"] : ["advance", "repeat", "reset", "none"];
  const effectiveGap: GapMode = gapModes.includes(gap) ? gap : canAdvance ? "advance" : "none";
  const preview = sessionPatch(topic, { gap: effectiveGap, date: date || today, termin: termin || null });
  const plannable = canPlan(topic);
  // The "Příště: …" part of the newest session's Poznámka, shown as a reminder on top.
  const lastNext =
    history.status === "ready" ? (/Příště: (.+?)(?: · |$)/.exec(history.sessions[0]?.note ?? "")?.[1] ?? null) : null;
  const showReflection = score !== null && score <= REFLECTION_MAX_SCORE;
  const tip = scoreTip(score);

  function pickScore(n: number) {
    setScore(n);
    // The interval follows the skóre until it is picked by hand.
    if (!gapTouched) setGap(suggestedGap(topic, n));
  }

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
    const note = reflectionOn && s <= REFLECTION_MAX_SCORE ? reflectionNote(mistakes, next) : "";
    const dumpText = m === "brainDump" ? dump : "";
    const message = await onSave({ method: m, score: s, date, gap: effectiveGap, note, termin: termin || null, dump: dumpText });
    setSaving(false);
    if (message) setError(message);
    else if (dumpText) clearDumpDraft(topic.id);
  }

  /** Fáze 12: Jen přeplánovat, no session. */
  async function planOnly() {
    if (!onPlan || !termin) return;
    setError(null);
    setSaving(true);
    const message = await onPlan(termin);
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

        {promptOn && configured && (
          <div className="sheet-prompt">
            <p>
              <span className="sheet-prompt-label">Otázka na propojení</span>
              {prompt}
            </p>
            <div className="sheet-prompt-actions">
              <button type="button" className="link-button" onClick={() => setPromptTurn((n) => n + 1)}>
                Jiná
              </button>
              <button type="button" className="link-button" onClick={() => setPromptOn(false)}>
                Skrýt
              </button>
            </div>
          </div>
        )}

        {lastNext && configured && (
          <p className="sheet-last-next">
            <span className="sheet-prompt-label">Poznámka z minula</span>
            {lastNext}
          </p>
        )}

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
              {method === "brainDump" && <BrainDumpField value={dump} onChange={setDump} disabled={saving} />}
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
                    onClick={() => pickScore(n)}
                    disabled={saving}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="sheet-hint">1 katastrofa, 5 jistý</p>
              {tip && <p className="sheet-tip">{tip}</p>}
            </fieldset>

            {showReflection && reflectionOn && (
              <fieldset className="sheet-field sheet-reflection">
                <legend>
                  Co nešlo? <span className="sheet-hint">nepovinné</span>
                  <button type="button" className="link-button sheet-legend-action" onClick={() => setReflectionOn(false)}>
                    Nezobrazovat
                  </button>
                </legend>
                <div className="segmented" role="group" aria-label="Co nešlo">
                  {MISTAKES.map((m) => {
                    const on = mistakes.includes(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={on}
                        className={`seg seg-small${on ? " seg-on" : ""}`}
                        onClick={() => setMistakes((list) => (on ? list.filter((k) => k !== m.key) : [...list, m.key]))}
                        disabled={saving}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  className="sheet-input"
                  placeholder="Příště zkusím…"
                  maxLength={NEXT_MAX}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  disabled={saving}
                />
              </fieldset>
            )}

            <label className="sheet-date">
              Datum
              <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} disabled={saving} />
            </label>

            <fieldset className="sheet-field">
              <legend>Interval</legend>
              {gapModes.length > 1 && (
                <div className="segmented" role="radiogroup" aria-label="Interval">
                  {gapModes.map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={effectiveGap === g}
                      className={`seg seg-small${effectiveGap === g ? " seg-on" : ""}`}
                      onClick={() => {
                        setGap(g);
                        setGapTouched(true);
                      }}
                      disabled={saving}
                    >
                      {GAP_LABEL[g]}
                    </button>
                  ))}
                </div>
              )}
              {plannable && (
                <>
                  <p className="sheet-hint">Další opakování ručně (nepovinné):</p>
                  <NextDatePicker today={today} value={termin} onChange={setTermin} disabled={saving} />
                </>
              )}
              <p className="sheet-hint">
                {termin && preview
                  ? `${preview.patch.hotovo === (topic.hotovo ?? "Neučeno") ? `Hotovo zůstane ${preview.patch.hotovo}` : `Hotovo ${topic.hotovo ?? "Neučeno"} na ${preview.patch.hotovo}`}, další opakování ${preview.termin ? formatDate(preview.termin, today) : "?"}.`
                  : !canAdvance
                  ? "Hotovo už nejde posunout, uloží se jen trénink."
                  : !preview
                    ? "Jen zápis do Tréninků, Hotovo zůstane."
                    : `${preview.patch.hotovo === (topic.hotovo ?? "Neučeno") ? `Hotovo zůstane ${preview.patch.hotovo}` : `Hotovo ${topic.hotovo ?? "Neučeno"} na ${preview.patch.hotovo}`}${preview.termin ? `, další opakování ${formatDate(preview.termin, today)}` : "."}`}
              </p>
            </fieldset>

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
            {onPlan && plannable && termin && (
              <button type="button" className="link-button" disabled={saving} onClick={() => void planOnly()}>
                Jen přeplánovat na {formatDate(termin, today)} (bez tréninku)
              </button>
            )}
            {isQuizletLink(topic.odkaz) && (
              <a className="sheet-link" href={topic.odkaz!} target="_blank" rel="noreferrer">
                Otevřít v Quizletu
              </a>
            )}

            {(!promptOn || (showReflection && !reflectionOn)) && (
              <p className="sheet-hint sheet-restore">
                {!promptOn && (
                  <button type="button" className="link-button" onClick={() => setPromptOn(true)}>
                    Zobrazit otázku na propojení
                  </button>
                )}
                {showReflection && !reflectionOn && (
                  <button type="button" className="link-button" onClick={() => setReflectionOn(true)}>
                    Zapnout reflexi
                  </button>
                )}
              </p>
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
                      {s.note && <span className="history-note">{s.note}</span>}
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
