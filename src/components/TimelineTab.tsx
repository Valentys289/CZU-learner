import type { Topic } from "../types";
import { formatDate, relativeLabel } from "../lib/format";
import { buildTimeline, groupOf, mathTest2Phase, type TimelineEntry } from "../timeline/milestones";
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

const formatTime = (time: string) => time.replace(/^0/, "");

export function TimelineTab({ topics, today }: { topics: Topic[]; today: string }) {
  const entries = buildTimeline(topics, today);
  const upcoming = entries.filter((m) => groupOf(m, today) === "upcoming");
  const soft = entries.filter((m) => groupOf(m, today) === "soft");
  const past = entries.filter((m) => groupOf(m, today) === "past");

  if (entries.length === 0) return <p className="empty">Žádné termíny v Notion ani baseline</p>;

  return (
    <>
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

function When({ m, today }: { m: TimelineEntry; today: string }) {
  if (m.conflictDates) {
    return (
      <p className="ms-when">
        {m.conflictDates.map((d) => formatDay(d, today)).join(" / ")}
        {groupOf(m, today) === "upcoming" && (
          <span className="ms-countdown">{relativeLabel(m.conflictDates[0], today)}</span>
        )}
      </p>
    );
  }
  if (!m.date) return <p className="ms-when ms-when-soft">{m.text ?? "Bez data"}</p>;
  return (
    <p className="ms-when">
      {[formatDay(m.date, today), m.time && formatTime(m.time), m.place].filter(Boolean).join(" · ")}
      <span className="ms-countdown">{relativeLabel(m.date, today)}</span>
    </p>
  );
}

function MilestoneCard({ m, today }: { m: TimelineEntry; today: string }) {
  const conflict = m.sources.includes("conflict");
  const note = m.date || m.conflictDates ? m.text : null;
  const phase = m.math ? mathTest2Phase(today, m.math.done) : null;

  return (
    <li className={`ms-card${m.date || m.conflictDates ? "" : " ms-soft"}${conflict ? " ms-conflict" : ""}`}>
      <div className="ms-head">
        <SubjectBadge code={m.subject} />
        <span className="ms-title">{m.title}</span>
        {conflict && <span className="ms-flag">Konflikt zdrojů</span>}
        {phase && groupOf(m, today) === "upcoming" && <span className="ms-phase">{PHASE_LABEL[phase]}</span>}
      </div>
      <When m={m} today={today} />
      {note && <p className="ms-note">{note}</p>}

      {m.progress && (
        <div className="ms-progress">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={m.progress.total} aria-valuenow={m.progress.done}>
            <span style={{ width: `${Math.round(m.progress.pct * 100)}%` }} />
          </div>
          <span className="ms-progress-label">
            {m.progress.done}/{m.progress.total} Naučeno{m.math ? "" : " témat"}
          </span>
        </div>
      )}
      {m.math && (
        <ul className="bundles">
          {m.math.bundles.map((b) => (
            <li key={b.name} className={`chip${b.done ? " chip-done" : ""}`} title={b.found ? undefined : "Téma v Notionu nenalezeno"}>
              {b.done ? "✓ " : ""}
              {b.name}
              {!b.found && " ?"}
            </li>
          ))}
        </ul>
      )}

      {m.linkOut && m.linkOut.length > 0 && (
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
