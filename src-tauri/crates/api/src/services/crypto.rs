//! AES-256-GCM for secrets stored at rest (the GitHub token). The key never
//! touches the data dir: the desktop shell keeps it wrapped by the OS keyring
//! and hands it to the API at startup.

use std::sync::Arc;

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
        pending!(51, key)
    }

    /// Seals with a fresh random 12-byte IV.
    pub fn seal(&self, plaintext: &str) -> Result<SealedSecret, CryptoError> {
        pending!(51, self.key, plaintext)
    }

    pub fn open(&self, sealed: &SealedSecret) -> Result<String, CryptoError> {
        pending!(51, self.key, sealed)
    }
}
