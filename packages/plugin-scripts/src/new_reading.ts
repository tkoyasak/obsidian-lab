// Creates a Reading note linked to a bibliographic [[Book]] note. Designed to
// run as a QuickAdd macro: the return value becomes the note filename
// (『title』を読む) and qa.variables.book carries the wiki link to the book.
//
// The book is taken from the active file when it is a [[Book]]; otherwise the
// user picks one from References/ via a suggester.

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

// Pick the [[Book]] note to read. Prefer the active file; fall back to a
// suggester over References/ when the active file is missing or not a [[Book]].
const resolveBook = async (qa: Qa): Promise<TFile> => {
  const active = qa.app.workspace.getActiveFile();
  if (active && isBook(qa.app.metadataCache.getFileCache(active)?.frontmatter)) {
    return active;
  }

  const books = qa.app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(REFERENCES_DIR))
    .filter((f) => {
      const fm = qa.app.metadataCache.getFileCache(f)?.frontmatter;
      return isBook(fm) && bookTitle(fm) !== null;
    })
    .sort((a, b) => a.basename.localeCompare(b.basename, "ja"));

  if (books.length === 0) qa.abort("No [[Book]] notes in References/");

  const choice = await qa.quickAddApi.suggester(
    books.map((f) => f.basename),
    books,
    "Select a book to read",
  );
  if (!choice) qa.abort("No book selected");
  return choice;
};

// vault-wide basename collision check.
const nameTaken = (qa: Qa, name: string): boolean =>
  qa.app.vault.getMarkdownFiles().some((f) => f.basename === name);

const new_reading = async (qa: Qa): Promise<string> => {
  // QuickAdd can evaluate the macro more than once while resolving the file
  // name and template body. On a rerun the active file may already be the
  // freshly created Reading note, so short-circuit on the variables set on the
  // first pass and return the filename settled then.
  if (typeof qa.variables.book === "string" && qa.variables.book) {
    return qa.variables.readingFilename as string;
  }

  const file = await resolveBook(qa);
  const title = bookTitle(qa.app.metadataCache.getFileCache(file)?.frontmatter);
  if (!title) qa.abort("Book has no title");

  qa.variables.book = `[[${file.basename}]]`;

  // 『title』を読む, suffixed with a space + counter (2, 3, …) on collision so a
  // re-read keeps its own note rather than clobbering the existing one.
  const base = `『${sanitizeFilename(title)}』を読む`;
  let name = base;
  for (let n = 2; nameTaken(qa, name); n++) {
    name = `${base} ${n}`;
  }

  qa.variables.readingFilename = name;
  return name;
};

module.exports = new_reading;
