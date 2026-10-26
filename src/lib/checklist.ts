// Fáze checklist in the topic page body (Fáze 7 B). Pure helpers: the server
// flattens the page's blocks, this picks the to_do items under the known
// section markers. Headings are only read, never written or renamed.

/** One page body block, flattened in document order (children right after their parent). */
export type ChecklistBlock = {
  id: string;
  type: string;
  /** Plain text of the block's rich_text, as Notion has it. */
  text: string;
  /** to_do only. */
  checked?: boolean;
  archived?: boolean;
};

export type ChecklistItem = { blockId: string; text: string; checked: boolean };

export type ChecklistSectionKind = "encoding" | "retrieval" | "faze4";

export type ChecklistSection = { heading: string; kind: ChecklistSectionKind; items: ChecklistItem[] };

export type ChecklistResponse = { sections: ChecklistSection[] };

const HEADINGS = new Set(["heading_1", "heading_2", "heading_3", "heading_4"]);
/** Blocks whose text may carry a section marker. */
const MARKER_TYPES = new Set([...HEADINGS, "paragraph", "numbered_list_item", "bulleted_list_item", "toggle"]);

/** Lower case, no diacritics, no Markdown marks, single spaces. Only for matching, never shown. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*_`#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Which section a block starts, if any. Markers (matched on plain text, so bold
 * and stray spaces do not matter):
 * - encoding: a numbered list item "faze" (shows as "1. faze" in Notion), or any "1. faze" text
 * - retrieval: "3. Retrieval"
 * - faze4: "4. Fáze čtyři" (or just "4. Fáze")
 * The page's "## Fáze" heading is not a marker: it has no number.
 */
export function sectionMarker(block: Pick<ChecklistBlock, "type" | "text">): { kind: ChecklistSectionKind; heading: string } | null {
  if (!MARKER_TYPES.has(block.type)) return null;
  const n = normalizeText(block.text);
  const shown = block.text.replace(/\s+/g, " ").trim();
  if (/^3 ?\. ?retrieval\b/.test(n)) return { kind: "retrieval", heading: shown };
  if (/^4 ?\. ?faze\b/.test(n)) return { kind: "faze4", heading: shown };
  if (block.type === "numbered_list_item" && /^faze\b/.test(n)) return { kind: "encoding", heading: `1. ${shown}` };
  if (/^1 ?\. ?faze\b/.test(n)) return { kind: "encoding", heading: shown };
  return null;
}

/**
 * Group the to_do blocks under the known Fáze sections. A section runs from its
 * marker to the next marker or the next heading. to_do blocks anywhere else are
 * left out (never shown, never written). Missing sections are simply absent.
 */
export function parseChecklistSections(blocks: ChecklistBlock[]): ChecklistSection[] {
  const sections: ChecklistSection[] = [];
  let current: ChecklistSection | null = null;
  for (const block of blocks) {
    if (block.archived) continue;
    const marker = sectionMarker(block);
    if (marker) {
      current = { ...marker, items: [] };
      sections.push(current);
      continue;
    }
    if (HEADINGS.has(block.type)) {
      current = null;
      continue;
    }
    if (block.type === "to_do" && current) {
      current.items.push({ blockId: block.id, text: block.text.trim(), checked: block.checked === true });
    }
  }
  return sections;
}

type RichText = { plain_text?: string };
/** The minimal Notion block shape we read. */
export type NotionBlock = {
  object?: string;
  id: string;
  type: string;
  has_children?: boolean;
  archived?: boolean;
  in_trash?: boolean;
  [key: string]: unknown;
};

/** Notion API block → ChecklistBlock. Unsupported types keep their type with empty text. */
export function toChecklistBlock(block: NotionBlock): ChecklistBlock {
  const body = block[block.type] as { rich_text?: RichText[]; checked?: unknown } | undefined;
  const text = Array.isArray(body?.rich_text) ? body.rich_text.map((r) => r.plain_text ?? "").join("") : "";
  return {
    id: block.id,
    type: block.type,
    text,
    ...(block.type === "to_do" ? { checked: body?.checked === true } : {}),
    ...(block.archived || block.in_trash ? { archived: true } : {}),
  };
}

/** Block types whose children are read too (to_do items can sit inside them). Tables, pages, columns are not. */
export const CHECKLIST_RECURSE = new Set(["numbered_list_item", "bulleted_list_item", "to_do", "toggle", ...HEADINGS]);

/** PATCH /blocks/{id} body: only the checked state, never the text. */
export function checklistPatch(checked: boolean): { to_do: { checked: boolean } } {
  return { to_do: { checked } };
}

/** `{ checked: boolean }` from the browser, or null. */
export function parseCheckedBody(body: unknown): boolean | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const checked = (body as { checked?: unknown }).checked;
  return typeof checked === "boolean" ? checked : null;
}

/** Item lookup by block ID (dashes and case do not matter). */
export function findChecklistItem(sections: ChecklistSection[], blockId: string): ChecklistItem | undefined {
  const key = blockId.replace(/-/g, "").toLowerCase();
  for (const s of sections) {
    const item = s.items.find((i) => i.blockId.replace(/-/g, "").toLowerCase() === key);
    if (item) return item;
  }
  return undefined;
}

export const CHECKLIST_SAVE_ERROR = "Nepodařilo se uložit checklist";
