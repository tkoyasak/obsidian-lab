{
  description = "Obsidian.md customizations — monorepo tooling and git hooks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    crane.url = "github:ipetkov/crane";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-darwin" ];

      imports = [
        inputs.git-hooks.flakeModule
        inputs.treefmt-nix.flakeModule
      ];

      perSystem =
        {
          config,
          pkgs,
          system,
          ...
        }:
        let
          # Pinned Rust toolchain from rust-overlay (cargo, rustc, clippy,
          # rustfmt) plus the bits rust-analyzer needs.
          rustToolchain = pkgs.rust-bin.stable.latest.default.override {
            extensions = [
              "rust-src"
              "rust-analyzer"
            ];
          };
          # `cargo fmt` / `cargo clippy` dispatch to sibling binaries
          # (rustfmt, clippy-driver), so the whole toolchain must be on PATH.
          rustBinPath = pkgs.lib.makeBinPath [ rustToolchain ];
          cargoHook =
            name: cmd:
            "${pkgs.writeShellScript name ''
              export PATH=${rustBinPath}:$PATH
              exec ${cmd}
            ''}";

          # crane uses the pinned toolchain rather than the one from nixpkgs.
          craneLib = (inputs.crane.mkLib pkgs).overrideToolchain rustToolchain;
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
          # Bring rust-overlay's `rust-bin` into `pkgs` for this system.
          _module.args.pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = [ inputs.rust-overlay.overlays.default ];
          };

          # git-hooks.nix — replaces the former `prek` setup. Tools are
          # referenced by store path so hooks resolve regardless of PATH;
          # the bun/cargo hooks additionally need project deps
          # (node_modules / crate cache), so they are meant to run at commit
          # time inside the devShell, not in a hermetic `nix flake check`.
          # dist holds committed build artifacts — exclude from every hook so
          # tools aren't handed batches that are entirely ignored.
          pre-commit.settings.excludes = [ "(^|/)dist/" ];
          pre-commit.settings.hooks = {
            # All formatting runs through treefmt (rustfmt / oxfmt / pkl),
            # dispatched per staged file by extension.
            treefmt = {
              enable = true;
              package = config.treefmt.build.wrapper;
            };

            # Whole-tree checks (pass_filenames = false): `always_run` so
            # they fire on every commit rather than depending on which file
            # types happen to be staged.
            gitleaks = {
              enable = true;
              entry = "${pkgs.gitleaks}/bin/gitleaks git --pre-commit --redact --staged";
              pass_filenames = false;
              always_run = true;
            };

            # JS/TS (oxc) lint — git-hooks.nix built-in (nixpkgs oxlint, which
            # bundles tsgolint), over staged js/ts files.
            oxlint = {
              enable = true;
              settings.configPath = ".oxlintrc.json";
            };

            # Rust (cargo workspace) — only run when *.rs files are staged.
            # clippy is git-hooks.nix's built-in (wraps cargo-clippy with cargo
            # on PATH); cargo-test has no built-in, so it stays a cargoHook.
            clippy = {
              enable = true;
              packageOverrides = {
                cargo = rustToolchain;
                clippy = rustToolchain;
              };
              settings = {
                denyWarnings = true;
                extraArgs = "--workspace --all-targets";
              };
            };
            cargo-test = {
              enable = true;
              name = "cargo test";
              entry = cargoHook "cargo-test" "cargo test --workspace";
              types = [ "rust" ];
              pass_filenames = false;
            };
          };

          # treefmt — single source of truth for formatting, used by the
          # pre-commit hook above and by `nix fmt`. oxfmt (from nixpkgs) still
          # reads `.oxfmtrc.json` for dist ignore and import sort.
          treefmt = {
            projectRootFile = "flake.nix";
            # Built artifacts are committed but never formatted.
            settings.global.excludes = [ "**/dist/**" ];
            programs.nixfmt.enable = true;
            programs.oxfmt.enable = true;
            programs.rustfmt = {
              enable = true;
              package = rustToolchain;
            };
            settings.formatter.pkl = {
              command = "${pkgs.pkl}/bin/pkl";
              options = [
                "format"
                "-w"
              ];
              includes = [
                "*.pkl"
                "PklProject"
              ];
            };
          };

          # `gembu` — frontmatter validator CLI, built with crane.
          packages.gembu = craneLib.buildPackage (gembuArgs // { cargoArtifacts = gembuDeps; });
          packages.default = config.packages.gembu;

          # templater/quickadd are built locally into each package's `dist/`
          # (committed) by `bun run build`; Nix redistributes them as-is.
          packages.templater-functions = pkgs.runCommand "templater-functions" { } ''
            mkdir -p $out
            cp ${./packages/templater-functions/dist}/*.js $out/
          '';
          packages.quickadd-scripts = pkgs.runCommand "quickadd-scripts" { } ''
            mkdir -p $out
            cp ${./packages/quickadd-scripts/dist}/*.js $out/
          '';

          # css-snippets and raycast-scripts have no build step — distribute
          # the sources directly.
          packages.css-snippets = pkgs.runCommand "css-snippets" { } ''
            mkdir -p $out
            cp ${./packages/css-snippets}/*.css $out/
          '';
          packages.raycast-scripts = pkgs.runCommand "raycast-scripts" { } ''
            mkdir -p $out
            cp ${./packages/raycast-scripts}/*.sh $out/
            chmod +x $out/*.sh
          '';

          # `nix develop` / direnv — shellHook installs the git pre-commit hook.
          devShells.default = pkgs.mkShell {
            inputsFrom = [ config.pre-commit.devShell ];
            packages = [
              pkgs.bun
              pkgs.pkl
              pkgs.gitleaks
              rustToolchain
            ];
          };
        };
    };
}
