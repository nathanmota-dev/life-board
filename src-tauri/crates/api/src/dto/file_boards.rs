use serde_json::Value;

use super::common::{Ctx, Dto, HEX_COLOR, date, id_list, int, object, one_of, tag_list, text};
use crate::db::columns::Timestamp;
use crate::db::schema::file_boards::{BoardKind, FileKind};
use crate::error::Issue;

/// The multipart upload limit: 20 MiB, one file.
pub const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;

/// `createBoardBody`: `name` required.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateBoardBody {
    pub name: String,
    pub description: Option<Option<String>>,
    pub kind: Option<BoardKind>,
    pub color: Option<String>,
}

/// `updateBoardBody`: the board fields plus `coverItemId`, all optional.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateBoardBody {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub kind: Option<BoardKind>,
    pub color: Option<String>,
    pub cover_item_id: Option<Option<String>>,
}

/// `updateItemBody`: the item fields plus `tags` and `linkedTaskIds`, all optional.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateItemBody {
    pub kind: Option<FileKind>,
    pub title: Option<Option<String>>,
    pub notes: Option<Option<String>>,
    pub amount_cents: Option<Option<i64>>,
    pub currency: Option<Option<String>>,
    pub taken_at: Option<Option<Timestamp>>,
    pub tags: Option<Vec<String>>,
    pub linked_task_ids: Option<Vec<String>>,
}

/// `uploadItemFields`: multipart form fields, which arrive as strings next to `file`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UploadItemFields {
    pub kind: Option<FileKind>,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub amount_cents: Option<i64>,
    pub currency: Option<String>,
    pub taken_at: Option<Timestamp>,
}

impl Dto for CreateBoardBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let name = fields.required(&mut ctx, "name", text().min(1).max(120));
        let description = fields.nullable(&mut ctx, "description", text().max(2_000));
        let kind = fields.optional(&mut ctx, "kind", one_of);
        let color = fields.optional(&mut ctx, "color", HEX_COLOR);
        ctx.finish(Self { name: name.unwrap_or_default(), description, kind, color })
    }
}

impl Dto for UpdateBoardBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let name = fields.optional(&mut ctx, "name", text().min(1).max(120));
        let description = fields.nullable(&mut ctx, "description", text().max(2_000));
        let kind = fields.optional(&mut ctx, "kind", one_of);
        let color = fields.optional(&mut ctx, "color", HEX_COLOR);
        let cover_item_id = fields.nullable(&mut ctx, "coverItemId", text());
        ctx.finish(Self { name, description, kind, color, cover_item_id })
    }
}

impl Dto for UpdateItemBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let kind = fields.optional(&mut ctx, "kind", one_of);
        let title = fields.nullable(&mut ctx, "title", text().max(200));
        let notes = fields.nullable(&mut ctx, "notes", text().max(2_000));
        let amount_cents = fields.nullable(&mut ctx, "amountCents", int().min(0));
        let currency = fields.nullable(&mut ctx, "currency", text().length(3));
        let taken_at = fields.nullable(&mut ctx, "takenAt", date);
        let tags = fields.optional(&mut ctx, "tags", tag_list());
        let linked_task_ids = fields.optional(&mut ctx, "linkedTaskIds", id_list());
        ctx.finish(Self { kind, title, notes, amount_cents, currency, taken_at, tags, linked_task_ids })
    }
}

impl Dto for UploadItemFields {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let kind = fields.optional(&mut ctx, "kind", one_of);
        let title = fields.optional(&mut ctx, "title", text().max(200));
        let notes = fields.optional(&mut ctx, "notes", text().max(2_000));
        let amount_cents = fields.optional(&mut ctx, "amountCents", int().coerce().min(0));
        let currency = fields.optional(&mut ctx, "currency", text().length(3));
        let taken_at = fields.optional(&mut ctx, "takenAt", date);
        ctx.finish(Self { kind, title, notes, amount_cents, currency, taken_at })
    }
}
