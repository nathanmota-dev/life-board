use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use life_board_api::services::crypto::{CryptoService, SealedSecret};

use crate::common::crypto;

#[test]
#[ignore = "pending #51"]
fn round_trips_secrets_with_a_fresh_iv_each_time() {
    let service = crypto(1);
    let first = service.seal("ghp_secret").unwrap();
    let second = service.seal("ghp_secret").unwrap();

    assert_ne!(first.iv, second.iv);
    assert_eq!(service.open(&first).unwrap(), "ghp_secret");
}

#[test]
#[ignore = "pending #51"]
fn rejects_tampered_data_and_malformed_envelopes() {
    let service = crypto(1);
    let sealed = service.seal("ghp_secret").unwrap();
    let mut flipped = STANDARD.decode(&sealed.ciphertext).unwrap();
    flipped[0] ^= 1;

    assert!(service.open(&SealedSecret { ciphertext: STANDARD.encode(&flipped), ..sealed.clone() }).is_err());
    let bad_iv = service.open(&SealedSecret { iv: "AAAA".into(), ..sealed.clone() }).unwrap_err();
    assert_eq!(bad_iv.to_string(), "Invalid IV length.");
    let bad_tag = service.open(&SealedSecret { tag: "AAAA".into(), ..sealed.clone() }).unwrap_err();
    assert_eq!(bad_tag.to_string(), "Invalid auth tag length.");
    let short_key = CryptoService::new(&[1; 31]).unwrap_err();
    assert!(short_key.to_string().contains("32 bytes"), "{short_key}");
    assert!(crypto(2).open(&sealed).is_err());
}
