//! Seals values with the Rust `CryptoService`, so `record-node-fixtures.mjs` can
//! check that the Node `CryptoService` opens them. Reads
//! `{"key":"<base64>","plaintexts":[...]}` on stdin (a test key, never a real
//! secret) and prints `[{"plaintext":...,"sealed":...}]`.

use std::error::Error;
use std::io::Read;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use life_board_api::services::crypto::CryptoService;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct Input {
    key: String,
    plaintexts: Vec<String>,
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut stdin = String::new();
    std::io::stdin().read_to_string(&mut stdin)?;
    let input: Input = serde_json::from_str(&stdin)?;
    let crypto = CryptoService::new(&STANDARD.decode(input.key)?)?;
    let mut cases = Vec::new();
    for plaintext in input.plaintexts {
        let sealed = crypto.seal(&plaintext)?;
        cases.push(json!({ "plaintext": plaintext, "sealed": sealed }));
    }
    println!("{}", serde_json::to_string(&cases)?);
    Ok(())
}
