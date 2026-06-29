---
name: web-clipper-templates
description: Use when writing or editing Obsidian Web Clipper templates in packages/web-clipper — quote escaping in PKL→JSON and the multitext value format.
---

# Web Clipper templates

Sources are PKL in `packages/web-clipper/src/` (shared props in `props.pkl`);
`pkl eval` generates the committed `dist/*.json`. After editing, rebuild and
verify against `dist/*.json`:

```sh
vp run build:web-clipper
```

## Quotes: normal string with `\"`

`noteNameFormat`, `noteContentFormat`, and every `properties[].value` share one
compiler — there is no second parse for property values, so escaping never
depends on which field holds the value.

Write inner quotes as `\"` in a normal PKL string. PKL turns `\"` into a real
`"`, emitted as `\"` in the JSON — and the compiler accepts real quotes in both
selectors and filter arguments:

```pkl
value = "{{selector:img[alt=\"画像\"]?src|first}}"
value = "{{title}} - {{published|date:\"YYYY-MM-DD\"}}"
```

Use a **raw string** `#"..."#` only when the value holds a literal backslash
that is _not_ a quote escape — i.e. regex `triggers`:

```pkl
triggers = List(#"/^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/"#)
```

Web Clipper's own UI exports the backslash form (`\\\"` in JSON, e.g.
`[class^=\\\"…\\\"]`); it also works — selectors un-escape `\"`→`"` and filters
strip surrounding quotes — but normal PKL strings keep the source simplest.

## multitext value format

A `type = "multitext"` value is split into an array _after_ compilation. Columns:
**Compiled value** = the literal string in `dist/*.json`; **PKL** = what produces it.

| Compiled value                            | Result                              | PKL                              |
| ----------------------------------------- | ----------------------------------- | -------------------------------- |
| `[[A]], [[B]]` (no quotes)                | OK — split on `,` outside `[[…]]`   | `"[[A]], [[B]]"` plain string    |
| `["a", "b"]` (brackets + **real** quotes) | OK — `JSON.parse`                   | `"[\"a\", \"b\"]"` normal string |
| `"a", "b"` (quotes, no brackets)          | BROKEN — keeps quotes → `- "\"a\""` | —                                |
| `[\"a\", \"b\"]` (brackets + `\"`)        | BROKEN — fails the `["…"]` check    | —                                |

Split on `,` outside `[[…]]` = a comma inside a wikilink isn't a separator
(`shared.ts`: `split(/,(?![^\[]*\]\])/)`), so `[[Smith, John]]` stays one item.
The bracketed form needs **real** quotes (normal PKL string, not raw). A bare
`{{selector:...}}` resolving to multiple values needs neither brackets nor quotes.

## Official reference

The escaping and multitext rules above are extension behavior (verified against
the `obsidianmd/obsidian-clipper` source: `tokenizer.ts`, `variables/selector.ts`,
`shared.ts`), not documented syntax. For the template syntax that goes _inside_
`{{...}}`, consult the official docs — the single source of truth, so look up
rather than memorize:

- Template syntax & `{{var\|filter}}` shape — https://obsidian.md/help/web-clipper/templates
- Available variables (`{{title}}`, `{{selector:...}}`, `{{schema:...}}`, …) — https://obsidian.md/help/web-clipper/variables
- Filter names & arguments (`date`, `split`, `replace`, `slice`, …) — https://obsidian.md/help/web-clipper/filters
- Conditionals / loops — https://obsidian.md/help/web-clipper/logic
- Behavior, troubleshooting, and the rest — https://obsidian.md/help/web-clipper
