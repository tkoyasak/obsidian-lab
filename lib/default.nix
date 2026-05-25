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
}
