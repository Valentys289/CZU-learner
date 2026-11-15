import { useEffect, useMemo, useRef, useState } from "react";
import type { Topic } from "../types";
import { blockSummary, suggestMethod } from "../lib/block";
import { formatDate } from "../lib/format";
import { hashSeed, pickPrompt } from "../lib/prompts";
import { MISTAKES, NEXT_MAX, REFLECTION_MAX_SCORE, reflectionNote, scoreTip } from "../lib/reflection";
import {
  GAP_LABEL,
  METHOD_LABEL,
  orderedMethods,
  SCORES,
  sessionPatch,
  suggestedGap,
  type GapMode,
  type LastSession,
  type RetrievalMethod,
  type SessionWriteInput,
} from "../lib/sessions";
import { SubjectBadge } from "./SubjectBadge";
import { useStoredFlag } from "./useStoredFlag";
import { BrainDumpField, clearDumpDraft, NextDatePicker, useDumpDraft } from "./PlanControls";
import { canMarkHotovo } from "../lib/hotovo";
import { isNeuceno } from "../lib/termin";
import { canPlan } from "../lib/plan";

const SCORE_HINT: Record<number, string> = { 1: "katastrofa", 2: "slabé", 3: "půl na půl", 4: "dobré", 5: "jistý" };

type Result = { id: string; title: string; score: number };

/**
 * Fáze 11: Blok. Walks through `ids` one topic at a time: recall from memory with
 * the suggested method, pick a skóre, Uložit a další. The interval follows the
 * skóre (as in the session sheet); the reflection under skóre 1 to 3 is optional.
 * Keys: 1 to 5 skóre, Enter save, S skip, Esc close.
 */
export function BlockRunner({
  title,
  ids,
  topics,
  today,
  lastSession,
  onSave,
  onClose,
}: {
  title: string;
  /** Topic page IDs, in block order (fixed when the block starts). */
  ids: string[];
  /** The live topic list: a topic is read from here when its turn comes. */
  topics: Topic[];
  today: string;
  lastSession: (topicId: string) => LastSession | undefined;
  /** Resolves to an error message, or null when saved. */
  onSave: (topic: Topic, input: SessionWriteInput) => Promise<string | null>;
  onClose: () => void;
}) {
  const [queue, setQueue] = useState(ids);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [method, setMethod] = useState<RetrievalMethod | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptTurn, setPromptTurn] = useState(0);
  // Fáze 12: interval and next date by hand (hidden behind "Změnit plán"), brain dump text.
  const [planOpen, setPlanOpen] = useState(false);
  const [gapPick, setGapPick] = useState<GapMode | null>(null);
  const [termin, setTermin] = useState("");
  const [reflectionOn] = useStoredFlag("trenink.reflexe", true);
  const [promptOn] = useStoredFlag("trenink.otazka", true);
  const startedAt = useRef(Date.now());

  const topic = index < queue.length ? topics.find((t) => t.id === queue[index]) : undefined;
  const done = index >= queue.length;
  const last = topic ? lastSession(topic.id) : undefined;
  const activeMethod = topic ? (method ?? suggestMethod(topic.subject, last?.method)) : null;
  const others = useMemo(
    () => (topic ? topics.filter((t) => t.subject === topic.subject && t.id !== topic.id && t.nauceno !== null).map((t) => t.title) : []),
    [topic, topics],
  );
  const prompt = topic ? pickPrompt(others, hashSeed(`${topic.id}:${today}`) + promptTurn) : "";
  const [dump, setDump] = useDumpDraft(topic?.id);
  const canAdvance = topic ? canMarkHotovo(topic) : false;
  const gapModes: GapMode[] = !topic || !canAdvance ? ["none"] : isNeuceno(topic) ? ["advance", "none"] : ["advance", "repeat", "reset", "none"];
  const suggested = topic ? suggestedGap(topic, score) : "none";
  const gap: GapMode = gapPick && gapModes.includes(gapPick) ? gapPick : suggested;
  const preview = topic && score !== null ? sessionPatch(topic, { gap, date: today, termin: termin || null }) : null;
  const isDump = activeMethod === "brainDump";
  const isExtra = topic ? topic.dueState !== "overdue" && topic.dueState !== "today" : false;
  const showReflection = reflectionOn && score !== null && score <= REFLECTION_MAX_SCORE;

  function advance() {
    setIndex((i) => i + 1);
    setMethod(null);
    setScore(null);
    setMistakes([]);
    setNext("");
    setError(null);
    setPromptTurn(0);
    setPlanOpen(false);
    setGapPick(null);
    setTermin("");
  }

  // A topic that disappeared (deleted in Notion, list reloaded) is passed over.
  useEffect(() => {
    if (!done && !topic) advance();
  }, [done, topic]);

  async function save() {
    if (!topic || !activeMethod || score === null || saving) return;
    setSaving(true);
    setError(null);
    const note = showReflection ? reflectionNote(mistakes, next) : "";
    const message = await onSave(topic, {
      method: activeMethod,
      score,
      date: today,
      gap,
      note,
      termin: termin || null,
      dump: isDump ? dump : "",
    });
    setSaving(false);
    if (message) return setError(message);
    if (isDump) clearDumpDraft(topic.id);
    setResults((r) => [...r, { id: topic.id, title: topic.title, score }]);
    advance();
  }

  /** Skip: the topic goes to the end of the block once; skipped again, it is left out. */
  function skip() {
    if (!topic || saving) return;
    const seenTwice = queue.indexOf(topic.id) !== index;
    if (seenTwice) setSkipped((n) => n + 1);
    else setQueue((q) => [...q, topic.id]);
    advance();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const inTextarea = e.target instanceof HTMLTextAreaElement;
      // In the brain dump field Esc only leaves the field and Enter is a new line (Cmd+Enter saves).
      if (e.key === "Escape" && inTextarea) return (e.target as HTMLElement).blur();
      if (e.key === "Escape" && !saving) return onClose();
      if (done) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        return void save();
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" && !inTextarea) {
        e.preventDefault();
        return void save();
      }
      if (typing) return;
      if (/^[1-5]$/.test(e.key)) setScore(Number(e.key));
      else if (e.key.toLowerCase() === "s") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = ids.length - skipped;
  const position = Math.min(results.length + 1, total);

  if (done) {
    const sum = blockSummary(results);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000));
    const weak = results.filter((r) => r.score <= 2);
    return (
      <div className="block" role="dialog" aria-modal="true" aria-label={title}>
        <div className="block-inner">
          <h2 className="block-done-title">{sum.count > 0 ? "Blok hotový" : "Blok ukončen"}</h2>
          {sum.count > 0 ? (
            <div className="stats block-stats">
              <div className="stat">
                <span className="stat-value">{sum.count}</span>
                <span className="stat-label">Témat</span>
              </div>
              <div className="stat">
                <span className="stat-value">{String(sum.average).replace(".", ",")}</span>
                <span className="stat-label">Průměr skóre</span>
              </div>
              <div className="stat">
                <span className="stat-value">{minutes} min</span>
                <span className="stat-label">Čas</span>
              </div>
            </div>
          ) : (
            <p className="empty small">Nic se neuložilo.</p>
          )}
          {weak.length > 0 && (
            <>
              <h3 className="sub-title">Vrátí se brzo</h3>
              <ul className="block-weak">
                {weak.map((r) => (
                  <li key={r.id}>
                    <span className={`chip chip-score chip-score-${r.score}`}>Skóre {r.score}</span> {r.title}
                  </li>
                ))}
              </ul>
            </>
          )}
          {skipped > 0 && <p className="sheet-hint">Přeskočeno: {skipped}. Zůstávají v seznamu Dnes.</p>}
          <button type="button" className="sheet-primary" onClick={onClose} autoFocus>
            Zavřít
          </button>
        </div>
      </div>
    );
  }
  if (!topic || !activeMethod) return null;

  return (
    <div className="block" role="dialog" aria-modal="true" aria-label={title}>
      <div className="block-inner">
        <header className="block-head">
          <span className="block-name">{title}</span>
          <span className="block-count">
            {position} / {total}
          </span>
          <button type="button" className="sheet-close" onClick={onClose} disabled={saving} aria-label="Ukončit blok">
            ×
          </button>
        </header>
        <div className="bar block-bar" aria-hidden="true">
          <span style={{ width: `${(results.length / Math.max(1, total)) * 100}%` }} />
        </div>

        <div className="block-topic">
          <SubjectBadge code={topic.subject} />
          <h2 className="block-title">{topic.title}</h2>
        </div>
        <p className="block-meta">
          <span className="chip">{topic.hotovo ?? "Neučeno"}</span>
          {isExtra && (
            <span className="chip chip-stav" title="Naučené téma, které ještě není na řadě: opakování navíc">
              Navíc
            </span>
          )}
          {last?.score != null && (
            <span className={`chip chip-score chip-score-${last.score}`}>
              Minule {last.score}
              {last.method ? `, ${METHOD_LABEL[last.method]}` : ""}
            </span>
          )}
        </p>

        <section className="block-step">
          <h3 className="block-step-title">1. Vybav si to z hlavy, bez poznámek</h3>
          <div className="segmented" role="radiogroup" aria-label="Metoda">
            {orderedMethods(topic.subject).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={activeMethod === m}
                className={`seg seg-small${activeMethod === m ? " seg-on" : ""}`}
                onClick={() => setMethod(m)}
                disabled={saving}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          {isDump && <BrainDumpField value={dump} onChange={setDump} disabled={saving} />}
          {last?.method && activeMethod !== last.method && method === null && (
            <p className="sheet-hint">Jiná metoda než minule, ať to vidíš z jiného úhlu.</p>
          )}
          {promptOn && (
            <div className="sheet-prompt">
              <p>
                <span className="sheet-prompt-label">Otázka na propojení</span>
                {prompt}
              </p>
              <div className="sheet-prompt-actions">
                <button type="button" className="link-button" onClick={() => setPromptTurn((n) => n + 1)}>
                  Jiná
                </button>
              </div>
            </div>
          )}
          <a className="sheet-link" href={topic.url} target="_blank" rel="noreferrer">
            Zkontrolovat v Notionu (až potom)
          </a>
        </section>

        <section className="block-step">
          <h3 className="block-step-title">
            2. Jak to šlo?{score !== null && <span className="sheet-hint"> {SCORE_HINT[score]}</span>}
          </h3>
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
          {score !== null && (
            <p className="sheet-hint">
              {scoreTip(score) ? `${scoreTip(score)} ` : ""}
              {preview
                ? `${termin ? "Vlastní datum" : GAP_LABEL[gap]}${preview.termin ? `, další opakování ${formatDate(preview.termin, today)}` : "."}`
                : "Jen zápis do Tréninků, interval se nemění."}{" "}
              {canPlan(topic) && (
                <button type="button" className="link-button link-inline" aria-expanded={planOpen} onClick={() => setPlanOpen((v) => !v)}>
                  {planOpen ? "Skrýt plán" : "Změnit plán"}
                </button>
              )}
            </p>
          )}
          {score !== null && planOpen && (
            <div className="block-plan-edit">
              {gapModes.length > 1 && (
                <div className="segmented" role="radiogroup" aria-label="Interval">
                  {gapModes.map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={gap === g}
                      className={`seg seg-small${gap === g ? " seg-on" : ""}`}
                      onClick={() => setGapPick(g)}
                      disabled={saving}
                    >
                      {GAP_LABEL[g]}
                    </button>
                  ))}
                </div>
              )}
              <p className="sheet-hint">Další opakování ručně (nepovinné):</p>
              <NextDatePicker today={today} value={termin} onChange={setTermin} disabled={saving} />
            </div>
          )}
          {showReflection && (
            <div className="block-reflection">
              <p className="sheet-hint">Co nešlo? Nepovinné.</p>
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
            </div>
          )}
        </section>

        {error && (
          <p className="sheet-error" role="alert">
            {error}
          </p>
        )}

        <div className="block-actions">
          <button type="button" className="sheet-primary" disabled={saving || score === null} onClick={() => void save()}>
            {saving ? "Ukládám…" : position === total ? "Uložit a dokončit" : "Uložit a další"}
          </button>
          <button type="button" className="sheet-secondary" disabled={saving} onClick={skip}>
            Přeskočit
          </button>
        </div>
        <p className="block-keys">
          {isDump ? "Klávesy: Cmd+Enter uložit, Esc opustí pole" : "Klávesy: 1 až 5 skóre, Enter uložit, S přeskočit, Esc ukončit"}
        </p>
      </div>
    </div>
  );
}
