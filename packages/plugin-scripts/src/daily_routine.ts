// Render the recurring tasks due on a daily note as a checklist. Designed to
// run as a Templater user function: the Daily template calls
// `<% tp.user.daily_routine(tp) %>` and the returned markdown is written into
// the note body under its Routine heading.
//
// A task recurs on a day when its frontmatter `recurrence` list contains
// "daily" or the lowercase weekday name (e.g. "friday"). The weekday is taken
// from the daily note's own filename (YYYY-MM-DD) so pre-creating a future day
// still lists that day's routine; it falls back to the current weekday when the
// name is not a date.

const TASK_CATEGORY = "[[Task]]";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isTask = (fm: Record<string, unknown> | undefined): boolean => {
  const cats = fm?.categories;
  return Array.isArray(cats) && cats.includes(TASK_CATEGORY);
};

const recurrenceOf = (fm: Record<string, unknown> | undefined): string[] => {
  const rec = fm?.recurrence;
  if (Array.isArray(rec)) return rec.filter((v): v is string => typeof v === "string");
  return typeof rec === "string" && rec ? [rec] : [];
};

// Lowercase weekday name of the daily note being created.
const weekdayOf = (tp: Tp): string => {
  const name = tp.config.target_file.basename;
  const day = DATE_RE.test(name) ? tp.date.now("dddd", 0, name, "YYYY-MM-DD") : tp.date.now("dddd");
  return day.toLowerCase();
};

const daily_routine = (tp: Tp): string => {
  const today = weekdayOf(tp);

  return tp.app.vault
    .getMarkdownFiles()
    .filter((f) => {
      const fm = tp.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!isTask(fm)) return false;
      const rec = recurrenceOf(fm);
      return rec.includes("daily") || rec.includes(today);
    })
    .sort((a, b) => a.basename.localeCompare(b.basename, "ja"))
    .map((f) => `- [ ] [[${f.basename}]]`)
    .join("\n");
};

module.exports = daily_routine;
