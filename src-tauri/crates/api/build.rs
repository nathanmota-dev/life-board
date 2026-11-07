//! Embeds the Drizzle migrations from `api/drizzle` (journal order, `when` and SQL)
//! so the Rust API migrates the same profile the Node API does. 4/4 moves the folder.

use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    if let Err(error) = generate() {
        println!("cargo::error={error}");
    }
}

fn generate() -> Result<(), String> {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").map_err(|e| e.to_string())?);
    let folder = manifest.join("../../../api/drizzle");
    let journal_path = folder.join("meta/_journal.json");
    println!("cargo::rerun-if-changed={}", folder.display());
    println!("cargo::rerun-if-changed={}", journal_path.display());

    let journal: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(&journal_path).map_err(|e| format!("{}: {e}", journal_path.display()))?,
    )
    .map_err(|e| e.to_string())?;
    let entries = journal["entries"].as_array().ok_or("journal has no entries")?;

    let mut code = String::from("&[\n");
    for entry in entries {
        let tag = entry["tag"].as_str().ok_or("entry without tag")?;
        let when = entry["when"].as_i64().ok_or("entry without when")?;
        let sql = folder.join(format!("{tag}.sql"));
        println!("cargo::rerun-if-changed={}", sql.display());
        let sql = fs::canonicalize(&sql).map_err(|e| format!("{}: {e}", sql.display()))?;
        code.push_str(&format!(
            "    Migration {{ tag: {tag:?}, when: {when}, sql: include_str!({:?}) }},\n",
            sql.display().to_string()
        ));
    }
    code.push(']');

    let out = PathBuf::from(env::var("OUT_DIR").map_err(|e| e.to_string())?).join("migrations.rs");
    fs::write(out, code).map_err(|e| e.to_string())
}
