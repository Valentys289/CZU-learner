import type { MilnikyRow } from "./types";

/**
 * TEMPORARY fallback, used only while the Notion Milníky DB ID is missing from
 * src/notion/config.ts. The UI shows a loud banner whenever this is used.
 * Delete this file once DEKAN's Milníky DB is wired in. The source of truth for
 * dates is Notion Milníky, not this list.
 */
const row = (r: Partial<MilnikyRow> & Pick<MilnikyRow, "id" | "nazev" | "predmet" | "typ">): MilnikyRow => ({
  url: null,
  datum: null,
  cas: null,
  misto: null,
  softText: null,
  konfliktData: null,
  aktivni: true,
  poznamka: null,
  progressTemata: null,
  poradi: null,
  linkPlan: null,
  ...r,
});

export const BASELINE_FALLBACK: MilnikyRow[] = [
  row({ id: "m-test-1", nazev: "Zápočtový test 1", predmet: "Matematika", typ: "test", datum: "2026-10-25", cas: "08:45", misto: "MI", poznamka: "Původní termín" }),
  row({
    id: "m-test-2",
    nazev: "Zápočtový test 2",
    predmet: "Matematika",
    typ: "test",
    datum: "2026-12-05",
    cas: "08:45",
    misto: "MI",
    poznamka: "Stejný slot: opravný test 1",
    progressTemata: "Reálné funkce jedné proměnné\nInverzní funkce\nLimity a spojitost\nAsymptoty\nVýpočet derivací",
    linkPlan: "https://cursor.com/canvas/store-dfeb3461-eb69-4497-b353-2632ad43e351/f152da4e-5582-42b3-95ee-e2c6b6e925b5",
  }),
  row({ id: "m-test-3", nazev: "Zápočtový test 3", predmet: "Matematika", typ: "test", datum: "2027-01-07", cas: "07:50", misto: "MI", poznamka: "Jen pokud je stále v programu" }),
  row({ id: "m-test-4", nazev: "Zápočtový test 4", predmet: "Matematika", typ: "test", datum: "2027-01-08", cas: "07:50", misto: "MI", poznamka: "Jen pokud je stále v programu" }),
  row({ id: "ch-pisemka", nazev: "Zápočtová písemka / cvičení", predmet: "Chemie", typ: "zapocet", datum: "2027-01-05", cas: "08:45–11:45", misto: "ZII", konfliktData: "2027-01-05,2027-01-06" }),
  row({ id: "aj-zapocet", nazev: "Zápočtový test", predmet: "Angličtina", typ: "zapocet", datum: "2027-01-04", cas: "13:00–14:15" }),
  row({ id: "ict-esej", nazev: "Esej", predmet: "Informatika", typ: "soft", softText: "Konec listopadu" }),
  row({ id: "ict-excel-1", nazev: "Excel 1. pokus", predmet: "Informatika", typ: "soft", softText: "Začátek prosince" }),
  row({ id: "ict-excel-opravny", nazev: "Excel opravný", predmet: "Informatika", typ: "test", datum: "2027-01-06", misto: "TF M 217/1" }),
  row({ id: "ict-uis", nazev: "UIS zápis zápočtu", predmet: "Informatika", typ: "soft", datum: "2027-02-05" }),
  row({ id: "ue-dochazka", nazev: "Zápočet = docházka", predmet: "Udržitelná energetika", typ: "dochazka", softText: "Docházka (max 2 absence)" }),
];
