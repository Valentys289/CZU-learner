import { useEffect, useState } from "react";
import type { DesktopBridge } from "../desktop";

/** First run of the desktop app (or a rejected token): ask for the Notion token once. */
export function TokenSetup({ bridge, reason, onSaved }: { bridge: DesktopBridge; reason: string; onSaved: () => void }) {
  const [token, setToken] = useState("");
  const [candidate, setCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void bridge.envCandidate().then(setCandidate, () => setCandidate(null));
  }, [bridge]);

  async function finish(p: Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await p.catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error ?? "Token se nepodařilo uložit");
  }

  return (
    <form
      className="setup"
      onSubmit={(e) => {
        e.preventDefault();
        void finish(bridge.saveToken(token.trim()));
      }}
    >
      <h2>Vlož Notion token</h2>
      <p className="setup-reason">{reason}</p>
      <p>
        Token integrace <strong>ČZU Study Dashboard</strong> najdeš v Notionu v Settings, Connections, Develop or manage
        integrations. Uloží se zašifrovaně (klíč drží Klíčenka macOS), ne do souboru v projektu.
      </p>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="ntn_..."
        value={token}
        onChange={(e) => setToken(e.target.value)}
        aria-label="Notion token"
      />
      <button type="submit" className="setup-primary" disabled={busy || token.trim().length < 20}>
        {busy ? "Ukládám…" : "Uložit a načíst"}
      </button>
      {candidate && (
        <button type="button" className="setup-secondary" disabled={busy} onClick={() => void finish(bridge.importEnvToken())}>
          Načíst z {candidate}
        </button>
      )}
      {error && <p className="setup-error">{error}</p>}
    </form>
  );
}
