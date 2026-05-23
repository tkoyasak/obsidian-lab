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
nix fmt                 # format everything (treefmt: rustfmt/oxfmt/pkl/nixfmt)
nix build .#<name>      # gembu, plugin-scripts, css-snippets, raycast-scripts,
                        # web-clipper, properties-schemas
nix develop             # dev shell; shellHook installs the git pre-commit hook
```

Regenerate a package's committed `dist/` after editing sources:

```sh
bun run --cwd packages/plugin-scripts build      # → dist/{templater,quickadd}
bun run --cwd packages/web-clipper build         # pkl eval → dist/*.json
bun run --cwd packages/properties-schemas build  # pkl eval → dist/*.json
cargo build -p gembu        # or: cargo test --workspace
```

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
- `properties-schemas` produces the `daily`/`notes`/`references` schemas that
  `gembu` validates Markdown against. `web-clipper` templates reference
  `unique_note()` from `plugin-scripts` (linked at the Obsidian layer).
- Property values containing `\"` use PKL raw strings (`#"..."#`).

## Tooling (Nix flake)

- **flake-parts** structure; system `x86_64-darwin`.
- **rust-overlay** pins the Rust toolchain (cargo/rustc/clippy/rustfmt +
  rust-analyzer); **crane** builds `gembu` with its dependency tree cached
  separately.
- **treefmt-nix** is the single formatter: `rustfmt` (edition 2024), `oxfmt`
  (nixpkgs; reads `.oxfmtrc.json`), `pkl format`, `nixfmt`. `**/dist/**` is
  excluded.
- **git-hooks.nix** pre-commit hooks: `treefmt`, `oxlint` (nixpkgs; reads
  `.oxlintrc.json`), `clippy`, `cargo test`, `gitleaks`. `dist/` is excluded
  from every hook. Hooks need project deps so they run at commit time in the
  dev shell, not in a hermetic `nix flake check`.
- `dist/` artifacts are committed but never formatted/linted.
- Shared TypeScript dependency versions are pinned via the Bun workspace
  catalog in the root `package.json`.
