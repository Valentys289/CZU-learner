import type { Topic } from "../types";
import { formatDate, relativeLabel } from "../lib/format";
import { SubjectBadge } from "./SubjectBadge";

export function TopicRow({ topic, today, showBadge = true }: { topic: Topic; today: string; showBadge?: boolean }) {
  const overdue = topic.dueState === "overdue";
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
        {overdue && <span className="flag">Po termínu</span>}
      </a>
    </li>
  );
}
