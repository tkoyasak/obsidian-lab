import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";

const targets = ["random.ts", "ulid.ts", "unique_note.ts"];
const entries = targets.map((file) => path.join(import.meta.dir, file));

const outDir = path.join(import.meta.dir, "../../dist/templater");

const result = await Bun.build({
  entrypoints: entries,
  outdir: outDir,
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
