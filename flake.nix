{
  description = "Obsidian.md customizations — monorepo tooling and git hooks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    crane.url = "github:ipetkov/crane";
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-darwin" ];

      imports = [ inputs.git-hooks.flakeModule ];

      perSystem =
        { config, pkgs, ... }:
        let
          # `cargo fmt` / `cargo clippy` dispatch to sibling binaries
          # (rustfmt, clippy-driver), so the whole toolchain must be on PATH.
          rustBinPath = pkgs.lib.makeBinPath [
            pkgs.cargo
            pkgs.rustc
            pkgs.clippy
            pkgs.rustfmt
          ];
          cargoHook =
            name: cmd:
            "${pkgs.writeShellScript name ''
              export PATH=${rustBinPath}:$PATH
              exec ${cmd}
            ''}";

          craneLib = inputs.crane.mkLib pkgs;
          # Shared between the deps-only and final builds. Only the Rust files
          # are brought in (no node_modules / packages/).
          gembuArgs = {
            pname = "gembu";
            version = "0.0.0";
            src = pkgs.lib.fileset.toSource {
              root = ./.;
              fileset = pkgs.lib.fileset.unions [
                ./Cargo.toml
                ./Cargo.lock
                ./crates
              ];
            };
            strictDeps = true;
            cargoExtraArgs = "--package gembu";
          };
          # Build dependencies once and cache them, so editing gembu's own
          # sources doesn't recompile the dependency tree.
          gembuDeps = craneLib.buildDepsOnly gembuArgs;
        in
        {
          # git-hooks.nix — replaces the former `prek` setup. Tools are
          # referenced by store path so hooks resolve regardless of PATH;
          # the bun/cargo hooks additionally need project deps
          # (node_modules / crate cache), so they are meant to run at commit
          # time inside the devShell, not in a hermetic `nix flake check`.
          pre-commit.settings.hooks = {
            # Whole-tree checks (pass_filenames = false): `always_run` so
            # they fire on every commit rather than depending on which file
            # types happen to be staged.
            gitleaks = {
              enable = true;
              entry = "${pkgs.gitleaks}/bin/gitleaks git --pre-commit --redact --staged";
              pass_filenames = false;
              always_run = true;
            };

            # JS/TS (oxc) — whole-tree checks via bun scripts.
            oxfmt = {
              enable = true;
              name = "oxfmt";
              entry = "${pkgs.bun}/bin/bun run fmt -- --check";
              pass_filenames = false;
              always_run = true;
            };
            oxlint = {
              enable = true;
              name = "oxlint";
              entry = "${pkgs.bun}/bin/bun run lint";
              pass_filenames = false;
              always_run = true;
            };

            # Rust (cargo workspace) — only run when *.rs files are staged.
            cargo-fmt = {
              enable = true;
              name = "cargo fmt";
              entry = cargoHook "cargo-fmt" "cargo fmt --all --check";
              types = [ "rust" ];
              pass_filenames = false;
            };
            cargo-clippy = {
              enable = true;
              name = "cargo clippy";
              entry = cargoHook "cargo-clippy" "cargo clippy --workspace --all-targets -- -D warnings";
              types = [ "rust" ];
              pass_filenames = false;
            };
            cargo-test = {
              enable = true;
              name = "cargo test";
              entry = cargoHook "cargo-test" "cargo test --workspace";
              types = [ "rust" ];
              pass_filenames = false;
            };

            # Pkl (web-clipper templates).
            pkl-format = {
              enable = true;
              name = "pkl format";
              entry = "${pkgs.pkl}/bin/pkl format .";
              pass_filenames = false;
              always_run = true;
            };
          };

          # `gembu` — frontmatter validator CLI, built with crane.
          packages.gembu = craneLib.buildPackage (gembuArgs // { cargoArtifacts = gembuDeps; });
          packages.default = config.packages.gembu;

          # `nix develop` / direnv — shellHook installs the git pre-commit hook.
          devShells.default = pkgs.mkShell {
            inputsFrom = [ config.pre-commit.devShell ];
            packages = [
              pkgs.bun
              pkgs.pkl
              pkgs.gitleaks
              pkgs.cargo
              pkgs.rustc
              pkgs.clippy
              pkgs.rustfmt
              pkgs.rust-analyzer
            ];
          };
        };
    };
}
