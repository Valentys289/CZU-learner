import type { Topic } from "../types";
import { formatDate, pluralDny, relativeLabel } from "../lib/format";
import { taskDueState, taskOverdueDays } from "../lib/phase";
import { canMarkTaskDone } from "../lib/hotovo";
import { SubjectBadge } from "./SubjectBadge";
import { useTopicActions } from "./TopicActions";

/**
 * Fáze 9 B: an úkol (Typ = Úkol) as a to-do row. Deadline and one action, Hotovo
 * (Hotovo = měsíc + Stav = Stable). No Termín, Trénink, Fáze checklist or session sheet.
 */
export function TaskRow({ task, today, showBadge = true }: { task: Topic; today: string; showBadge?: boolean }) {
  const actions = useTopicActions();
  const state = taskDueState(task, today);
  const busy = actions?.pending.has(task.id) ?? false;

  return (
    <li className={`topic topic-task${state === "overdue" ? " topic-overdue" : ""}`}>
      <a href={task.url} target="_blank" rel="noreferrer" className="topic-link">
        {showBadge && <SubjectBadge code={task.subject} />}
        <span className="topic-main">
          <span className="topic-title">{task.title}</span>
          <span className="topic-meta">
            {task.deadline ? (
              <span>
                Deadline {formatDate(task.deadline, today)} · {relativeLabel(task.deadline, today)}
              </span>
            ) : (
              <span>Bez deadline</span>
            )}
            {state === "overdue" && <span className="flag flag-inline">Po termínu ({pluralDny(taskOverdueDays(task, today))})</span>}
            {state === "today" && <span className="flag flag-inline flag-warn">Dnes</span>}
            <span className="chip">Úkol</span>
          </span>
        </span>
      </a>
      {actions && canMarkTaskDone(task) && (
        <button type="button" className="topic-action" disabled={busy} onClick={() => actions.run(task, "ukol")}>
          {busy ? "Ukládám…" : "Hotovo"}
        </button>
      )}
    </li>
  );
}
