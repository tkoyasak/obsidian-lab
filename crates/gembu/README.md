# gembu

Validate Markdown YAML frontmatter against JSON Schema.

`gembu` takes a list of Markdown files, slices each file's frontmatter (the
block between its first two `---` lines), parses it as YAML, and validates it
against a JSON Schema chosen per path. It is meant to run as a pre-commit hook
over staged `*.md` files, but works on any file list.

## Usage

```sh
gembu [--config <gembu.json>] <file>...
```

- Files are validated against the schema selected by the first matching rule
  in the config. Paths that match no rule are skipped.
- Exit code is non-zero if any file fails validation, lacks frontmatter, or
  cannot be parsed.
- Errors report the source path and the JSON Pointer of the offending value:

  ```text
  Daily/2026-05-21.md: "secret" is not one of "private", "public" or "unlisted" (at /visibility)
  ```

If `--config` is omitted, gembu looks for `.gembu/config.json` then
`.gembu.json` in the current directory.

## Config

JSON, an array of `rules` entries. `include` is a glob matched against each
input path; `schema` is a path resolved relative to the config file's own
directory (so a config in `.gembu/` references its sibling schemas by name).

```json
{
  "rules": [
    { "include": "Daily/**/*.md", "schema": "daily.json" },
    { "include": "Notes/**/*.md", "schema": "notes.json" },
    { "include": "References/**/*.md", "schema": "references.json" }
  ]
}
```

`include` patterns support only `*` (any run of characters within a path
segment) and `**` (any run including path separators). Other [globset
syntax](https://docs.rs/globset/latest/globset/#syntax) such as `?` and
`[...]` is byte-oriented and does not handle multi-byte (e.g. Japanese)
characters correctly, so it is unsupported.

Schemas may use relative `$ref`s (e.g. `./base.json`); they resolve against the
schema file's own location. `format` assertions are enabled.

## Notes

- YAML is parsed into a JSON value, so YAML-native dates become strings —
  constrain them with `pattern` in the schema.
- Schema reference resolution is file-only (no network).
