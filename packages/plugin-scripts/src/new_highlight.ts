// Create a Highlight note linked to a bibliographic [[Book]] note. Designed to
// run as a Templater user function: the template calls it once, renames the
// note to the returned `filename` (user input) and fills frontmatter from the
// returned `book` wiki link.
//
// The book is resolved from the file that was active when the template
// launched: a [[Book]] note is used directly, and any note carrying a `book`
// frontmatter link (a Reading or Highlight note) reuses that link. Otherwise
// the user picks one from References/ via a suggester.

import type { TFile } from "obsidian";

import { sanitizeFilename } from "./filename";

const REFERENCES_DIR = "References/";
const BOOK_CATEGORY = "[[Book]]";

const isBook = (fm: Record<string, unknown> | undefined): boolean => {
  const cats = fm?.categories;
  return Array.isArray(cats) && cats.includes(BOOK_CATEGORY);
};

// A non-empty `book` frontmatter wiki link (e.g. "[[Title]]"), or null.
const bookLink = (fm: Record<string, unknown> | undefined): string | null => {
  const book = fm?.book;
  return typeof book === "string" && book ? book : null;
};

// Resolve the [[Book]] wiki link for the highlight. Prefer the launch-time
// active file: a [[Book]] note itself, then any note linking to a book via
// frontmatter; fall back to a suggester over References/ when neither applies.
// The freshly created note is skipped so its unrendered `book` template text is
// never mistaken for a real link.
const resolveBook = async (tp: Tp): Promise<string> => {
  const active = tp.config.active_file;
  if (active && active.path !== tp.config.target_file.path) {
    const fm = tp.app.metadataCache.getFileCache(active)?.frontmatter;
    if (isBook(fm)) return `[[${active.basename}]]`;
    const link = bookLink(fm);
    if (link) return link;
  }

  const books = tp.app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(REFERENCES_DIR))
    .filter((f) => isBook(tp.app.metadataCache.getFileCache(f)?.frontmatter))
    .sort((a, b) => a.basename.localeCompare(b.basename, "ja"));

  if (books.length === 0) throw new Error("No [[Book]] notes in References/");

  const choice: TFile = await tp.system.suggester(
    books.map((f) => f.basename),
    books,
    true,
    "Select a book to highlight",
  );
  return `[[${choice.basename}]]`;
};

// vault-wide basename collision check.
const nameTaken = (tp: Tp, name: string): boolean =>
  tp.app.vault.getMarkdownFiles().some((f) => f.basename === name);

const new_highlight = async (tp: Tp): Promise<{ book: string; filename: string }> => {
  const book = await resolveBook(tp);

  const input = await tp.system.prompt("Highlight filename", "", true, false);
  const filename = sanitizeFilename((input ?? "").trim());
  if (!filename) throw new Error("No filename");
  if (nameTaken(tp, filename)) throw new Error(`Filename already taken: ${filename}`);

  return { book, filename };
};

module.exports = new_highlight;
