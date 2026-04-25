import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";

const srcDir = path.join(import.meta.dir, "./src");
const outDir = path.join(import.meta.dir, "../../dist/templater");

const glob = new Bun.Glob("*.ts");
const entries: string[] = [];

console.log(`Scanning...`);
for await (const file of glob.scan({ cwd: srcDir })) {
  const entry = path.join(srcDir, file);
  console.log(`  + ${entry}`);
  entries.push(entry);
}

console.log(`\nBuilding...`);
for (const entry of entries) {
  const fileName = entry.split("/").pop()!.replace(".ts", ".js");
  const outfile = path.join(outDir, fileName);

  const result = await Bun.build({
    entrypoints: [entry],
    outdir: outDir,
    format: "cjs",
    target: "node",
    minify: true,
    external: [...builtinModules],
  });

  if (!result.success) {
    console.error(`Failed to build ${fileName}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`  ✓ ${outfile}`);
}

console.log(`\nDone!`);
