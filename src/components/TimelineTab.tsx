import type { Topic } from "../types";
import type { Milestone, MilnikyResponse } from "../timeline/types";
import { formatDate, relativeLabel } from "../lib/format";
import { daysBetween } from "../lib/termin";
import { buildTimeline, groupOf, studyPhase } from "../timeline/milestones";
import { SubjectBadge } from "./SubjectBadge";

const PHASE_LABEL = { A: "Fáze A", "A-done": "Fáze A splněna", B: "Fáze B" } as const;

/** "so 5. 12." */
function formatDay(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("cs-CZ", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return `${weekday} ${formatDate(date, today)}`;
}

const formatTime = (time: string) => time.replace(/^0(\d:)/, "$1");

/** Timeline = a compact list of Milníky sorted by deadline; details expand on click. Learning topics stay on Dnes / Předměty. */
export function TimelineTab({ topics, milniky, today }: { topics: Topic[]; milniky: MilnikyResponse; today: string }) {
  const { milestones, skipped } = buildTimeline(topics, milniky, today);
  const upcoming = milestones.filter((m) => groupOf(m, today) === "upcoming");
  const soft = milestones.filter((m) => groupOf(m, today) === "soft");
  const past = milestones.filter((m) => groupOf(m, today) === "past");

  return (
    <>
      {milniky.error && (
        <div className="error" role="alert">
          <strong>{milniky.source === "unconfigured" ? "Chybí Milníky DB" : "Milníky z Notionu se nenačetly"}</strong>
          <p>{milniky.error}</p>
        </div>
      )}
      {skipped.length > 0 && (
        <div className="error" role="status">
          <strong>Některé milníky mají neznámý předmět</strong>
          <p>{skipped.join(" · ")}</p>
        </div>
      )}

      {milestones.length === 0 && !milniky.error && <p className="empty">Žádné termíny v Notion Milníky</p>}

      {upcoming.length > 0 && (
        <section>
          <h2 className="section-title">
            Blížící se <span className="count">{upcoming.length}</span>
          </h2>
          <ul className="ms-list">
            {upcoming.map((m) => (
              <MilestoneRow key={m.id} m={m} today={today} />
            ))}
          </ul>
        </section>
      )}
      {soft.length > 0 && (
        <section>
          <h2 className="section-title">
            Bez data <span className="count">{soft.length}</span>
          </h2>
          <ul className="ms-list">
            {soft.map((m) => (
              <MilestoneRow key={m.id} m={m} today={today} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <details className="past">
          <summary className="section-title">
            Minulé <span className="count">{past.length}</span>
          </summary>
          <ul className="ms-list">
            {past.map((m) => (
              <MilestoneRow key={m.id} m={m} today={today} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** First relevant date of a milestone (a conflict uses its earliest date). */
const dateOf = (m: Milestone) => m.conflictDates?.[0] ?? m.date ?? null;

/** Full "when" line for the expanded detail: all dates, time and place. */
function whenDetail(m: Milestone, today: string): string | null {
  const dates = m.conflictDates ?? (m.date ? [m.date] : []);
  if (dates.length === 0) return null;
  const extra = [m.time && formatTime(m.time), m.place].filter(Boolean);
  return [dates.map((d) => formatDay(d, today)).join(" / "), ...extra].join(" · ");
}

function MilestoneRow({ m, today }: { m: Milestone; today: string }) {
  const conflict = m.sources.includes("conflict");
  const upcoming = groupOf(m, today) === "upcoming";
  const phase = upcoming ? studyPhase(m, today) : null;
  const date = dateOf(m);
  const days = date ? daysBetween(today, date) : null;
  const soon = upcoming && days !== null && days <= 7;
  const when = whenDetail(m, today);

  return (
    <li className={`ms-row${date ? "" : " ms-soft"}${conflict ? " ms-conflict" : ""}`}>
      <details>
        <summary>
          <SubjectBadge code={m.subject} />
          <span className="ms-title">
            {m.title}
            {conflict && (
              <span className="ms-dot" title="Konflikt zdrojů" aria-label="Konflikt zdrojů">
                !
              </span>
            )}
          </span>
          {date ? (
            <>
              <span className="ms-date">{formatDay(date, today)}</span>
              <span className={`ms-countdown${soon ? " ms-soon" : ""}`}>{relativeLabel(date, today)}</span>
            </>
          ) : (
            <span className="ms-date ms-date-soft">{m.softText ?? "Bez data"}</span>
          )}
          <span className="ms-chevron" aria-hidden="true" />
        </summary>

        <div className="ms-detail">
          {(conflict || phase) && (
            <div className="ms-tags">
              {conflict && <span className="ms-flag">Konflikt zdrojů</span>}
              {phase && <span className="ms-phase">{PHASE_LABEL[phase]}</span>}
            </div>
          )}
          {when && <p className="ms-when">{when}</p>}
          {m.softText && date && <p className="ms-note">{m.softText}</p>}
          {m.note && <p className="ms-note">{m.note}</p>}

          {m.progress && (
            <>
              <div className="ms-progress">
                <div
                  className="bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={m.progress.total}
                  aria-valuenow={m.progress.done}
                >
                  <span style={{ width: `${Math.round(m.progress.pct * 100)}%` }} />
                </div>
                <span className="ms-progress-label">
                  {m.progress.done}/{m.progress.total} Naučeno
                </span>
              </div>
              <ul className="bundles">
                {m.progress.items.map((i) => (
                  <li
                    key={i.title}
                    className={`chip${i.done ? " chip-done" : ""}`}
                    title={i.topicId ? undefined : "Téma v Notionu nenalezeno"}
                  >
                    {i.done ? "✓ " : ""}
                    {i.title}
                    {!i.topicId && " ?"}
                  </li>
                ))}
              </ul>
            </>
          )}

          {m.linkOut.length > 0 && (
            <div className="ms-links">
              {m.linkOut.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
