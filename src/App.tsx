import { useCallback, useEffect, useState } from "react";
import type { TopicsResponse } from "./types";
import { DnesTab } from "./components/DnesTab";
import { PredmetyTab } from "./components/PredmetyTab";
import { formatToday } from "./lib/format";
import { dnesList } from "./lib/termin";

type Tab = "dnes" | "predmety" | "timeline";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TopicsResponse };

export function App() {
  const [tab, setTab] = useState<Tab>("dnes");
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

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
          <>
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
            {tab === "timeline" && <p className="empty">Timeline přijde ve Fázi 3</p>}
          </>
        )}
      </main>

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
