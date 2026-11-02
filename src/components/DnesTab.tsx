import type { Topic } from "../types";
import { dnesList } from "../lib/termin";
import { dueCounts, ENCODING_HORIZON_DAYS, encodingDueSoon, isEncodingTopic } from "../lib/phase";
import { pluralNovychTemat } from "../lib/format";
import { TopicRow } from "./TopicRow";

/**
 * Dnes: due retrieval (Po termínu, Dnes) and, separately, encoding work with a
 * Deadline in the next ENCODING_HORIZON_DAYS days (Učím nové). Other Neučeno
 * topics stay on Předměty. Encoding topics past (or at) their Deadline count into Po termínu
 * (or Dnes) but stay listed under Učím nové, where Naučeno dnes is the action.
 */
export function DnesTab({ topics, today, onOpenPredmety }: { topics: Topic[]; today: string; onOpenPredmety?: () => void }) {
  const list = dnesList(topics); // retrieval only, unchanged
  const overdue = list.filter((t) => t.dueState === "overdue");
  const dueToday = list.filter((t) => t.dueState === "today");
  const encoding = encodingDueSoon(topics, today);
  const moreEncoding = topics.filter(isEncodingTopic).length - encoding.length;
  const counts = dueCounts(topics, today);
  const toEncoding = () => document.getElementById("ucim-nove")?.scrollIntoView({ behavior: "smooth", block: "start" });

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
        </section>
      )}

      <section className="area-encoding" id="ucim-nove">
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
