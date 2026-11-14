import { useMemo } from "react";
import type { Topic } from "../types";
import type { MilnikyResponse } from "../timeline/types";
import { buildTimeline } from "../timeline/milestones";
import { dueBlock, examPrep, weekAhead, learnedThisMonth, recentlyLearned, reviewDay } from "../lib/block";
import type { LastSession } from "../lib/sessions";
import { pluralDny, pluralTemat, relativeLabel } from "../lib/format";
import { SubjectBadge } from "./SubjectBadge";
import { useTopicActions } from "./TopicActions";
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
export function DnesTab({
  topics,
  today,
  milniky,
  last = {},
  onOpenPredmety,
}: {
  topics: Topic[];
  today: string;
  milniky?: MilnikyResponse;
  last?: Record<string, LastSession>;
  onOpenPredmety?: () => void;
}) {
  const actions = useTopicActions();
  // Fáze 11: guided block over today's retrieval, Před testem from Milníky, weekly / monthly review.
  const block = dueBlock(topics);
  const milestones = useMemo(() => (milniky ? buildTimeline(topics, milniky, today).milestones : []), [topics, milniky, today]);
  const preps = useMemo(() => examPrep(milestones, topics, last, today), [milestones, topics, last, today]);
  const ahead = weekAhead(topics, milestones, today);
  const aheadMax = Math.max(1, ...ahead.map((d) => d.retrieval));
  // Blíží se: the next dated milestones within 30 days (the full list is on Timeline).
  const soon = milestones.filter((m) => m.date !== null && m.date >= today && m.date <= addDays(today, 30)).slice(0, 5);
  const week = recentlyLearned(topics, today);
  const month = learnedThisMonth(topics, today);
  const review = reviewDay(today);
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
    <div className="dnes-grid">
      <div className="dnes-col">
      {actions && block.length > 0 && (
        <button type="button" className="block-start" onClick={() => actions.startBlock("Dnešní blok", block)}>
          <span className="block-start-main">Začít blok</span>
          <span className="block-start-sub">
            {pluralTemat(block.length)} napříč předměty, jedno po druhém
          </span>
        </button>
      )}

      {preps.map((p) => (
        <section key={p.milestone.id} className="prep">
          <h3 className="prep-title">
            <SubjectBadge code={p.milestone.subject} />
            <span className="prep-name">Před testem: {p.milestone.title}</span>
            <span className="prep-when">{p.daysLeft === 0 ? "dnes" : p.daysLeft === 1 ? "zítra" : `za ${pluralDny(p.daysLeft)}`}</span>
          </h3>
          <p className="area-hint">
            Zopakováno {p.reviewed} z {p.learned}
            {p.unlearned > 0 && `, ${p.unlearned} ještě neučeno`}
            {p.todo.length > 0 && `. Na dnes stačí ${p.perDay}.`}
          </p>
          {p.todo.length === 0 ? (
            <p className="empty small">{p.learned > 0 ? "Všechno naučené máš zopakované" : "Zatím nic naučeného k opakování"}</p>
          ) : (
            actions && (
              <div className="prep-actions">
                <button type="button" className="topic-action" onClick={() => actions.startBlock(`Před testem: ${p.milestone.title}`, p.todo.slice(0, p.perDay))}>
                  Dnešní dávka ({p.perDay})
                </button>
                {p.todo.length > p.perDay && (
                  <button
                    type="button"
                    className="topic-action topic-action-secondary"
                    onClick={() => actions.startBlock(`Před testem: ${p.milestone.title}`, p.todo)}
                  >
                    Všechno ({p.todo.length})
                  </button>
                )}
              </div>
            )
          )}
        </section>
      ))}

      {actions && (week.length > 0 || (review.monthly && month.length > 0)) && (
        <div className={`reviews${review.weekly || review.monthly ? " reviews-on" : ""}`}>
          {week.length > 0 && (
            <button type="button" className="link-button" onClick={() => actions.startBlock("Týdenní revize", week)}>
              Týdenní revize ({pluralTemat(week.length)} z posledních 7 dní)
            </button>
          )}
          {review.monthly && month.length > 0 && (
            <button type="button" className="link-button" onClick={() => actions.startBlock("Měsíční revize", month)}>
              Měsíční revize ({pluralTemat(month.length)} z tohoto měsíce)
            </button>
          )}
          {(review.weekly || review.monthly) && <p className="area-hint">Dnes je den na revizi. Je to jen trénink, intervaly se nemění.</p>}
        </div>
      )}

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

      </div>

      <div className="dnes-col dnes-col-new">
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
      </div>

      <aside className="dnes-col dnes-side">
        <section>
          <h2 className="area-title">Výhled</h2>
          <p className="area-hint">Opakování v dalších 7 dnech</p>
          <ol className="ahead" aria-label="Opakování v dalších 7 dnech">
            {ahead.map((d) => (
              <li key={d.date} className={`ahead-day${d.tests.length > 0 ? " ahead-test" : ""}`} title={d.tests.join(", ") || undefined}>
                <span className="ahead-count">{d.retrieval}</span>
                <span className="ahead-bar" aria-hidden="true">
                  <span style={{ height: `${Math.round((d.retrieval / aheadMax) * 100)}%` }} />
                </span>
                <span className="ahead-label">{weekdayShort(d.date)}</span>
                {d.tests.length > 0 && <span className="ahead-flag">test</span>}
              </li>
            ))}
          </ol>
        </section>
        {soon.length > 0 && (
          <section>
            <h2 className="area-title">Blíží se</h2>
            <ul className="soon">
              {soon.map((m) => (
                <li key={m.id}>
                  <SubjectBadge code={m.subject} />
                  <span className="soon-title">{m.title}</span>
                  <span className="soon-when">{m.date ? relativeLabel(m.date, today) : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function weekdayShort(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
