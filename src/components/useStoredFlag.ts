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

/** A small whole-number preference (Fáze 12: how many extras the block adds), stored like useStoredFlag. */
export function useStoredNumber(key: string, fallback: number, allowed: readonly number[]): [number, (v: number) => void] {
  const parse = (raw: string | null) => {
    const n = raw === null ? NaN : Number(raw);
    return allowed.includes(n) ? n : null;
  };
  const [value, setValue] = useState(() => parse(readLocal(key)) ?? fallback);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    desktop()
      ?.prefGet?.(key)
      .then((raw) => {
        const n = parse(raw);
        if (alive && !touched.current && n !== null) setValue(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  const set = useCallback(
    (v: number) => {
      touched.current = true;
      setValue(v);
      writeLocal(key, String(v));
      desktop()?.prefSet?.(key, String(v)).catch(() => {});
    },
    [key],
  );
  return [value, set];
}
