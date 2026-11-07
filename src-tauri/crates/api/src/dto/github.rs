use serde_json::Value;

use super::common::{Ctx, Dto, limit, object, one_of, text};
use crate::db::schema::github::{GithubIssueKind, GithubKind};
use crate::error::Issue;

/// `connectGithubBody`: `orgFilter` is optional and nullable.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ConnectGithubBody {
    pub token: String,
    pub org_filter: Option<Option<String>>,
}

/// `listPrsQuery`: `limit` 1–200, default 100.
#[derive(Debug, Clone, PartialEq)]
pub struct ListPrsQuery {
    pub kind: Option<GithubKind>,
    pub limit: i64,
}

/// `listIssuesQuery`: issue kinds only; `limit` 1–200, default 100.
#[derive(Debug, Clone, PartialEq)]
pub struct ListIssuesQuery {
    pub kind: Option<GithubIssueKind>,
    pub limit: i64,
}

/// `recentReposQuery`: `limit` 1–20, default 4.
#[derive(Debug, Clone, PartialEq)]
pub struct RecentReposQuery {
    pub limit: i64,
}

impl Default for ListPrsQuery {
    fn default() -> Self {
        Self { kind: None, limit: 100 }
    }
}

impl Default for ListIssuesQuery {
    fn default() -> Self {
        Self { kind: None, limit: 100 }
    }
}

impl Default for RecentReposQuery {
    fn default() -> Self {
        Self { limit: 4 }
    }
}

impl Dto for ConnectGithubBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let token = fields.required(&mut ctx, "token", text().min(20).max(200));
        let org_filter = fields.nullable(&mut ctx, "orgFilter", text().max(120));
        ctx.finish(Self { token: token.unwrap_or_default(), org_filter })
    }
}

impl Dto for ListPrsQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let kind = fields.optional(&mut ctx, "kind", one_of);
        let limit = limit(&fields, &mut ctx, 200, 100);
        ctx.finish(Self { kind, limit: limit.unwrap_or_default() })
    }
}

impl Dto for ListIssuesQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let kind = fields.optional(&mut ctx, "kind", one_of);
        let limit = limit(&fields, &mut ctx, 200, 100);
        ctx.finish(Self { kind, limit: limit.unwrap_or_default() })
    }
}

impl Dto for RecentReposQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let limit = limit(&fields, &mut ctx, 20, 4);
        ctx.finish(Self { limit: limit.unwrap_or_default() })
    }
}
