import type { Topic } from "../types";
import type { Milestone, MilnikyResponse } from "../timeline/types";
import { formatDate, relativeLabel } from "../lib/format";
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

/** Timeline = only Milníky cards. Learning topics stay on Dnes / Předměty. */
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
          <ul className="milestones">
            {upcoming.map((m) => (
              <MilestoneCard key={m.id} m={m} today={today} />
            ))}
          </ul>
        </section>
      )}
      {soft.length > 0 && (
        <section>
          <h2 className="section-title">
            Bez data <span className="count">{soft.length}</span>
          </h2>
          <ul className="milestones">
            {soft.map((m) => (
              <MilestoneCard key={m.id} m={m} today={today} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <details className="past">
          <summary className="section-title">
            Minulé <span className="count">{past.length}</span>
          </summary>
          <ul className="milestones">
            {past.map((m) => (
              <MilestoneCard key={m.id} m={m} today={today} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function When({ m, today }: { m: Milestone; today: string }) {
  const extra = [m.time && formatTime(m.time), m.place].filter(Boolean).join(" · ");
  if (m.conflictDates) {
    return (
      <p className="ms-when">
        {m.conflictDates.map((d) => formatDay(d, today)).join(" / ")}
        {extra && ` · ${extra}`}
        {groupOf(m, today) === "upcoming" && (
          <span className="ms-countdown">{relativeLabel(m.conflictDates[0], today)}</span>
        )}
      </p>
    );
  }
  if (!m.date) return <p className="ms-when ms-when-soft">{m.softText ?? "Bez data"}</p>;
  return (
    <p className="ms-when">
      {[formatDay(m.date, today), extra].filter(Boolean).join(" · ")}
      <span className="ms-countdown">{relativeLabel(m.date, today)}</span>
    </p>
  );
}

function MilestoneCard({ m, today }: { m: Milestone; today: string }) {
  const conflict = m.sources.includes("conflict");
  const phase = groupOf(m, today) === "upcoming" ? studyPhase(m, today) : null;

  return (
    <li className={`ms-card${m.date || m.conflictDates ? "" : " ms-soft"}${conflict ? " ms-conflict" : ""}`}>
      <div className="ms-head">
        <SubjectBadge code={m.subject} />
        <span className="ms-title">{m.title}</span>
        {conflict && <span className="ms-flag">Konflikt zdrojů</span>}
        {phase && <span className="ms-phase">{PHASE_LABEL[phase]}</span>}
      </div>
      <When m={m} today={today} />
      {m.softText && (m.date || m.conflictDates) && <p className="ms-note">{m.softText}</p>}
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
    </li>
  );
}
