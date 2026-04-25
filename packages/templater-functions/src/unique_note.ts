import { ulid } from "ulid";

const unique_note = async (tp: Tp) => {
  const id = ulid();
  const { title } = tp.file;
  await tp.file.rename(id);

  tp.hooks.on_all_templates_executed(async () => {
    const file = tp.config.target_file;

    await tp.app.fileManager.processFrontMatter(file, (fm) => {
      fm.id = id;
      fm.created = tp.file.creation_date("YYYY-MM-DD");
      fm.modified = tp.file.last_modified_date("YYYY-MM-DD");
      fm.title = title;
    });
  });

  return id;
};

module.exports = unique_note;
