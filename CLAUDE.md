# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Hybrid monorepo for Obsidian.md customizations: a Bun workspace (`packages/`)
and a Cargo workspace (`crates/`), built and distributed through a Nix flake.

`packages/` (Bun workspace):

- **plugin-scripts** — TypeScript user scripts for the Templater and QuickAdd
  plugins. One package: sources live flat in `src/`, `build.ts` bundles a set
  per plugin to `dist/templater/` and `dist/quickadd/`.
- **css-snippets** — CSS snippets (no build step).
- **raycast-scripts** — Raycast script commands (Bash, no build step).
- **web-clipper** — Web Clipper templates in PKL, evaluated to `dist/*.json`.
- **properties-schemas** — JSON Schemas (consumed by `gembu`) generated from
  PKL to `dist/*.json`.

`crates/` (Cargo workspace):

- **gembu** — Rust CLI that validates Markdown YAML frontmatter against JSON
  Schema. See `crates/gembu/README.md`.

Build artifacts live in each package's **committed `dist/`**; the Nix flake
redistributes them as `packages.<name>` so other flakes can consume them.

## Commands

```sh
vp run fmt              # format everything (vp fmt for TS + nix fmt for rust/pkl/nix)
nix build .#<name>      # gembu, plugin-scripts, css-snippets, raycast-scripts,
                        # web-clipper, properties-schemas
nix develop             # dev shell; shellHook runs `vp config` to install hooks
```

Regenerate a package's committed `dist/` after editing sources. **Vite Task**
(`vp run`) is the task runner; tasks are declared under `run.tasks` in
`vite.config.ts` with explicit `output` globs. Unchanged tasks replay from the
content-addressed cache (auto-tracked input files + archived outputs):

```sh
vp run build                    # all packages + gembu
vp run build:plugin-scripts     # bun bundles src → dist/{templater,quickadd}
vp run build:web-clipper        # pkl eval web-clipper → dist/*.json
vp run build:properties-schemas # pkl eval properties-schemas → dist/*.json
vp run build:gembu              # cargo build -p gembu
vp run test                     # cargo test --workspace (test:gembu)
vp run fmt                      # vp fmt + nix fmt (uncached passthrough)
vp run                          # interactive task picker / lists tasks
```

The content-addressed cache makes unchanged tasks instant. Each task's
`command` invokes the underlying tool directly (`bun run ./build.ts`,
`pkl eval …`, `cargo …`); there are no `package.json` build scripts.

## Architecture

### plugin-scripts

- Sources are flat in `src/`; `build.ts` lists each plugin's entrypoints
  explicitly and bundles them (Bun bundler, CommonJS targeting Node, minified)
  into `dist/<plugin>/`.
- `templater.d.ts` / `quickadd.d.ts` declare the global `Tp` / `Qa` types each
  plugin injects; both are in scope under one `tsconfig.json`, so QuickAdd
  scripts can type-check against Templater's API.
- User scripts must use `module.exports = fn` (not `export default`) — both
  Templater and QuickAdd require `module.exports` to be the function directly.

### PKL packages (web-clipper, properties-schemas)

- Each `amends`/uses a PKL package declared in its `PklProject`
  (`PklProject.deps.json` pins checksums); `pkl eval` generates the committed
  `dist/*.json`.
- `properties-schemas` produces the `daily`/`notes`/`references`/`clippings`
  schemas that `gembu` validates Markdown against, plus the `config.json` gembu
  routes by; a `schemaByDir` table is the single source of truth driving both.
  The vault syncs the set into one `.gembu/` dir. `web-clipper` templates
  reference `unique_note()` from `plugin-scripts` (linked at the Obsidian layer).
- Property values containing `\"` use PKL raw strings (`#"..."#`).

## Tooling (Nix flake)

- **flake-parts** structure; system `x86_64-darwin`.
- **rust-overlay** pins the Rust toolchain (cargo/rustc/clippy/rustfmt +
  rust-analyzer); **crane** builds `gembu` with its dependency tree cached
  separately.
- **treefmt-nix** formats the non-JS tree via `nix fmt`: `rustfmt` (edition
  2024), `pkl format`, `nixfmt`. `**/dist/**` is excluded. TypeScript
  formatting/linting is owned by Vite+ (`vp fmt` / `vp check`), not treefmt.
- **Commit hooks** are owned by Vite+ (`vp staged`, configured under `staged`
  in `vite.config.ts`; installed by `vp config` into `.vite-hooks/`). git-hooks.nix
  has been retired. The pre-commit checks: `vp check --fix` (TS fmt/lint/types),
  `cargo fmt`/`clippy -D warnings`/`cargo test` on `*.rs`, `nix fmt` on
  `*.{pkl,nix}`, `gitleaks` over the staged set, and a per-package dist-sync
  guard that rebuilds `dist/` and fails if it differs from what is staged.
- `dist/` artifacts are committed but never formatted/linted.
- Shared TypeScript dependency versions are pinned via the Bun workspace
  catalog in the root `package.json`.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
