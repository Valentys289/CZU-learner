import { useCallback, useEffect, useRef, useState } from "react";
import type { SubjectCode } from "../types";
import { desktop } from "../desktop";
import { HIDDEN_KEY, loadHidden, parseHidden, saveHidden, serializeHidden } from "../lib/hidden";

const browserStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/**
 * Hidden Učím nové subjects. localStorage (`ucimNove.hidden`) for the web build; the
 * desktop app also mirrors it to userData/prefs.json, because its localhost port (and so
 * its localStorage origin) changes on every launch.
 */
export function useHiddenSubjects() {
  const [hidden, setHidden] = useState<SubjectCode[]>(() => loadHidden(browserStorage()));
  const touched = useRef(false);

  useEffect(() => {
    const bridge = desktop();
    if (!bridge?.prefGet) return;
    let alive = true;
    bridge
      .prefGet(HIDDEN_KEY)
      .then((raw) => {
        if (alive && !touched.current && raw !== null) setHidden(parseHidden(raw));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((next: SubjectCode[]) => {
    touched.current = true;
    setHidden(next);
    saveHidden(browserStorage(), next);
    desktop()?.prefSet?.(HIDDEN_KEY, serializeHidden(next)).catch(() => {});
  }, []);

  const toggle = useCallback(
    (code: SubjectCode) => update(hidden.includes(code) ? hidden.filter((c) => c !== code) : [...hidden, code]),
    [hidden, update],
  );
  const showAll = useCallback(() => update([]), [update]);

  return { hidden, toggle, showAll };
}
