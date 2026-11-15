import { useEffect, useState } from "react";
import { formatDate } from "../lib/format";
import { addDays } from "../lib/termin";
import { PLAN_MAX_DAYS, quickDates } from "../lib/plan";
import { DUMP_MAX } from "../lib/sessions";

const draftKey = (topicId: string) => `braindump.${topicId}`;

function readDraft(topicId: string): string {
  try {
    return localStorage.getItem(draftKey(topicId)) ?? "";
  } catch {
    return "";
  }
}

/** Forget the brain dump draft of a topic once it is saved in Notion. */
export function clearDumpDraft(topicId: string) {
  try {
    localStorage.removeItem(draftKey(topicId));
  } catch {
    // nothing stored
  }
}

/**
 * Fáze 12: the brain dump text for one topic. A draft is kept in this browser
 * while typing, so closing the block by mistake does not lose it.
 */
export function useDumpDraft(topicId: string | undefined): [string, (v: string) => void] {
  const [text, setText] = useState(() => (topicId ? readDraft(topicId) : ""));
  useEffect(() => setText(topicId ? readDraft(topicId) : ""), [topicId]);
  const set = (v: string) => {
    setText(v);
    if (!topicId) return;
    try {
      if (v) localStorage.setItem(draftKey(topicId), v);
      else localStorage.removeItem(draftKey(topicId));
    } catch {
      // private mode: no draft, the text still saves
    }
  };
  return [text, set];
}

/** Free text field for Brain dump; the text goes into the Tréninky row in Notion. */
export function BrainDumpField({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="dump">
      <span className="sheet-hint">Napiš všechno, co si vybavíš, bez poznámek. Uloží se do Tréninků v Notionu.</span>
      <textarea
        className="sheet-input dump-input"
        rows={8}
        maxLength={DUMP_MAX}
        placeholder="Brain dump…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {value.length > 0 && <span className="sheet-hint dump-count">{value.length} znaků</span>}
    </label>
  );
}

/**
 * Fáze 12: pick the next retrieval by hand. Quick picks plus a date field;
 * empty = whatever the interval choice gives.
 */
export function NextDatePicker({
  today,
  value,
  onChange,
  disabled,
}: {
  today: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="plan-pick">
      <div className="segmented" role="group" aria-label="Další opakování">
        {quickDates(today).map((q) => (
          <button
            key={q.date}
            type="button"
            aria-pressed={value === q.date}
            className={`seg seg-small${value === q.date ? " seg-on" : ""}`}
            onClick={() => onChange(value === q.date ? "" : q.date)}
            disabled={disabled}
          >
            {q.label}
          </button>
        ))}
      </div>
      <label className="sheet-date">
        Datum
        <input
          type="date"
          value={value}
          min={addDays(today, 1)}
          max={addDays(today, PLAN_MAX_DAYS)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        {value && (
          <button type="button" className="link-button" onClick={() => onChange("")} disabled={disabled}>
            Zrušit ({formatDate(value, today)})
          </button>
        )}
      </label>
    </div>
  );
}
