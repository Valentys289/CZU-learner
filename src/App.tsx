import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Topic, TopicsResponse } from "./types";
import { DnesTab } from "./components/DnesTab";
import { PredmetyTab } from "./components/PredmetyTab";
import { TimelineTab } from "./components/TimelineTab";
import { formatToday } from "./lib/format";
import { dnesList, withTermin } from "./lib/termin";
import { applyAction, type TopicAction } from "./lib/hotovo";
import { TopicActionsContext, type TopicActions } from "./components/TopicActions";

type Tab = "dnes" | "predmety" | "timeline";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TopicsResponse };

export function App() {
  const [tab, setTab] = useState<Tab>("dnes");
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const replaceTopic = useCallback((topic: Topic) => {
    setState((s) =>
      s.status === "ready"
        ? { ...s, data: { ...s.data, topics: s.data.topics.map((t) => (t.id === topic.id ? topic : t)) } }
        : s,
    );
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
      } catch (err) {
        replaceTopic(topic);
        setToast(`Nepodařilo se uložit „${topic.title}“. ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(topic.id);
          return next;
        });
      }
    },
    [replaceTopic],
  );

  const actions = useMemo<TopicActions>(() => ({ run: (t, a) => void run(t, a), pending }), [run, pending]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/topics");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState({ status: "ready", data: json as TopicsResponse });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefreshing(false);
    }
  }, []);

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
        {state.status === "error" && (
          <div className="error">
            <strong>Chyba načítání</strong>
            <p>{state.message}</p>
          </div>
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
            {tab === "timeline" && <TimelineTab topics={state.data.topics} today={state.data.today} />}
          </TopicActionsContext.Provider>
        )}
      </main>

      {toast && (
        <div className="toast" role="alert">
          <p>{toast}</p>
          <button type="button" onClick={() => setToast(null)} aria-label="Zavřít">
            Zavřít
          </button>
        </div>
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
