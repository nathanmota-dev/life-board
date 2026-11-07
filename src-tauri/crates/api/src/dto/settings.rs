use serde_json::Value;

use super::common::{Ctx, Dto, object, text};
use crate::error::Issue;

/// `updateFilesSettingsBody`: `baseDir` is required and nullable; `null` moves
/// uploads back to the data directory.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateFilesSettingsBody {
    pub base_dir: Option<String>,
}

impl Dto for UpdateFilesSettingsBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let base_dir = fields.required_nullable(&mut ctx, "baseDir", text().trim().min(1).max(1024));
        ctx.finish(Self { base_dir: base_dir.flatten() })
    }
}
