// Make a string safe to use as an Obsidian file name. Obsidian rejects \ / :
// and the rest are problematic across filesystems, so each is replaced with its
// full-width equivalent to keep the title visually intact (e.g. "Foo : Bar" ->
// "Foo ： Bar"). Imported by the book/reading scripts, not a plugin entry point.

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
