use serde_json::Value;

use super::common::{Ctx, DAY_KEY, Dto, Int, Rule, Text, int, object, text};
use crate::error::Issue;

const NAME: Text = text().trim().min(1).max(120);
const UNIT: Text = text().trim().min(1).max(40);
const AMOUNT: Int = int().range(1, 10_000);
const EMOJI: Text = text().trim().min(1).max(32);

/// `createHabitBody`: `name` and `target` required; strings are trimmed.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateHabitBody {
    pub name: String,
    pub unit: Option<String>,
    pub target: i64,
    pub step: Option<i64>,
    pub emoji: Option<String>,
}

/// `updateHabitBody`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateHabitBody {
    pub name: Option<String>,
    pub unit: Option<String>,
    pub target: Option<i64>,
    pub step: Option<i64>,
    pub emoji: Option<String>,
}

/// `logHabitBody`: `delta` between -10000 and 10000 and never 0; `day` defaults to today.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LogHabitBody {
    pub delta: i64,
    pub day: Option<String>,
}

/// `habitLogParams`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HabitLogParams {
    pub id: String,
    pub day: String,
}

/// `setHabitLogBody`: `count` 0–1000000.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SetHabitLogBody {
    pub count: i64,
}

/// `listHabitLogsQuery`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ListHabitLogsQuery {
    pub from: Option<String>,
    pub to: Option<String>,
    pub habit_id: Option<String>,
}

impl Dto for CreateHabitBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let name = fields.required(&mut ctx, "name", NAME);
        let unit = fields.optional(&mut ctx, "unit", UNIT);
        let target = fields.required(&mut ctx, "target", AMOUNT);
        let step = fields.optional(&mut ctx, "step", AMOUNT);
        let emoji = fields.optional(&mut ctx, "emoji", EMOJI);
        ctx.finish(Self { name: name.unwrap_or_default(), unit, target: target.unwrap_or_default(), step, emoji })
    }
}

impl Dto for UpdateHabitBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let name = fields.optional(&mut ctx, "name", NAME);
        let unit = fields.optional(&mut ctx, "unit", UNIT);
        let target = fields.optional(&mut ctx, "target", AMOUNT);
        let step = fields.optional(&mut ctx, "step", AMOUNT);
        let emoji = fields.optional(&mut ctx, "emoji", EMOJI);
        ctx.finish(Self { name, unit, target, step, emoji })
    }
}

fn delta(ctx: &mut Ctx, value: &Value, path: &str) -> Option<i64> {
    match int().range(-10_000, 10_000).check(ctx, value, path)? {
        0 => ctx.issue(path, "delta cannot be 0"),
        delta => Some(delta),
    }
}

impl Dto for LogHabitBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let delta = fields.required(&mut ctx, "delta", delta);
        let day = fields.optional(&mut ctx, "day", DAY_KEY);
        ctx.finish(Self { delta: delta.unwrap_or_default(), day })
    }
}

impl Dto for HabitLogParams {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let id = fields.required(&mut ctx, "id", text().min(1));
        let day = fields.required(&mut ctx, "day", DAY_KEY);
        ctx.finish(Self { id: id.unwrap_or_default(), day: day.unwrap_or_default() })
    }
}

impl Dto for SetHabitLogBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let count = fields.required(&mut ctx, "count", int().range(0, 1_000_000));
        ctx.finish(Self { count: count.unwrap_or_default() })
    }
}

impl Dto for ListHabitLogsQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let from = fields.optional(&mut ctx, "from", DAY_KEY);
        let to = fields.optional(&mut ctx, "to", DAY_KEY);
        let habit_id = fields.optional(&mut ctx, "habitId", text());
        ctx.finish(Self { from, to, habit_id })
    }
}
