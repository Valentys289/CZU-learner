import type { Topic } from "../types";
import { formatDate, relativeLabel } from "../lib/format";
import { canMarkHotovo, canMarkNauceno, type TopicAction } from "../lib/hotovo";
import { SubjectBadge } from "./SubjectBadge";
import { useTopicActions } from "./TopicActions";

const ACTION_LABEL: Record<TopicAction, string> = { hotovo: "Hotovo", nauceno: "Naučeno dnes" };

export function TopicRow({ topic, today, showBadge = true }: { topic: Topic; today: string; showBadge?: boolean }) {
  const actions = useTopicActions();
  const overdue = topic.dueState === "overdue";
  const due = overdue || topic.dueState === "today";
  const action: TopicAction | null = canMarkNauceno(topic) ? "nauceno" : due && canMarkHotovo(topic) ? "hotovo" : null;
  const busy = actions?.pending.has(topic.id) ?? false;

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
          </span>
        </span>
        {overdue && !(actions && action) && <span className="flag">Po termínu</span>}
      </a>
      {actions && action && (
        <button
          type="button"
          className={`topic-action${action === "nauceno" ? " topic-action-secondary" : ""}`}
          disabled={busy}
          onClick={() => actions.run(topic, action)}
        >
          {busy ? "Ukládám…" : ACTION_LABEL[action]}
        </button>
      )}
    </li>
  );
}
