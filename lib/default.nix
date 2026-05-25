# Project-local Nix helpers. `root` is the packages directory, passed in so
# paths resolve relative to the flake root rather than this file's location.
{ pkgs, root }:
{
  # Builder for the non-Rust packages that just redistribute already-built
  # files into $out — no build runs here. Returns a `name -> derivation` so the
  # attr name (fed in by mapAttrs at the call site) drives both the package name
  # and the source path <root>/<name>[/dist] — a typo'd name then fails to
  # evaluate. `dist` reads the committed dist/ (built output) rather than the
  # package root; `glob` selects which files; `executable` chmods them (raycast).
  redistribute =
    {
      glob ? "*",
      executable ? false,
      dist ? false,
    }:
    name:
    let
      src = root + "/${name}" + (pkgs.lib.optionalString dist "/dist");
    in
    pkgs.runCommand name { } ''
      mkdir -p $out
      cp -R ${src}/${glob} $out/
      ${pkgs.lib.optionalString executable "chmod +x $out/*"}
    '';

  # Per-package "committed dist/ stays in sync with sources" pre-commit guard.
  # `pkg` is the package dir under packages/ and doubles as the build:<pkg>
  # task suffix. Fires whenever any staged file in the package changes — the
  # caller's global `(^|/)dist/` exclude already drops dist/, so `files` need
  # not enumerate inputs (an unrelated file just triggers a cached no-op
  # rebuild). Regenerates via `pkf run` and fails if the working tree dist/
  # then differs from what was staged. The framework stashes unstaged changes
  # first, so the rebuild sees exactly the staged sources. Verify-only: never
  # re-stages. Relies on `pkf` (+ bun/pkl it shells out to) on PATH, i.e. the
  # devShell.
  distSyncHook = pkg: {
    enable = true;
    name = "dist sync (${pkg})";
    entry = "${pkgs.writeShellScript "dist-sync-${pkg}" ''
      set -eu
      dir=packages/${pkg}/dist
      pkf run build:${pkg} >/dev/null
      if ! git diff --quiet -- "$dir" \
        || [ -n "$(git ls-files --others --exclude-standard -- "$dir")" ]; then
        echo "error: $dir is stale — regenerated output differs from what is staged." >&2
        echo "fix: pkf run build:${pkg} && git add $dir" >&2
        git --no-pager diff --stat -- "$dir" >&2 || true
        exit 1
      fi
    ''}";
    files = "^packages/${pkg}/";
    pass_filenames = false;
  };
}
