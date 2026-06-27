import { defineConfig } from "vite-plus";

// Rebuild a package, then fail if its committed dist/ is now out of sync.
const distSync = (pkg: string) => {
  const dir = `packages/${pkg}/dist`;
  return [
    `vp run build:${pkg}`,
    `git diff --quiet -- ${dir}`,
    `test -z "$(git ls-files --others --exclude-standard -- ${dir})"`,
  ].join(" && ");
};

export default defineConfig({
  // Commit hooks (vp staged). Function entries return the exact command, so
  // filenames are not appended (cargo/gitleaks/dist-sync take no file args).
  staged: {
    // Any change: format + lint + type-check, then a secret scan.
    "*": () => ["vp check --fix", "gitleaks git --pre-commit --redact --staged"],
    // Rust: format, then deny-warnings clippy and tests.
    "*.rs": () => [
      "cargo fmt",
      "cargo clippy --workspace --all-targets -- -D warnings",
      "cargo test --workspace",
    ],
    // Pkl / Nix: formatted via `nix fmt` (matched filenames appended).
    "{*.pkl,*.nix,PklProject}": "nix fmt",
    // Committed dist/ freshness, one guard per dist-producing package.
    "packages/plugin-scripts/**": () => distSync("plugin-scripts"),
    "packages/web-clipper/**": () => distSync("web-clipper"),
    "packages/properties-schemas/**": () => distSync("properties-schemas"),
  },

  fmt: {
    ignorePatterns: ["**/dist/**"],
    sortImports: {},
  },

  lint: {
    ignorePatterns: ["**/dist/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },

  // Task runner. Tasks are cached by default; `output` globs are archived
  // and restored on a cache hit.
  run: {
    tasks: {
      "build:plugin-scripts": {
        command: "bun run ./build.ts",
        cwd: "packages/plugin-scripts",
        // `auto` only traces the command string; build.ts globs src/*.ts at
        // runtime, so the sources are invisible to it and must be listed
        // explicitly — otherwise editing a script never busts the cache.
        input: [
          { auto: true },
          "packages/plugin-scripts/src/**",
          "!packages/plugin-scripts/dist/**",
        ],
        output: ["packages/plugin-scripts/dist/**"],
      },
      "build:web-clipper": {
        // `bash -c` so the shell expands the glob; vp's runner does not.
        command: "bash -c 'pkl eval -f json ./src/*.pkl -o ./dist/%{moduleName}.json'",
        cwd: "packages/web-clipper",
        input: [{ auto: true }, "!packages/web-clipper/dist/**"],
        output: ["packages/web-clipper/dist/**"],
      },
      "build:properties-schemas": {
        command: "pkl eval -m ./dist ./generate.pkl",
        cwd: "packages/properties-schemas",
        input: [{ auto: true }, "!packages/properties-schemas/dist/**"],
        output: ["packages/properties-schemas/dist/**"],
      },
      // Uncached: cargo's own target/ cache conflicts with task archiving.
      "build:gembu": {
        command: "cargo build -p gembu",
        cache: false,
      },
      "test:gembu": {
        command: "cargo test --workspace",
        dependsOn: ["build:gembu"],
        cache: false,
      },
      // Full-tree format: vp for TS, treefmt (nix fmt) for rust/pkl/nix.
      fmt: {
        command: ["vp fmt", "nix fmt"],
        cache: false,
      },
      // Umbrella tasks.
      build: {
        command: "true",
        dependsOn: [
          "build:plugin-scripts",
          "build:web-clipper",
          "build:properties-schemas",
          "build:gembu",
        ],
      },
      test: {
        command: "true",
        dependsOn: ["test:gembu"],
      },
    },
  },
});
