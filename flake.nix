{
  description = "Personal Obsidian.md customizations and supporting tooling";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    crane.url = "github:ipetkov/crane";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-darwin" ];

      imports = [
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

          # Redistribute a package's prebuilt files into $out (no build). The
          # attr name doubles as the source dir packages/<name>; `dist` reads
          # dist/, `glob` selects files, `executable` chmods them (raycast).
          redistribute =
            {
              glob ? "*",
              executable ? false,
              dist ? false,
            }:
            name:
            let
              src = ./packages + "/${name}" + (pkgs.lib.optionalString dist "/dist");
            in
            pkgs.runCommand name { } ''
              mkdir -p $out
              cp -R ${src}/${glob} $out/
              ${pkgs.lib.optionalString executable "chmod +x $out/*"}
            '';
        in
        {
          # Bring rust-overlay's `rust-bin` into `pkgs` for this system.
          _module.args.pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = [ inputs.rust-overlay.overlays.default ];
          };

          # treefmt formats rust/pkl/nix via `nix fmt`; TS is handled by Vite+.
          treefmt = {
            projectRootFile = "flake.nix";
            # Built artifacts are committed but never formatted.
            settings.global.excludes = [ "**/dist/**" ];
            programs.nixfmt.enable = true;
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

          # Redistribute-only packages; mapAttrs passes each attr name to its
          # builder as the source dir. gembu is the only built package (crane).
          packages =
            pkgs.lib.mapAttrs (name: build: build name) {
              plugin-scripts = redistribute {
                dist = true;
              };
              css-snippets = redistribute {
                glob = "*.css";
              };
              raycast-scripts = redistribute {
                glob = "*.sh";
                executable = true;
              };
              web-clipper = redistribute {
                glob = "*.json";
                dist = true;
              };
              properties-schemas = redistribute {
                glob = "*.json";
                dist = true;
              };
            }
            // {
              # `gembu` — frontmatter validator CLI, built with crane.
              gembu = craneLib.buildPackage (gembuArgs // { cargoArtifacts = gembuDeps; });
              default = config.packages.gembu;
            };

          # `nix develop` / direnv. The shellHook installs Vite+ commit hooks
          # (`vp config`); `vp` is a global CLI, not provided here.
          devShells.default = pkgs.mkShellNoCC {
            packages =
              with pkgs;
              [
                # bun
                gitleaks
                # nodejs
                pkl
                typescript-go
              ]
              ++ [
                rustToolchain
              ];
            shellHook = ''
              command -v vp >/dev/null 2>&1 && vp config --no-agent >/dev/null 2>&1 || true
            '';
          };
        };
    };
}
