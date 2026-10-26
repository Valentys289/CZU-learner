import type { SubjectCode } from "../types";

export type SubjectConfig = {
  code: SubjectCode;
  name: string;
  pageId: string;
  /** Inline database block ID. This is what the Notion API queries. */
  databaseId: string;
  /**
   * Notion's internal collection ID (as seen in collection:// URLs). Not a valid
   * API data source ID: querying it returns 404. Kept for reference only.
   */
  collectionId: string;
};

export const SUBJECTS: SubjectConfig[] = [
  {
    code: "M",
    name: "Matematika",
    pageId: "3ee196f4-c84e-814b-bfc6-cf6734c0b81a",
    databaseId: "58c6bc0a-a6e2-4463-9497-4b3ead3c62d5",
    collectionId: "9defdb0c-8fe4-49fe-bec2-bcced09a161d",
  },
  {
    code: "CH",
    name: "Chemie",
    pageId: "3ee196f4-c84e-8117-8d5d-cd90b558dcfa",
    databaseId: "44ee8c0b-067b-4d55-8b2f-7513356bb245",
    collectionId: "33a638c6-e8a3-47c8-a13e-cc645ecc96a7",
  },
  {
    code: "ICT",
    name: "Informatika",
    pageId: "3ee196f4-c84e-8029-9542-f645d6ba61c5",
    databaseId: "6de1da79-7574-44a4-a7bc-3b7cb23c3715",
    collectionId: "b2a9d095-4b31-4a3d-9a21-90edc0a3060b",
  },
  {
    code: "TD",
    name: "Technická dokumentace",
    pageId: "3ee196f4-c84e-80ba-a97e-e1d994d758dd",
    databaseId: "09d8e793-3e5a-4c86-9b98-bf1647a142ea",
    collectionId: "1e4f5234-0705-4331-854c-f0b31d3a2ff1",
  },
  {
    code: "UE",
    name: "Udržitelná energetika",
    pageId: "3ee196f4-c84e-810f-89a1-f09817344f5b",
    databaseId: "0281606c-8db6-4bde-b030-49e30a1c09db",
    collectionId: "7b732ab0-5554-41db-8356-4a5fc531e766",
  },
  {
    code: "AJ",
    name: "Angličtina",
    pageId: "3ee196f4-c84e-813d-869b-e43d4bb7745a",
    databaseId: "8c9258f5-e060-421c-9a89-84ae4d263c9b",
    collectionId: "7805fb3f-692d-467e-8f9d-891684e9f661",
  },
];

export const HUB = {
  pageId: "3ed196f4-c84e-813c-91c0-d8d83310b500",
  predmetyDatabaseId: "820212ad-dbb3-4c70-b7ca-ff4a64a86025",
  predmetyCollectionId: "d7dc58ab-50c1-41e5-b89c-56555930ba2f",
};

export const DEFAULT_TIME_ZONE = "Europe/Prague";

/** Property names, identical on all 6 Témata databases. */
export const PROP = {
  tema: "Téma",
  hotovo: "Hotovo",
  posledni: "Poslední opakování",
  nauceno: "Naučeno",
  deadline: "Deadline",
  stav: "Stav",
  poradi: "Pořadí",
  odkaz: "Odkaz",
} as const;
