use serde_json::Value;

use super::common::{Ctx, Dto, object, text};
use crate::error::Issue;

/// The suffix of every OAuth client ID Google issues.
pub const CLIENT_ID_SUFFIX: &str = ".apps.googleusercontent.com";

/// `PUT /google/credentials`: the OAuth client of the user's Google Cloud project.
#[derive(Clone, Default, PartialEq, Eq)]
pub struct SaveGoogleCredentialsBody {
    pub client_id: String,
    pub client_secret: String,
}

impl std::fmt::Debug for SaveGoogleCredentialsBody {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SaveGoogleCredentialsBody { client_id: <redacted>, client_secret: <redacted> }")
    }
}

fn is_client_id(value: &str) -> bool {
    value.len() > CLIENT_ID_SUFFIX.len() && value.ends_with(CLIENT_ID_SUFFIX)
}

impl Dto for SaveGoogleCredentialsBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let client_id = fields.required(
            &mut ctx,
            "clientId",
            text()
                .trim()
                .min(1)
                .max(256)
                .pattern(is_client_id, "Invalid client ID: expected it to end with .apps.googleusercontent.com"),
        );
        let client_secret = fields.required(&mut ctx, "clientSecret", text().trim().min(1).max(256));
        ctx.finish(Self { client_id: client_id.unwrap_or_default(), client_secret: client_secret.unwrap_or_default() })
    }
}
