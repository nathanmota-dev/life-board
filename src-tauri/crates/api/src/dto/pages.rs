use serde_json::Value;

use super::common::{Ctx, Dto, object, one_of, text};
use crate::db::schema::pages::PageKind;
use crate::error::Issue;

/// A 2 MiB page can take up to six times that as JSON, with every character escaped.
const CONTENT_BODY_LIMIT: usize = 12 * 1024 * 1024 + 4096;

/// The longest page title, in characters.
pub const MAX_TITLE_CHARS: usize = 200;

/// `POST /pages`: `content` is only for pages and starts empty without it.
/// `parent_id` `null` (or missing) puts the item at the root.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreatePageBody {
    pub kind: PageKind,
    pub title: String,
    pub parent_id: Option<Option<String>>,
    pub content: Option<String>,
}

/// `PATCH /pages/:id`: renames and/or moves (`parent_id` `null` = root).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdatePageBody {
    pub title: Option<String>,
    pub parent_id: Option<Option<String>>,
}

/// `PUT /pages/:id/content`: the markdown, kept exactly as sent (not trimmed).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ReplacePageContentBody {
    pub content: String,
}

/// `POST /pages/import` multipart form fields, which arrive as strings next to `file`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportPageFields {
    pub parent_id: Option<String>,
    /// For example `VBL/AKYOU`: folders reused or created under the parent.
    pub folder_path: Option<String>,
}

impl Dto for CreatePageBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let kind = fields.required(&mut ctx, "kind", one_of);
        let title = fields.required(&mut ctx, "title", text().trim().min(1).max(MAX_TITLE_CHARS));
        let parent_id = fields.nullable(&mut ctx, "parentId", text().min(1));
        let content = fields.optional(&mut ctx, "content", text());
        if kind == Some(PageKind::Folder) && content.is_some() {
            let _: Option<()> = ctx.issue("content", "Only pages have content");
        }
        ctx.finish(Self { kind: kind.unwrap_or_default(), title: title.unwrap_or_default(), parent_id, content })
    }

    const BODY_LIMIT: usize = CONTENT_BODY_LIMIT;
}

impl Dto for UpdatePageBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.optional(&mut ctx, "title", text().trim().min(1).max(MAX_TITLE_CHARS));
        let parent_id = fields.nullable(&mut ctx, "parentId", text().min(1));
        ctx.finish(Self { title, parent_id })
    }
}

impl Dto for ReplacePageContentBody {
    const BODY_LIMIT: usize = CONTENT_BODY_LIMIT;

    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let content = object(&mut ctx, input, "").required(&mut ctx, "content", text());
        ctx.finish(Self { content: content.unwrap_or_default() })
    }
}

impl Dto for ImportPageFields {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let parent_id = fields.optional(&mut ctx, "parentId", text());
        let folder_path = fields.optional(&mut ctx, "folderPath", text().max(2_000));
        // A form sends empty fields as empty strings.
        ctx.finish(Self {
            parent_id: parent_id.filter(|id| !id.is_empty()),
            folder_path: folder_path.filter(|path| !path.is_empty()),
        })
    }
}
