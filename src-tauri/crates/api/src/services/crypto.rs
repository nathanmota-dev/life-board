//! AES-256-GCM for secrets stored at rest (the GitHub token). The key never
//! touches the data dir: the desktop shell keeps it wrapped by the OS keyring
//! and hands it to the API at startup.

use std::sync::Arc;

use aes_gcm::Aes256Gcm;
use aes_gcm::aead::{Aead, Generate, KeyInit, Nonce};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};

pub const IV_BYTES: usize = 12;
pub const TAG_BYTES: usize = 16;
pub const KEY_BYTES: usize = 32;

/// Base64 parts of a sealed secret, stored in three columns.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SealedSecret {
    pub ciphertext: String,
    pub iv: String,
    pub tag: String,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CryptoError {
    #[error("Encryption key must be 32 bytes.")]
    KeyLength,
    #[error("Invalid IV length.")]
    IvLength,
    #[error("Invalid auth tag length.")]
    TagLength,
    #[error("Invalid base64.")]
    Base64,
    #[error("Unsupported state or unable to authenticate data")]
    Decrypt,
    #[error("Decrypted secret is not UTF-8.")]
    Utf8,
}

#[derive(Clone)]
pub struct CryptoService {
    key: Arc<[u8; KEY_BYTES]>,
}

impl std::fmt::Debug for CryptoService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CryptoService { key: <redacted> }")
    }
}

impl CryptoService {
    /// `CryptoError::KeyLength` unless the key has 32 bytes.
    pub fn new(key: &[u8]) -> Result<Self, CryptoError> {
        let key: [u8; KEY_BYTES] = key.try_into().map_err(|_| CryptoError::KeyLength)?;
        Ok(Self { key: Arc::new(key) })
    }

    fn cipher(&self) -> Aes256Gcm {
        Aes256Gcm::new(&(*self.key).into())
    }

    /// Seals with a fresh random 12-byte IV.
    pub fn seal(&self, plaintext: &str) -> Result<SealedSecret, CryptoError> {
        let nonce = Nonce::<Aes256Gcm>::try_generate().map_err(|_| CryptoError::Decrypt)?;
        let mut sealed = self.cipher().encrypt(&nonce, plaintext.as_bytes()).map_err(|_| CryptoError::Decrypt)?;
        let tag = sealed.split_off(sealed.len() - TAG_BYTES);
        Ok(SealedSecret { ciphertext: STANDARD.encode(&sealed), iv: STANDARD.encode(nonce), tag: STANDARD.encode(tag) })
    }

    pub fn open(&self, sealed: &SealedSecret) -> Result<String, CryptoError> {
        let iv = decode(&sealed.iv)?;
        let tag = decode(&sealed.tag)?;
        if iv.len() != IV_BYTES {
            return Err(CryptoError::IvLength);
        }
        if tag.len() != TAG_BYTES {
            return Err(CryptoError::TagLength);
        }
        let nonce = Nonce::<Aes256Gcm>::try_from(iv.as_slice()).map_err(|_| CryptoError::IvLength)?;
        let mut message = decode(&sealed.ciphertext)?;
        message.extend_from_slice(&tag);
        let plaintext = self.cipher().decrypt(&nonce, message.as_slice()).map_err(|_| CryptoError::Decrypt)?;
        String::from_utf8(plaintext).map_err(|_| CryptoError::Utf8)
    }
}

/// `Buffer.from(text, "base64")` accepts missing padding.
const LENIENT: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

/// Base64 the way Node reads it (standard alphabet, padding optional).
pub fn decode(text: &str) -> Result<Vec<u8>, CryptoError> {
    LENIENT.decode(text.trim()).map_err(|_| CryptoError::Base64)
}
