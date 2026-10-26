import type { Topic } from "../types";
import { formatDate, relativeLabel } from "../lib/format";
import { canMarkHotovo, canMarkNauceno } from "../lib/hotovo";
import { METHOD_LABEL } from "../lib/sessions";
import { SubjectBadge } from "./SubjectBadge";
import { useTopicActions } from "./TopicActions";

/**
 * Row buttons: Naučeno dnes (one tap, first learn), Hotovo on a due topic (opens
 * the session sheet), Trénink on any other learned topic (extra practice, log only by default).
 */
export function TopicRow({ topic, today, showBadge = true }: { topic: Topic; today: string; showBadge?: boolean }) {
  const actions = useTopicActions();
  const overdue = topic.dueState === "overdue";
  const due = overdue || topic.dueState === "today";
  const action = canMarkNauceno(topic) ? "nauceno" : due && canMarkHotovo(topic) ? "hotovo" : "trenink";
  const busy = actions?.pending.has(topic.id) ?? false;
  const last = actions?.lastSession(topic.id);

  return (
    <li className={`topic${overdue ? " topic-overdue" : ""}`}>
      <a href={topic.url} target="_blank" rel="noreferrer" className="topic-link">
        {showBadge && <SubjectBadge code={topic.subject} />}
        <span className="topic-main">
          <span className="topic-title">{topic.title}</span>
          <span className="topic-meta">
            {topic.termin && (
              <span className="topic-termin">
                {formatDate(topic.termin, today)} · {relativeLabel(topic.termin, today)}
              </span>
            )}
            {!topic.termin && topic.deadline && <span>Deadline {formatDate(topic.deadline, today)}</span>}
            <span className="chip">{topic.hotovo ?? "Neučeno"}</span>
            {last?.score != null && (
              <span
                className={`chip chip-score chip-score-${last.score}`}
                title={`Poslední trénink${last.date ? ` ${formatDate(last.date, today)}` : ""}${last.method ? `, ${METHOD_LABEL[last.method]}` : ""}`}
              >
                Skóre {last.score}
              </span>
            )}
          </span>
        </span>
        {overdue && !actions && <span className="flag">Po termínu</span>}
      </a>
      {actions && (
        <button
          type="button"
          className={`topic-action${action === "hotovo" ? "" : " topic-action-secondary"}`}
          disabled={busy}
          onClick={() => (action === "nauceno" ? actions.run(topic, "nauceno") : actions.openSession(topic))}
        >
          {busy ? "Ukládám…" : action === "nauceno" ? "Naučeno dnes" : action === "hotovo" ? "Hotovo" : "Trénink"}
        </button>
      )}
    </li>
  );
}
