import { useState } from "react";
import type { SubjectCode, SubjectError, Topic } from "../types";
import { SUBJECTS } from "../notion/config";
import { dnesList } from "../lib/termin";
import { pluralTemat } from "../lib/format";
import { isEncodingTopic } from "../lib/phase";
import { METHOD_LABEL, preferredMethodsFor } from "../lib/sessions";
import { SubjectBadge } from "./SubjectBadge";
import { TopicRow } from "./TopicRow";

function byDeadline(a: Topic, b: Topic): number {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return (a.poradi ?? Infinity) - (b.poradi ?? Infinity) || a.title.localeCompare(b.title, "cs");
}

export function PredmetyTab({ topics, today, errors }: { topics: Topic[]; today: string; errors: SubjectError[] }) {
  const [open, setOpen] = useState<SubjectCode | null>(null);

  return (
    <ul className="cards">
      {SUBJECTS.map((s) => {
        const mine = topics.filter((t) => t.subject === s.code);
        const due = dnesList(mine);
        const overdue = due.filter((t) => t.dueState === "overdue").length;
        const dueToday = due.length - overdue;
        const notLearned = mine.filter(isEncodingTopic).sort(byDeadline);
        // Learned but not due: extra practice only (Trénink, log without moving the gap by default).
        const others = mine
          .filter((t) => !isEncodingTopic(t) && !due.includes(t))
          .sort((a, b) => (a.termin ?? "9999").localeCompare(b.termin ?? "9999") || a.title.localeCompare(b.title, "cs"));
        const error = errors.find((e) => e.subject === s.code);
        const isOpen = open === s.code;

        return (
          <li key={s.code} className={`card${isOpen ? " card-open" : ""}`}>
            <button
              type="button"
              className="card-head"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : s.code)}
            >
              <SubjectBadge code={s.code} />
              <span className="card-name">{s.name}</span>
              <span className="card-total">{pluralTemat(mine.length)}</span>
            </button>
            {error ? (
              <p className="card-error">Nelze načíst: {error.message}</p>
            ) : (
              <div className="stats">
                <Stat label="Po termínu" value={overdue} tone={overdue > 0 ? "bad" : undefined} />
                <Stat label="Dnes" value={dueToday} tone={dueToday > 0 ? "warn" : undefined} />
                <Stat label="Učím nové" value={notLearned.length} />
              </div>
            )}
            {isOpen && !error && (
              <div className="card-body">
                <p className="card-methods">Metody: {preferredMethodsFor(s.code).map((m) => METHOD_LABEL[m]).join(", ")}</p>
                {due.length > 0 && (
                  <>
                    <h3 className="sub-title">Opakování (retrieval)</h3>
                    <ul className="topics">
                      {due.map((t) => (
                        <TopicRow key={t.id} topic={t} today={today} showBadge={false} />
                      ))}
                    </ul>
                  </>
                )}
                {notLearned.length > 0 && (
                  <>
                    <h3 className="sub-title">Učím nové (encoding)</h3>
                    <ul className="topics">
                      {notLearned.map((t) => (
                        <TopicRow key={t.id} topic={t} today={today} showBadge={false} />
                      ))}
                    </ul>
                  </>
                )}
                {due.length === 0 && notLearned.length === 0 && <p className="empty small">Nic k řešení</p>}
                {others.length > 0 && (
                  <details className="others">
                    <summary className="sub-title">
                      Ostatní naučená <span className="count">{others.length}</span>
                    </summary>
                    <ul className="topics">
                      {others.map((t) => (
                        <TopicRow key={t.id} topic={t} today={today} showBadge={false} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
