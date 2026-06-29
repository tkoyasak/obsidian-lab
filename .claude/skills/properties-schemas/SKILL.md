---
name: properties-schemas
description: Use when editing packages/properties-schemas/generate.pkl — propagating a vault change (new category, changed property, newly validated directory) into the frontmatter schemas, or diagnosing a gembu frontmatter-validation failure. Schemas are keyed by directory × category, not by template.
---

# Properties schemas

`generate.pkl` produces the frontmatter JSON Schemas (`dist/{daily,notes,references,clippings}.json`) that `gembu` validates the vault's Markdown against, plus `dist/config.json` — the gembu routing config. The vault syncs the whole set into one `.gembu/` dir. Edit the PKL, never the generated JSON.

## Model: directory × category

Two axes, both independent of how a note is created:

- **Directory** = the schema unit. `gembu` routes each path to one schema via `.gembu/config.json` in the vault (`Daily/`→daily, `Notes/`→notes, `References/`→references, `Clippings/`→clippings). One `output` file per directory.
- **Category** = the variation within a directory. A `[[X]]` in `categories` fires a **conditional** (`if categories contains "[[X]]" then …`). One directory can hold several categories — Clippings/ holds both `[[Clippings]]` and `[[Highlight]]`.

Note creators — Templater, QuickAdd, the daily-note plugin, Web Clipper, and whatever comes next — are an open-ended set of **inputs** flowing many-to-one into these cells. The schema never knows who created a note. **Never enumerate creators**; reason only in directory × category.

## What a vault change means for the schema

A new template is **not** the trigger — it usually needs no schema edit. The trigger is a new or changed category, or a newly validated directory. Translate the vault event:

| Vault change                                                                    | Schema edit                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| New template routing to an existing (directory × category) with the same fields | none                                                                            |
| Moving notes between already-validated directories                              | none                                                                            |
| New category carrying type-specific required fields                             | add one `xDomain` + `categoryConditional`, compose into the directory's `allOf` |
| Field added / removed / retyped on an existing category                         | edit that `xDomain` block                                                       |
| Property constraint change (enum / nullability / pattern)                       | edit the property in `base` or the relevant domain                              |
| A directory that should now be validated                                        | add a `schemaByDir` entry — emits both the schema file and its gembu route      |

## Editing generate.pkl

- Build nullable scalars with `nullableOf("string")`; amend for `format` / `pattern` / `minimum`. The renderer emits keys in a canonical order, so amend order is irrelevant.
- One category = one `xDomain` (a plain `Schema`) wrapped by `categoryConditional(comment, "[[X]]", xDomain)`. `categorizedAs` supplies the shared `if` guard.
- Compose conditionals into a directory with `(base) { allOf { … } }`, then add it to `schemaByDir` — that one directory→schema entry is the SSOT that emits both `dist/<dir>.json` and the directory's route in `dist/config.json`.

## Verify

Run `vp run build:properties-schemas`, then:

- **Refactors must be pure.** For every directory whose semantics you did not intend to change, `git diff --stat packages/properties-schemas/dist/` shows it unchanged. A byte diff there means the refactor altered output — investigate before continuing.
- A new directory shows only its new `dist/<dir>.json` as untracked, nothing else changed.
- `pkl format generate.pkl` leaves the file unchanged (the commit hook enforces this).
- For a changed directory, run `gembu` over its notes in the vault and confirm exit 0.

## Cross-repo release (order matters)

The vault consumes this repo as a flake input, so a schema change reaches notes only after a release:

1. obsidian-lab: commit + push.
2. vault: `nix flake update obsidian-lab`, then `nix develop` — resyncs the `.gembu/` dir (schemas + `config.json`) by wildcard, so a new schema and its routing rule ship together. Changing gembu's own behavior (config discovery, path resolution) ships through the same flake bump.

## Gotchas

- `base` sets `additionalProperties: true`, so extra fields — including site-specific Web Clipper fields like `handle` — pass silently. Convenient, but a category that should be modeled can drift unnoticed (this is how `[[Highlight]]` was missed). The `Categories/*.md` notes are the canonical category list to check the conditionals against.
- Web Clipper writes `content_id` as the literal `<% tp.user.tid() %>`; a clip validates only once Templater resolves it. A failing clip `content_id` is usually unresolved template text, not a schema bug.
