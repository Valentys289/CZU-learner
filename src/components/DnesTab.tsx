import type { Topic } from "../types";
import { dnesList } from "../lib/termin";
import { ENCODING_HORIZON_DAYS, encodingDueSoon, isEncodingTopic } from "../lib/phase";
import { TopicRow } from "./TopicRow";

/**
 * Dnes: due retrieval (Po termínu, Dnes) and, separately, encoding work with a
 * Deadline in the next ENCODING_HORIZON_DAYS days (Učím nové). Other Neučeno
 * topics stay on Předměty.
 */
export function DnesTab({ topics, today, onOpenPredmety }: { topics: Topic[]; today: string; onOpenPredmety?: () => void }) {
  const list = dnesList(topics);
  const overdue = list.filter((t) => t.dueState === "overdue");
  const dueToday = list.filter((t) => t.dueState === "today");
  const encoding = encodingDueSoon(topics, today);
  const moreEncoding = topics.filter(isEncodingTopic).length - encoding.length;

  return (
    <>
      <h2 className="area-title">Opakování</h2>
      {list.length === 0 && <p className="empty small">Dnes nic k opakování</p>}
      {overdue.length > 0 && (
        <section>
          <h3 className="section-title section-overdue">
            Po termínu <span className="count">{overdue.length}</span>
          </h3>
          <ul className="topics">
            {overdue.map((t) => (
              <TopicRow key={t.id} topic={t} today={today} />
            ))}
          </ul>
        </section>
      )}
      {dueToday.length > 0 && (
        <section>
          <h3 className="section-title">
            Dnes <span className="count">{dueToday.length}</span>
          </h3>
          <ul className="topics">
            {dueToday.map((t) => (
              <TopicRow key={t.id} topic={t} today={today} />
            ))}
          </ul>
        </section>
      )}

      <section className="area-encoding">
        <h2 className="area-title">
          Učím nové <span className="count">{encoding.length}</span>
        </h2>
        <p className="area-hint">Neučená témata s deadline do {ENCODING_HORIZON_DAYS} dní</p>
        {encoding.length === 0 ? (
          <p className="empty small">Nic k učení teď</p>
        ) : (
          <ul className="topics">
            {encoding.map((t) => (
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
