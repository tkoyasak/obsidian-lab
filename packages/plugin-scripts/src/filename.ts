// Obsidian rejects file names containing \ / : ; other characters are also
// problematic across filesystems. Substitute the full-width equivalent so the
// title stays visually intact (e.g. "Foo : Bar" -> "Foo ： Bar").
const FILENAME_CHAR_MAP: Record<string, string> = {
  "\\": "＼",
  "/": "／",
  ":": "：",
  "*": "＊",
  "?": "？",
  '"': "”",
  "<": "＜",
  ">": "＞",
  "|": "｜",
};

export const sanitizeFilename = (s: string): string =>
  s.replace(/[\\/:*?"<>|]/g, (c) => FILENAME_CHAR_MAP[c] ?? "");
