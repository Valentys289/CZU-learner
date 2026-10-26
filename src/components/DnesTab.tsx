import type { Topic } from "../types";
import { dnesList } from "../lib/termin";
import { TopicRow } from "./TopicRow";

export function DnesTab({ topics, today }: { topics: Topic[]; today: string }) {
  const list = dnesList(topics);
  const overdue = list.filter((t) => t.dueState === "overdue");
  const dueToday = list.filter((t) => t.dueState === "today");

  if (list.length === 0) {
    return <p className="empty">Dnes nic k opakování</p>;
  }

  return (
    <>
      {overdue.length > 0 && (
        <section>
          <h2 className="section-title section-overdue">
            Po termínu <span className="count">{overdue.length}</span>
          </h2>
          <ul className="topics">
            {overdue.map((t) => (
              <TopicRow key={t.id} topic={t} today={today} />
            ))}
          </ul>
        </section>
      )}
      {dueToday.length > 0 && (
        <section>
          <h2 className="section-title">
            Dnes <span className="count">{dueToday.length}</span>
          </h2>
          <ul className="topics">
            {dueToday.map((t) => (
              <TopicRow key={t.id} topic={t} today={today} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
