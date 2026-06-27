import { rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";

// Sources live flat in src/; each plugin loads from its own vault folder, so
// build a separate bundle set per plugin into dist/<plugin>/.
const groups: Record<string, string[]> = {
  templater: ["daily_routine.ts", "fetch_book.ts", "new_highlight.ts", "new_reading.ts", "tid.ts"],
  quickadd: [
    "complete_next_action.ts",
    "normalize_punctuation.ts",
    "open_by_category.ts",
    "resolve_urls.ts",
  ],
};

for (const [plugin, files] of Object.entries(groups)) {
  // Wipe the output dir first so a script moved to another plugin leaves no
  // stale bundle behind (Bun.build only writes, never prunes).
  const outdir = path.join(import.meta.dir, "dist", plugin);
  await rm(outdir, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: files.map((file) => path.join(import.meta.dir, "src", file)),
    outdir,
    format: "cjs",
    target: "node",
    minify: true,
    external: [...builtinModules],
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}
