import type { Topic } from "../types";
import { dnesList } from "../lib/termin";
import { addDays } from "../lib/termin";
import { dueCounts, ENCODING_HORIZON_DAYS, encodingDueSoon, isEncodingTopic, openTasks } from "../lib/phase";
import { pluralNovychTemat, pluralUkolu, skrytoPredmetu } from "../lib/format";
import { filterHidden, subjectsIn } from "../lib/hidden";
import { SUBJECTS } from "../notion/config";
import { TopicRow } from "./TopicRow";
import { TaskRow } from "./TaskRow";
import { useHiddenSubjects } from "./useHiddenSubjects";

/**
 * Dnes: due retrieval (Po termínu, Dnes) and, separately, encoding work with a
 * Deadline in the next ENCODING_HORIZON_DAYS days (Učím nové). Other Neučeno
 * topics stay on Předměty. Encoding topics past (or at) their Deadline count into Po termínu
 * (or Dnes) but stay listed under Učím nové, where Naučeno dnes is the action.
 * Fáze 9 B: open úkoly (Typ = Úkol) get their own Úkoly section above Učím nové
 * (Deadline within the same horizon, or no Deadline); overdue / today ones count
 * into Po termínu / Dnes the same way. The section is hidden while there are no úkoly.
 * Subjects can be hidden in Učím nové only (Fáze 9 C); every count above ignores that.
 */
export function DnesTab({ topics, today, onOpenPredmety }: { topics: Topic[]; today: string; onOpenPredmety?: () => void }) {
  const list = dnesList(topics); // retrieval only, unchanged
  const overdue = list.filter((t) => t.dueState === "overdue");
  const dueToday = list.filter((t) => t.dueState === "today");
  const encoding = encodingDueSoon(topics, today);
  const { hidden, toggle, showAll } = useHiddenSubjects();
  const encodingSubjects = subjectsIn(encoding);
  const hiddenHere = encodingSubjects.filter((c) => hidden.includes(c));
  const visibleEncoding = filterHidden(encoding, hiddenHere);
  const hiddenTopics = encoding.length - visibleEncoding.length;
  const moreEncoding = topics.filter(isEncodingTopic).length - encoding.length;
  const counts = dueCounts(topics, today);
  const allTasks = openTasks(topics, today);
  const until = addDays(today, ENCODING_HORIZON_DAYS);
  const tasks = allTasks.filter((t) => t.deadline === null || t.deadline <= until);
  const moreTasks = allTasks.length - tasks.length;
  const toEncoding = () => document.getElementById("ucim-nove")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const toTasks = () => document.getElementById("ukoly")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <h2 className="area-title">Opakování</h2>
      {counts.overdue + counts.today === 0 && <p className="empty small">Dnes nic k opakování</p>}
      {counts.overdue > 0 && (
        <section>
          <h3 className="section-title section-overdue">
            Po termínu <span className="count">{counts.overdue}</span>
          </h3>
          {overdue.length > 0 && (
            <ul className="topics">
              {overdue.map((t) => (
                <TopicRow key={t.id} topic={t} today={today} />
              ))}
            </ul>
          )}
          {counts.encodingOverdue > 0 && (
            <button type="button" className="link-button" onClick={toEncoding}>
              + {pluralNovychTemat(counts.encodingOverdue)} po termínu v Učím nové
            </button>
          )}
          {counts.taskOverdue > 0 && (
            <button type="button" className="link-button" onClick={toTasks}>
              + {pluralUkolu(counts.taskOverdue)} po termínu v Úkolech
            </button>
          )}
        </section>
      )}
      {counts.today > 0 && (
        <section>
          <h3 className="section-title">
            Dnes <span className="count">{counts.today}</span>
          </h3>
          {dueToday.length > 0 && (
            <ul className="topics">
              {dueToday.map((t) => (
                <TopicRow key={t.id} topic={t} today={today} />
              ))}
            </ul>
          )}
          {counts.encodingToday > 0 && (
            <button type="button" className="link-button" onClick={toEncoding}>
              + {pluralNovychTemat(counts.encodingToday)} s deadline dnes v Učím nové
            </button>
          )}
          {counts.taskToday > 0 && (
            <button type="button" className="link-button" onClick={toTasks}>
              + {pluralUkolu(counts.taskToday)} s deadline dnes v Úkolech
            </button>
          )}
        </section>
      )}

      {allTasks.length > 0 && (
        <section className="area-encoding" id="ukoly">
          <h2 className="area-title">
            Úkoly <span className="count">{tasks.length}</span>
          </h2>
          <p className="area-hint">Úkoly s deadline do {ENCODING_HORIZON_DAYS} dní nebo bez deadline</p>
          {tasks.length === 0 ? (
            <p className="empty small">Teď žádný úkol</p>
          ) : (
            <ul className="topics">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </ul>
          )}
          {moreTasks > 0 && (
            <button type="button" className="link-button" onClick={onOpenPredmety}>
              Další úkoly ({moreTasks}) v Předmětech
            </button>
          )}
        </section>
      )}

      <section className="area-encoding" id="ucim-nove">
        <h2 className="area-title">
          Učím nové <span className="count">{visibleEncoding.length}</span>
          {hiddenTopics > 0 && <span className="hidden-count">(+{hiddenTopics} skryto)</span>}
        </h2>
        <p className="area-hint">Neučená témata s deadline do {ENCODING_HORIZON_DAYS} dní</p>
        {encodingSubjects.length > 0 ? (
          <div className="subject-filter" role="group" aria-label="Předměty v Učím nové">
            {encodingSubjects.map((code) => (
              <label
                key={code}
                className={`subject-chip${hidden.includes(code) ? " subject-chip-off" : ""}`}
                title={SUBJECTS.find((s) => s.code === code)?.name}
              >
                <input type="checkbox" checked={!hidden.includes(code)} onChange={() => toggle(code)} />
                <span className={`badge badge-${code}`}>{code}</span>
              </label>
            ))}
          </div>
        ) : null}
        {hiddenHere.length > 0 && (
          <p className="hidden-note">
            {skrytoPredmetu(hiddenHere.length).replace(/^./, (c) => c.toUpperCase())}
            <button type="button" className="link-button" onClick={showAll}>
              Zobrazit vše
            </button>
          </p>
        )}
        {encoding.length === 0 ? (
          <p className="empty small">Nic k učení teď</p>
        ) : visibleEncoding.length === 0 ? (
          <p className="empty small">Všechny předměty jsou skryté</p>
        ) : (
          <ul className="topics">
            {visibleEncoding.map((t) => (
              <TopicRow key={t.id} topic={t} today={today} />
            ))}
          </ul>
        )}
        {moreEncoding > 0 && (
          <button type="button" className="link-button" onClick={onOpenPredmety}>
            Další neučená témata ({moreEncoding}) v Předmětech
          </button>
        )}
      </section>
    </>
  );
}
