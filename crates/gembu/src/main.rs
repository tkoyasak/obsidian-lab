use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use globset::{Glob, GlobSetBuilder};
use jsonschema::Validator;
use serde::Deserialize;

/// Routing config: maps file globs to the schema that validates them.
#[derive(Deserialize)]
struct Config {
    #[serde(default, rename = "rule")]
    rules: Vec<Rule>,
}

#[derive(Deserialize)]
struct Rule {
    /// Glob matched against each input path (e.g. `Daily/**/*.md`).
    include: String,
    /// Schema path, resolved relative to the current working directory.
    schema: PathBuf,
}

/// Config locations searched, in order, when `--config` is not given.
const DEFAULT_CONFIG_PATHS: [&str; 2] = [".config/gembu.json", ".gembu.json"];

type BoxError = Box<dyn std::error::Error>;

fn main() -> ExitCode {
    match run() {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("gembu: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<bool, BoxError> {
    let mut config_path: Option<PathBuf> = None;
    let mut files: Vec<PathBuf> = Vec::new();

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-c" | "--config" => {
                config_path = Some(args.next().ok_or("--config needs a value")?.into());
            }
            "-h" | "--help" => {
                println!("usage: gembu [--config <gembu.json>] <file>...");
                return Ok(true);
            }
            _ => files.push(arg.into()),
        }
    }

    if files.is_empty() {
        return Ok(true);
    }

    let config_path = match config_path {
        Some(p) => p,
        None => DEFAULT_CONFIG_PATHS
            .iter()
            .map(PathBuf::from)
            .find(|p| p.exists())
            .ok_or_else(|| {
                format!(
                    "no config found (looked for {})",
                    DEFAULT_CONFIG_PATHS.join(", ")
                )
            })?,
    };
    let config: Config = serde_json::from_str(&std::fs::read_to_string(&config_path)?)?;

    // Build a matcher per rule; the first rule that matches a path wins.
    let mut builder = GlobSetBuilder::new();
    for rule in &config.rules {
        builder.add(Glob::new(&rule.include)?);
    }
    let globset = builder.build()?;

    // Compile each schema once, lazily, keyed by its resolved path.
    let mut validators: HashMap<PathBuf, Validator> = HashMap::new();
    let mut ok = true;

    for file in &files {
        let Some(idx) = globset.matches(file).into_iter().min() else {
            continue; // no rule covers this path — not ours to validate
        };
        let schema_path = &config.rules[idx].schema;

        if !validators.contains_key(schema_path) {
            let validator = compile(schema_path)?;
            validators.insert(schema_path.clone(), validator);
        }
        let validator = &validators[schema_path];

        let text = std::fs::read_to_string(file)?;
        let Some(frontmatter) = extract_frontmatter(&text) else {
            eprintln!("{}: no YAML frontmatter found", file.display());
            ok = false;
            continue;
        };
        let instance: serde_json::Value = yaml_serde::from_str(&frontmatter)?;

        let mut valid = true;
        for error in validator.iter_errors(&instance) {
            valid = false;
            let at = error.instance_path().to_string();
            let at = if at.is_empty() { "/".to_string() } else { at };
            eprintln!("{}: {} (at {})", file.display(), error, at);
        }
        if !valid {
            ok = false;
        }
    }

    Ok(ok)
}

/// Compile a schema file, enabling format assertion and resolving relative
/// `$ref`s (e.g. `./base.json`) against the schema's own location.
fn compile(schema_path: &Path) -> Result<Validator, BoxError> {
    let text = std::fs::read_to_string(schema_path)
        .map_err(|e| format!("{}: {e}", schema_path.display()))?;
    let schema: serde_json::Value = serde_json::from_str(&text)?;
    let abs = std::fs::canonicalize(schema_path)?;
    let base_uri = format!("file://{}", abs.display());
    let validator = jsonschema::options()
        .should_validate_formats(true)
        .with_base_uri(base_uri)
        .build(&schema)?;
    Ok(validator)
}

/// Return the YAML frontmatter: the lines between a leading `---` and the
/// next `---` on its own line. `None` if the file has no frontmatter block.
fn extract_frontmatter(text: &str) -> Option<String> {
    let mut lines = text.lines();
    if lines.next()? != "---" {
        return None;
    }
    let mut frontmatter = String::new();
    for line in lines {
        if line == "---" {
            return Some(frontmatter);
        }
        frontmatter.push_str(line);
        frontmatter.push('\n');
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_block_between_delimiters() {
        let md = "---\ntitle: x\ntags: []\n---\n# body\n";
        assert_eq!(
            extract_frontmatter(md).as_deref(),
            Some("title: x\ntags: []\n")
        );
    }

    #[test]
    fn body_horizontal_rule_is_ignored() {
        // A `---` in the body (after the closing one) must not be captured.
        let md = "---\ntitle: x\n---\nintro\n\n---\n\nmore\n";
        assert_eq!(extract_frontmatter(md).as_deref(), Some("title: x\n"));
    }

    #[test]
    fn missing_leading_delimiter_is_none() {
        assert_eq!(extract_frontmatter("# heading\n---\nx\n"), None);
    }

    #[test]
    fn unterminated_block_is_none() {
        assert_eq!(extract_frontmatter("---\ntitle: x\n"), None);
    }

    #[test]
    fn empty_block_is_empty_string() {
        assert_eq!(extract_frontmatter("---\n---\n").as_deref(), Some(""));
    }

    #[test]
    fn compile_then_validate() {
        let dir = std::env::temp_dir().join(format!("gembu-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let schema_path = dir.join("schema.json");
        std::fs::write(
            &schema_path,
            r#"{"type":"object","required":["v"],"properties":{"v":{"enum":["a","b"]}}}"#,
        )
        .unwrap();

        let validator = compile(&schema_path).unwrap();
        assert_eq!(
            validator
                .iter_errors(&serde_json::json!({"v": "a"}))
                .count(),
            0
        );
        assert!(
            validator
                .iter_errors(&serde_json::json!({"v": "z"}))
                .count()
                > 0
        );
        assert!(validator.iter_errors(&serde_json::json!({})).count() > 0);

        std::fs::remove_dir_all(&dir).ok();
    }
}
