import { useEffect, useState } from "react";
import type { DesktopBridge, DesktopSettingsInfo } from "../desktop";
import { isValidTime, type NotifySettings, type Reminder } from "../lib/notify";

/**
 * Fáze 9 A: Nastavení (desktop app only). Stored by the main process in
 * userData/settings.json; every change is saved at once.
 */
export function NastaveniTab({ bridge }: { bridge: DesktopBridge }) {
  const [info, setInfo] = useState<DesktopSettingsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    bridge.getSettings().then(
      (i) => (i ? setInfo(i) : setError("Nastavení se nepodařilo načíst")),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );
  }, [bridge]);

  if (error) return <div className="error"><strong>Nastavení</strong><p>{error}</p></div>;
  if (!info) return <p className="empty">Načítám nastavení…</p>;
  const s = info.settings;

  async function save(next: NotifySettings) {
    setInfo((i) => (i ? { ...i, settings: next } : i));
    setStatus(null);
    try {
      const stored = await bridge.saveSettings(next);
      if (!stored) throw new Error("Nastavení se nepodařilo uložit");
      setInfo((i) => (i ? { ...i, settings: stored } : i));
      setStatus("Uloženo");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  const setReminder = (kind: "morning" | "evening", patch: Partial<Reminder>) =>
    void save({ ...s, [kind]: { ...s[kind], ...patch } });

  async function test() {
    setTesting(true);
    setStatus(null);
    const res = await bridge.testNotification().catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    setTesting(false);
    setStatus(res.ok ? "Notifikace odeslána" : (res.error ?? "Notifikaci se nepodařilo poslat"));
  }

  return (
    <div className="settings">
      <h2 className="area-title">Nastavení</h2>

      <section className="settings-group">
        <h3 className="section-title">Spouštění</h3>
        <label className="settings-row">
          <input type="checkbox" checked={s.openAtLogin} onChange={(e) => void save({ ...s, openAtLogin: e.target.checked })} />
          <span>Spouštět po přihlášení</span>
        </label>
        <p className="settings-hint">
          Zavřením okna aplikace neskončí, běží dál v menu baru (ikona knihy). Ukončíš ji přes ikonu v menu baru, Ukončit, nebo Cmd+Q.
          {!info.packaged && " Ve vývojové verzi se spouštění po přihlášení nenastavuje."}
        </p>
      </section>

      <section className="settings-group">
        <h3 className="section-title">Notifikace</h3>
        <ReminderRow
          label="Ranní souhrn"
          hint="Kolik je dnes témat a kolik po termínu. Zmeškaný (Mac spal) přijde po probuzení, nejpozději do 12:00."
          reminder={s.morning}
          onChange={(p) => setReminder("morning", p)}
        />
        <ReminderRow
          label="Večerní připomínka"
          hint="Co dnes zbývá neodškrtnuté, nebo Dnes hotovo."
          reminder={s.evening}
          onChange={(p) => setReminder("evening", p)}
        />
        {!info.notificationsSupported && <p className="settings-hint settings-bad">Notifikace tady nejsou podporované.</p>}
        <p className="settings-hint">
          Když notifikace nechodí, povol je v Nastavení systému › Oznámení › CZU Study Dashboard.
          {!info.packaged && " Ve vývojové verzi se notifikace hlásí jako Electron."}
        </p>
        <div className="settings-actions">
          <button type="button" className="refresh" onClick={() => void bridge.openNotificationSettings()}>
            Otevřít Nastavení systému
          </button>
          <button type="button" className="refresh" onClick={() => void test()} disabled={testing}>
            {testing ? "Posílám…" : "Vyzkoušet notifikaci"}
          </button>
        </div>
      </section>

      {status && (
        <p className="settings-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

function ReminderRow({
  label,
  hint,
  reminder,
  onChange,
}: {
  label: string;
  hint: string;
  reminder: Reminder;
  onChange: (patch: Partial<Reminder>) => void;
}) {
  const [time, setTime] = useState(reminder.time);
  useEffect(() => setTime(reminder.time), [reminder.time]);
  return (
    <div className="settings-reminder">
      <div className="settings-row">
        <label className="settings-row-main">
          <input type="checkbox" checked={reminder.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          <span>{label}</span>
        </label>
        <input
          type="time"
          step={60}
          value={time}
          disabled={!reminder.enabled}
          aria-label={`${label}, čas`}
          onChange={(e) => {
            setTime(e.target.value);
            if (isValidTime(e.target.value)) onChange({ time: e.target.value });
          }}
        />
      </div>
      <p className="settings-hint">{hint}</p>
    </div>
  );
}
