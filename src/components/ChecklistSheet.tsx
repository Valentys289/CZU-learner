import { useEffect, useId, useRef, useState } from "react";
import type { Topic } from "../types";
import { CHECKLIST_SAVE_ERROR, type ChecklistSection } from "../lib/checklist";
import { SubjectBadge } from "./SubjectBadge";

type Load = { status: "loading" } | { status: "ready"; sections: ChecklistSection[] } | { status: "error"; message: string };

/** Return a copy of the sections with one item's checked state set. */
function withChecked(sections: ChecklistSection[], blockId: string, checked: boolean): ChecklistSection[] {
  return sections.map((s) => ({ ...s, items: s.items.map((i) => (i.blockId === blockId ? { ...i, checked } : i)) }));
}

/**
 * Fáze 7 B: the to_do items under the Fáze sections of the topic's Notion page.
 * A tick shows at once and is sent to Notion; if Notion refuses, it flips back
 * and the app shows "Nepodařilo se uložit checklist". Ticks never touch Tréninky.
 */
export function ChecklistSheet({ topic, onClose, onError }: { topic: Topic; onClose: () => void; onError: (message: string) => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    fetch(`/api/topics/${topic.id}/checklist`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (live) setLoad({ status: "ready", sections: json.sections as ChecklistSection[] });
      })
      .catch((err: unknown) => live && setLoad({ status: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [topic.id]);

  async function toggle(blockId: string, checked: boolean) {
    setLoad((l) => (l.status === "ready" ? { ...l, sections: withChecked(l.sections, blockId, checked) } : l));
    setSaving((s) => new Set(s).add(blockId));
    try {
      const res = await fetch(`/api/topics/${topic.id}/checklist/${blockId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (err) {
      setLoad((l) => (l.status === "ready" ? { ...l, sections: withChecked(l.sections, blockId, !checked) } : l));
      const detail = err instanceof Error ? err.message : String(err);
      onError(detail ? `${CHECKLIST_SAVE_ERROR}. ${detail}` : CHECKLIST_SAVE_ERROR);
    } finally {
      setSaving((s) => {
        const next = new Set(s);
        next.delete(blockId);
        return next;
      });
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <SubjectBadge code={topic.subject} />
          <h2 id={titleId} className="sheet-title">
            {topic.title}
          </h2>
          <button ref={closeRef} type="button" className="sheet-close" onClick={onClose} aria-label="Zavřít">
            ×
          </button>
        </header>

        {load.status === "loading" && <p className="sheet-hint">Načítám checklist…</p>}
        {load.status === "error" && (
          <p className="sheet-error" role="alert">
            {load.message}
          </p>
        )}
        {load.status === "ready" && load.sections.length === 0 && (
          <p className="sheet-hint">V těle stránky nejsou sekce Fáze (1. faze, 3. Retrieval, 4. Fáze čtyři).</p>
        )}
        {load.status === "ready" &&
          load.sections.map((section, i) => (
            <section key={`${section.kind}-${i}`} className="checklist-section">
              <h3 className="sub-title">{section.heading}</h3>
              {section.items.length === 0 ? (
                <p className="sheet-hint">Žádné položky</p>
              ) : (
                <ul className="checklist">
                  {section.items.map((item) => (
                    <li key={item.blockId}>
                      <label className={`checklist-item${item.checked ? " checklist-done" : ""}`}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={saving.has(item.blockId)}
                          onChange={(e) => void toggle(item.blockId, e.target.checked)}
                        />
                        <span>{item.text || "(bez textu)"}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

        <a className="sheet-link" href={topic.url} target="_blank" rel="noreferrer">
          Otevřít v Notionu
        </a>
      </div>
    </div>
  );
}
