export type SubjectCode = "M" | "CH" | "ICT" | "TD" | "UE" | "AJ";

export type Hotovo =
  | "Neučeno"
  | "večer"
  | "2 dny"
  | "5 dní"
  | "12 dní"
  | "měsíc";

export type DueState = "overdue" | "today" | "upcoming" | "none" | "done";

export type Topic = {
  id: string;
  url: string;
  subject: SubjectCode;
  title: string;
  hotovo: Hotovo | null;
  nauceno: string | null; // YYYY-MM-DD
  posledni: string | null;
  deadline: string | null;
  stav: string | null;
  poradi: number | null;
  odkaz: string | null;
  termin: string | null; // computed
  dueState: DueState;
};

export type SubjectError = { subject: SubjectCode; message: string };

export type TopicsResponse = {
  today: string; // YYYY-MM-DD in the configured timezone
  timeZone: string;
  topics: Topic[];
  errors: SubjectError[];
};
