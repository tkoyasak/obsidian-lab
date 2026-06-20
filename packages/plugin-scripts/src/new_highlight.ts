// Create a Highlight note linked to a bibliographic [[Book]] note. Designed to
// run as a QuickAdd macro: the return value becomes the note filename (taken
// from user input) and qa.variables.book carries the wiki link to the book.
//
// The book is resolved from the active file when possible: a [[Book]] note is
// used directly, and any note carrying a `book` frontmatter link (a Reading or
// Highlight note) reuses that link. Otherwise the user picks one from
// References/ via a suggester.

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

// Resolve the [[Book]] wiki link for the highlight. Prefer the active file: a
// [[Book]] note itself, then any note linking to a book via frontmatter; fall
// back to a suggester over References/ when neither applies.
const resolveBook = async (qa: Qa): Promise<string> => {
  const active = qa.app.workspace.getActiveFile();
  if (active) {
    const fm = qa.app.metadataCache.getFileCache(active)?.frontmatter;
    if (isBook(fm)) return `[[${active.basename}]]`;
    const link = bookLink(fm);
    if (link) return link;
  }

  const books = qa.app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(REFERENCES_DIR))
    .filter((f) => isBook(qa.app.metadataCache.getFileCache(f)?.frontmatter))
    .sort((a, b) => a.basename.localeCompare(b.basename, "ja"));

  if (books.length === 0) qa.abort("No [[Book]] notes in References/");

  const choice: TFile = await qa.quickAddApi.suggester(
    books.map((f) => f.basename),
    books,
    "Select a book to highlight",
  );
  if (!choice) qa.abort("No book selected");
  return `[[${choice.basename}]]`;
};

// vault-wide basename collision check.
const nameTaken = (qa: Qa, name: string): boolean =>
  qa.app.vault.getMarkdownFiles().some((f) => f.basename === name);

const new_highlight = async (qa: Qa): Promise<string> => {
  // QuickAdd can evaluate the macro more than once while resolving the file
  // name and template body. Short-circuit on the variables set on the first
  // pass and return the filename settled then.
  if (typeof qa.variables.book === "string" && qa.variables.book) {
    return qa.variables.highlightFilename as string;
  }

  const book = await resolveBook(qa);

  const input = await qa.quickAddApi.inputPrompt("Highlight filename");
  const name = sanitizeFilename((input ?? "").trim());
  if (!name) qa.abort("No filename");
  if (nameTaken(qa, name)) qa.abort(`Filename already taken: ${name}`);

  qa.variables.book = book;
  qa.variables.highlightFilename = name;
  return name;
};

module.exports = new_highlight;
