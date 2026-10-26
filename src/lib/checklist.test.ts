import { describe, expect, it } from "vitest";
import {
  checklistPatch,
  findChecklistItem,
  normalizeText,
  parseCheckedBody,
  parseChecklistSections,
  sectionMarker,
  toChecklistBlock,
  type ChecklistBlock,
} from "./checklist";

const todo = (id: string, text: string, checked = false): ChecklistBlock => ({ id, type: "to_do", text, checked });

// The body of a real topic page (Goniometrie), flattened as the server reads it.
const body: ChecklistBlock[] = [
  { id: "h-faze", type: "heading_2", text: "Fáze" },
  { id: "n1", type: "numbered_list_item", text: "faze" },
  todo("t1", "read with understanding"),
  todo("t2", "Find new words", true),
  { id: "n2", type: "numbered_list_item", text: "faze" },
  todo("t3", "Deep processing "),
  todo("t4", "Simplify notes"),
  todo("t5", "hard thinking"),
  todo("t6", "Mid-maps"),
  { id: "h3", type: "heading_3", text: "3. Retrieval" },
  todo("t7", "flashcards"),
  todo("t8", "Generated Qs"),
  { id: "h4", type: "heading_3", text: "4. Fáze čtyři" },
  todo("t9", "brain dump"),
  { id: "tbl", type: "table", text: "" },
  { id: "p", type: "paragraph", text: "" },
];

describe("parseChecklistSections", () => {
  it("groups a real topic page into the four sections, verbatim", () => {
    const sections = parseChecklistSections(body);
    expect(sections.map((s) => [s.kind, s.heading, s.items.map((i) => i.text)])).toEqual([
      ["encoding", "1. faze", ["read with understanding", "Find new words"]],
      ["encoding", "1. faze", ["Deep processing", "Simplify notes", "hard thinking", "Mid-maps"]],
      ["retrieval", "3. Retrieval", ["flashcards", "Generated Qs"]],
      ["faze4", "4. Fáze čtyři", ["brain dump"]],
    ]);
    expect(sections[0].items[1]).toEqual({ blockId: "t2", text: "Find new words", checked: true });
  });

  it("matches messy rich text (bold marks, extra spaces, no diacritics, '1. faze' as a heading)", () => {
    const sections = parseChecklistSections([
      { id: "a", type: "heading_3", text: "1.  **Fáze**" },
      todo("x", "a"),
      { id: "b", type: "paragraph", text: " 3 . retrieval  " },
      todo("y", "b"),
      { id: "c", type: "toggle", text: "4. Faze ctyri" },
      todo("z", "c"),
    ]);
    expect(sections.map((s) => s.kind)).toEqual(["encoding", "retrieval", "faze4"]);
    expect(sections.map((s) => s.items.length)).toEqual([1, 1, 1]);
    expect(sections[0].heading).toBe("1. **Fáze**");
  });

  it("leaves out to_do blocks outside the known sections", () => {
    const sections = parseChecklistSections([
      todo("before", "nákup"),
      { id: "h", type: "heading_2", text: "Fáze" },
      todo("under-faze-heading", "není v sekci"),
      { id: "r", type: "heading_3", text: "3. Retrieval" },
      todo("in", "flashcards"),
      { id: "other", type: "heading_3", text: "Poznámky" },
      todo("after", "po jiném nadpisu"),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((i) => i.blockId)).toEqual(["in"]);
  });

  it("keeps an empty section and simply has no missing ones", () => {
    const sections = parseChecklistSections([{ id: "r", type: "heading_3", text: "3. Retrieval" }, { id: "p", type: "paragraph", text: "x" }]);
    expect(sections).toEqual([{ kind: "retrieval", heading: "3. Retrieval", items: [] }]);
    expect(parseChecklistSections([])).toEqual([]);
  });

  it("skips archived blocks and non-marker block types", () => {
    const sections = parseChecklistSections([
      { id: "r", type: "heading_3", text: "3. Retrieval" },
      { ...todo("gone", "smazané"), archived: true },
      { id: "q", type: "quote", text: "4. Fáze čtyři" },
      todo("ok", "flashcards"),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((i) => i.blockId)).toEqual(["ok"]);
  });

  it("does not take the '## Fáze' heading or a plain 'faze' paragraph for an encoding marker", () => {
    expect(sectionMarker({ type: "heading_2", text: "Fáze" })).toBeNull();
    expect(sectionMarker({ type: "paragraph", text: "faze" })).toBeNull();
    expect(sectionMarker({ type: "numbered_list_item", text: "faze" })).toEqual({ kind: "encoding", heading: "1. faze" });
  });
});

describe("Notion blocks", () => {
  it("reads plain text and checked from a to_do block", () => {
    expect(
      toChecklistBlock({
        object: "block",
        id: "b1",
        type: "to_do",
        to_do: { rich_text: [{ plain_text: "Generated " }, { plain_text: "Qs" }], checked: true },
      }),
    ).toEqual({ id: "b1", type: "to_do", text: "Generated Qs", checked: true });
    expect(toChecklistBlock({ id: "t", type: "table", table: { table_width: 4 }, in_trash: true })).toEqual({
      id: "t",
      type: "table",
      text: "",
      archived: true,
    });
  });

  it("patches only to_do.checked", () => {
    expect(checklistPatch(true)).toEqual({ to_do: { checked: true } });
    expect(checklistPatch(false)).toEqual({ to_do: { checked: false } });
  });

  it("accepts only a boolean checked from the browser", () => {
    expect(parseCheckedBody({ checked: true })).toBe(true);
    expect(parseCheckedBody({ checked: false })).toBe(false);
    expect(parseCheckedBody({ checked: "true" })).toBeNull();
    expect(parseCheckedBody(null)).toBeNull();
    expect(parseCheckedBody([true])).toBeNull();
  });

  it("finds an item regardless of dashes and case", () => {
    const sections = parseChecklistSections([
      { id: "r", type: "heading_3", text: "3. Retrieval" },
      todo("3ee196f4-c84e-8100-9420-e112e5c9f004", "flashcards"),
    ]);
    expect(findChecklistItem(sections, "3EE196F4C84E81009420E112E5C9F004")?.text).toBe("flashcards");
    expect(findChecklistItem(sections, "ffffffffffffffffffffffffffffffff")).toBeUndefined();
  });

  it("normalizes for matching only", () => {
    expect(normalizeText("  4.  **Fáze   čtyři** ")).toBe("4. faze ctyri");
  });
});
