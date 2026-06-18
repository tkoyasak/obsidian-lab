// Complete the open task on the cursor line. Designed to run as a QuickAdd
// macro: the current line must be an open `- [ ]` task tagged `#next`; the tag
// is stripped and the checkbox flipped to `[x]`.

const TASK_OPEN_REGEX = /^(\s*[-*]\s+)\[ \](\s.*)$/;
const NEXT_TAG_REGEX = /(?:^|\s)#next(?![\w/-])/;

const complete_next_action = (qa: Qa): void => {
  const editor = qa.app.workspace.activeEditor?.editor;
  if (!editor) qa.abort("No active editor");

  const cur = editor.getCursor();
  const line = editor.getLine(cur.line);

  const m = line.match(TASK_OPEN_REGEX);
  if (!m || m[1] === undefined || m[2] === undefined) qa.abort("Current line is not an open task");
  if (!NEXT_TAG_REGEX.test(line)) qa.abort("Current task has no #next tag");

  const body = m[2].replace(/\s*#next(?![\w/-])/, "").replace(/\s+$/, "");
  const next = `${m[1]}[x]${body}`;

  editor.replaceRange(next, { line: cur.line, ch: 0 }, { line: cur.line, ch: line.length });
};

module.exports = complete_next_action;
