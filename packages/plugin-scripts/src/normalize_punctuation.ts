// Replace Japanese punctuation with full-width comma/period in the active
// file's body. `、` -> `，` and `。` -> `．`. The frontmatter block is left
// untouched. Each swap is a 1:1 character replacement, so offsets are preserved
// and the cursor stays put.

const normalize_punctuation = (qa: Qa): void => {
  const editor = qa.app.workspace.activeEditor?.editor;
  const file = qa.app.workspace.activeEditor?.file;
  if (!editor || !file) qa.abort("No active editor");

  // The body starts on the line after the closing `---` of the frontmatter.
  const frontmatter = qa.app.metadataCache.getFileCache(file)?.frontmatterPosition;
  const startLine = frontmatter ? frontmatter.end.line + 1 : 0;
  const lastLine = editor.lastLine();
  if (startLine > lastLine) return;

  const from = { line: startLine, ch: 0 };
  const to = { line: lastLine, ch: editor.getLine(lastLine).length };

  const body = editor.getRange(from, to);
  const replaced = body.replace(/、/g, "，").replace(/。/g, "．");
  if (replaced === body) return;

  const cursor = editor.getCursor();
  editor.replaceRange(replaced, from, to);
  editor.setCursor(cursor);
};

module.exports = normalize_punctuation;
