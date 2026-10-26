import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Topic, TopicsResponse } from "./types";
import { DnesTab } from "./components/DnesTab";
import { PredmetyTab } from "./components/PredmetyTab";
import { TimelineTab } from "./components/TimelineTab";
import { formatToday } from "./lib/format";
import { dnesList, withTermin } from "./lib/termin";
import {
  applyAction,
  applyUndo,
  isUndoActive,
  UNDO_MS,
  type TopicAction,
  type UndoSnapshot,
} from "./lib/hotovo";
import { TopicActionsContext, type TopicActions } from "./components/TopicActions";
import { TokenSetup } from "./components/TokenSetup";
import { SessionSheet } from "./components/SessionSheet";
import { METHOD_LABEL, toPageId, type LastSession, type RetrievalMethod, type SessionWriteInput } from "./lib/sessions";
import { desktop } from "./desktop";

type Tab = "dnes" | "predmety" | "timeline";

/** `restoreLast`: the topic's skóre chip before a logged session, put back on undo. */
type Toast =
  | { kind: "error"; message: string }
  | { kind: "undo"; snapshot: UndoSnapshot; busy: boolean; restoreLast?: { last: LastSession | undefined } };

type Sheet = { topicId: string; method?: RetrievalMethod };

const isEmpty = (o: object) => Object.keys(o).length === 0;

const TOKEN_CODES = ["no-token", "bad-token"];

const ACTION_DONE: Record<TopicAction, string> = { hotovo: "Hotovo uloženo", nauceno: "Naučeno dnes" };

function removeFrom(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string; code?: string }
  | { status: "ready"; data: TopicsResponse };

export function App() {
  const [tab, setTab] = useState<Tab>("dnes");
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const bridge = desktop();
  const stateRef = useRef(state);
  stateRef.current = state;

  const replaceTopic = useCallback((topic: Topic) => {
    setState((s) =>
      s.status === "ready"
        ? { ...s, data: { ...s.data, topics: s.data.topics.map((t) => (t.id === topic.id ? topic : t)) } }
        : s,
    );
  }, []);

  const setLast = useCallback((topicId: string, last: LastSession | undefined) => {
    setState((s) => {
      if (s.status !== "ready") return s;
      const map = { ...s.data.treninky.last };
      if (last) map[toPageId(topicId)] = last;
      else delete map[toPageId(topicId)];
      return { ...s, data: { ...s.data, treninky: { ...s.data.treninky, last: map } } };
    });
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/topics");
      const json = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: json.error ?? `HTTP ${res.status}`, code: json.code });
        return;
      }
      setState({ status: "ready", data: json as TopicsResponse });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** Optimistic write: show the new step at once, then keep Notion's answer or revert. */
  const run = useCallback(
    async (topic: Topic, action: TopicAction) => {
      const current = stateRef.current;
      if (current.status !== "ready") return;
      const today = current.data.today;
      const result = applyAction(action, topic, today);
      if (!result) return;

      setToast(null);
      setPending((p) => new Set(p).add(topic.id));
      replaceTopic(withTermin({ ...topic, ...result.patch }, today));
      try {
        const res = await fetch(`/api/topics/${topic.id}/${action}`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        replaceTopic(json.topic as Topic);
        // Single slot: this write replaces any earlier undo.
        setToast({
          kind: "undo",
          busy: false,
          snapshot: {
            pageId: topic.id,
            previous: json.undo.previous,
            written: json.undo.written,
            label: `${ACTION_DONE[action]}: ${topic.title}`,
            expiresAt: Date.now() + UNDO_MS,
          },
        });
      } catch (err) {
        replaceTopic(topic);
        setToast({
          kind: "error",
          message: `Nepodařilo se uložit „${topic.title}“. ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setPending((p) => removeFrom(p, topic.id));
      }
    },
    [replaceTopic],
  );

  /**
   * Fáze 6: log a session from the sheet. Not optimistic: the sheet stays open
   * with "Ukládám…" and shows Notion's error in place. Resolves to an error or null.
   */
  const saveSession = useCallback(
    async (topic: Topic, input: SessionWriteInput): Promise<string | null> => {
      const current = stateRef.current;
      if (current.status !== "ready") return "Data nejsou načtená";
      const prevLast = current.data.treninky.last[toPageId(topic.id)];
      setToast(null);
      setPending((p) => new Set(p).add(topic.id));
      try {
        const res = await fetch(`/api/topics/${topic.id}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return json.error ?? `HTTP ${res.status}`;
        replaceTopic(json.topic as Topic);
        setLast(topic.id, { date: json.session.date, method: json.session.method, score: json.session.score });
        setSheet(null);
        const gap = !isEmpty(json.undo.written);
        setToast({
          kind: "undo",
          busy: false,
          restoreLast: { last: prevLast },
          snapshot: {
            pageId: topic.id,
            previous: json.undo.previous,
            written: json.undo.written,
            sessionId: json.undo.sessionId,
            label: `${METHOD_LABEL[input.method]}, skóre ${input.score}${gap ? ", gap posunut" : ""}: ${topic.title}`,
            expiresAt: Date.now() + UNDO_MS,
          },
        });
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      } finally {
        setPending((p) => removeFrom(p, topic.id));
      }
    },
    [replaceTopic, setLast],
  );

  /** Zpět: put the previous values back in Notion. On failure reload, so the UI matches Notion. */
  const undo = useCallback(
    async (snapshot: UndoSnapshot, restoreLast?: { last: LastSession | undefined }) => {
      const current = stateRef.current;
      if (current.status !== "ready" || !isUndoActive(snapshot, Date.now())) return;
      const topic = current.data.topics.find((t) => t.id === snapshot.pageId);
      if (!topic) return;

      setToast({ kind: "undo", snapshot, busy: true, restoreLast });
      setPending((p) => new Set(p).add(topic.id));
      replaceTopic(withTermin(applyUndo(topic, snapshot), current.data.today));
      try {
        const res = await fetch(`/api/topics/${topic.id}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEmpty(snapshot.written) ? {} : { previous: snapshot.previous, written: snapshot.written }),
            ...(snapshot.sessionId ? { sessionId: snapshot.sessionId } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        replaceTopic((json.topic as Topic | undefined) ?? topic);
        if (restoreLast) setLast(topic.id, restoreLast.last);
        setToast(null);
      } catch (err) {
        setToast({ kind: "error", message: `Vrátit se nepodařilo. ${err instanceof Error ? err.message : String(err)}` });
        void load();
      } finally {
        setPending((p) => removeFrom(p, topic.id));
      }
    },
    [replaceTopic, setLast, load],
  );

  // The undo toast disappears after 5 s (unless Zpět is already running).
  useEffect(() => {
    if (toast?.kind !== "undo" || toast.busy) return;
    const timer = setTimeout(() => setToast((t) => (t === toast ? null : t)), Math.max(0, toast.snapshot.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [toast]);

  const lastMap = state.status === "ready" ? state.data.treninky.last : undefined;
  const actions = useMemo<TopicActions>(
    () => ({
      run: (t, a) => void run(t, a),
      openSession: (t, method) => setSheet({ topicId: t.id, method }),
      pending,
      lastSession: (id) => lastMap?.[toPageId(id)],
    }),
    [run, pending, lastMap],
  );
  const sheetTopic = sheet && state.status === "ready" ? state.data.topics.find((t) => t.id === sheet.topicId) : undefined;
  const closeSheet = useCallback(() => setSheet(null), []);


  useEffect(() => {
    void load();
  }, [load]);

  const dueCount = state.status === "ready" ? dnesList(state.data.topics).length : 0;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Studium</h1>
          {state.status === "ready" && <p className="subtitle">{formatToday(state.data.today)}</p>}
        </div>
        <button type="button" className="refresh" onClick={() => void load()} disabled={refreshing}>
          {refreshing ? "Načítám…" : "Obnovit"}
        </button>
      </header>

      <main className="content">
        {state.status === "loading" && <p className="empty">Načítám z Notionu…</p>}
        {state.status === "error" && bridge && state.code && TOKEN_CODES.includes(state.code) ? (
          <TokenSetup
            bridge={bridge}
            reason={state.code === "no-token" ? "Aplikace zatím nemá Notion token." : state.message}
            onSaved={() => void load()}
          />
        ) : (
          state.status === "error" && (
            <div className="error">
              <strong>Chyba načítání</strong>
              <p>{state.message}</p>
            </div>
          )
        )}
        {state.status === "ready" && (
          <TopicActionsContext.Provider value={actions}>
            {state.data.errors.length > 0 && tab === "dnes" && (
              <div className="error">
                <strong>Některé předměty se nenačetly</strong>
                <p>{state.data.errors.map((e) => `${e.subject}: ${e.message}`).join(" · ")}</p>
              </div>
            )}
            {tab === "dnes" && <DnesTab topics={state.data.topics} today={state.data.today} />}
            {tab === "predmety" && (
              <PredmetyTab topics={state.data.topics} today={state.data.today} errors={state.data.errors} />
            )}
            {tab === "timeline" && (
              <TimelineTab topics={state.data.topics} milniky={state.data.milniky} today={state.data.today} />
            )}
          </TopicActionsContext.Provider>
        )}
      </main>

      {toast?.kind === "error" && (
        <div className="toast" role="alert">
          <p>{toast.message}</p>
          <button type="button" onClick={() => setToast(null)} aria-label="Zavřít">
            Zavřít
          </button>
        </div>
      )}
      {toast?.kind === "undo" && (
        <div className="toast toast-undo" role="status">
          <p>{toast.snapshot.label}</p>
          <button
            type="button"
            className="toast-undo-btn"
            disabled={toast.busy}
            onClick={() => void undo(toast.snapshot, toast.restoreLast)}
          >
            {toast.busy ? "Vracím…" : "Zpět"}
          </button>
        </div>
      )}

      {sheetTopic && state.status === "ready" && (
        <SessionSheet
          key={sheetTopic.id}
          topic={sheetTopic}
          today={state.data.today}
          initialMethod={sheet?.method}
          configured={state.data.treninky.configured}
          treninkyError={state.data.treninky.error}
          onClose={closeSheet}
          onSave={(input) => saveSession(sheetTopic, input)}
          onPlainHotovo={() => {
            setSheet(null);
            void run(sheetTopic, "hotovo");
          }}
        />
      )}

      <nav className="tabs" aria-label="Sekce">
        <TabButton active={tab === "dnes"} onClick={() => setTab("dnes")}>
          Dnes{dueCount > 0 && <span className="tab-count">{dueCount}</span>}
        </TabButton>
        <TabButton active={tab === "predmety"} onClick={() => setTab("predmety")}>
          Předměty
        </TabButton>
        <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
          Timeline
        </TabButton>
      </nav>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`tab${active ? " tab-active" : ""}`} aria-current={active} onClick={onClick}>
      {children}
    </button>
  );
}
