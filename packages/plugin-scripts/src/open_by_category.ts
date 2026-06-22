// Browse notes by their `categories` frontmatter. Designed to run as a QuickAdd
// macro: list every category value used across the vault, pick one, then pick a
// note carrying that value and open it in the current tab.

import type { TFile } from "obsidian";

// The `categories` frontmatter is an array of wiki-link strings (e.g.
// "[[Book]]"); drop anything that is not a non-empty string.
const categoriesOf = (fm: Record<string, unknown> | undefined): string[] => {
  const cats = fm?.categories;
  return Array.isArray(cats)
    ? cats.filter((c): c is string => typeof c === "string" && c !== "")
    : [];
};

const open_by_category = async (qa: Qa): Promise<void> => {
  // Single in-memory pass over the metadata cache: index notes by each category
  // value so both pickers are served without a second scan.
  const byCategory = new Map<string, TFile[]>();
  for (const f of qa.app.vault.getMarkdownFiles()) {
    for (const c of categoriesOf(qa.app.metadataCache.getFileCache(f)?.frontmatter)) {
      (byCategory.get(c) ?? byCategory.set(c, []).get(c)!).push(f);
    }
  }

  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b, "ja"));
  if (categories.length === 0) qa.abort("No categories found");

  // Show the bare link text (e.g. "Book" for "[[Book]]") but keep the raw value
  // as the selection so it still matches the frontmatter entries.
  const category: string = await qa.quickAddApi.suggester(
    categories.map((c) => c.replace(/^\[\[|\]\]$/g, "")),
    categories,
    "Select a category",
  );
  if (!category) qa.abort("No category selected");

  const notes = (byCategory.get(category) ?? []).sort((a, b) =>
    a.basename.localeCompare(b.basename, "ja"),
  );

  const note: TFile = await qa.quickAddApi.suggester(
    notes.map((f) => f.basename),
    notes,
    `Open a note in ${category.replace(/^\[\[|\]\]$/g, "")}`,
  );
  if (!note) qa.abort("No note selected");

  await qa.app.workspace.getLeaf(false).openFile(note);
};

module.exports = open_by_category;
