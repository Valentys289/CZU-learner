import { useCallback, useEffect, useRef, useState } from "react";
import { desktop } from "../desktop";

function readLocal(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode or blocked storage: the choice lasts for this session only
  }
}

/**
 * A small on/off UI preference. localStorage for the web build; the desktop app
 * also mirrors it to userData/prefs.json (its localhost origin changes every launch),
 * like the hidden Učím nové subjects.
 */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    const raw = readLocal(key);
    return raw === null ? fallback : raw === "1";
  });
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    desktop()
      ?.prefGet?.(key)
      .then((raw) => {
        if (alive && !touched.current && raw !== null) setValue(raw === "1");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  const set = useCallback(
    (v: boolean) => {
      touched.current = true;
      setValue(v);
      writeLocal(key, v ? "1" : "0");
      desktop()?.prefSet?.(key, v ? "1" : "0").catch(() => {});
    },
    [key],
  );
  return [value, set];
}
