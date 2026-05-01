import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";

const srcDir = path.join(import.meta.dir, "./src");
const outDir = path.join(import.meta.dir, "../../dist/templater");

const glob = new Bun.Glob("*.ts");
const entries: string[] = [];

for await (const file of glob.scan({ cwd: srcDir })) {
  entries.push(path.join(srcDir, file));
}

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
