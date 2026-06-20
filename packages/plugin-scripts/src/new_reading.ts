// Create a Reading note linked to a bibliographic [[Book]] note. Designed to
// run as a Templater user function: the template calls it once, renames the
// note to the returned `filename` (『title』を読む) and fills frontmatter from
// the returned `book` wiki link.
//
// The book is taken from the file that was active when the template launched
// when it is a [[Book]]; otherwise the user picks one from References/ via a
// suggester.

import type { TFile } from "obsidian";

import { sanitizeFilename } from "./filename";

const REFERENCES_DIR = "References/";
const BOOK_CATEGORY = "[[Book]]";

const isBook = (fm: Record<string, unknown> | undefined): boolean => {
  const cats = fm?.categories;
  return Array.isArray(cats) && cats.includes(BOOK_CATEGORY);
};

const bookTitle = (fm: Record<string, unknown> | undefined): string | null => {
  const title = fm?.title;
  return typeof title === "string" && title ? title : null;
};

// Pick the [[Book]] note to read. Prefer the launch-time active file; fall back
// to a suggester over References/ when it is missing, the freshly created note
// itself, or not a [[Book]].
const resolveBook = async (tp: Tp): Promise<TFile> => {
  const active = tp.config.active_file;
  if (active && active.path !== tp.config.target_file.path) {
    if (isBook(tp.app.metadataCache.getFileCache(active)?.frontmatter)) return active;
  }

  const books = tp.app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(REFERENCES_DIR))
    .filter((f) => {
      const fm = tp.app.metadataCache.getFileCache(f)?.frontmatter;
      return isBook(fm) && bookTitle(fm) !== null;
    })
    .sort((a, b) => a.basename.localeCompare(b.basename, "ja"));

  if (books.length === 0) throw new Error("No [[Book]] notes in References/");

  return tp.system.suggester(
    books.map((f) => f.basename),
    books,
    true,
    "Select a book to read",
  );
};

// vault-wide basename collision check.
const nameTaken = (tp: Tp, name: string): boolean =>
  tp.app.vault.getMarkdownFiles().some((f) => f.basename === name);

const new_reading = async (tp: Tp): Promise<{ book: string; filename: string }> => {
  const file = await resolveBook(tp);
  const title = bookTitle(tp.app.metadataCache.getFileCache(file)?.frontmatter);
  if (!title) throw new Error("Book has no title");

  // 『title』を読む, suffixed with a space + counter (2, 3, …) on collision so a
  // re-read keeps its own note rather than clobbering the existing one.
  const base = `『${sanitizeFilename(title)}』を読む`;
  let filename = base;
  for (let n = 2; nameTaken(tp, filename); n++) {
    filename = `${base} ${n}`;
  }

  return { book: `[[${file.basename}]]`, filename };
};

module.exports = new_reading;
