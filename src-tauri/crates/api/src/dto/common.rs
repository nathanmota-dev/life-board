//! Shared rules and the small toolkit that applies Zod's
//! semantics by hand: required vs optional vs nullable fields, defaults,
//! trimming, string lengths in code points, `z.coerce` for query strings and dates, and
//! issues collected with JSON-pointer paths.

mod scalars;
pub use scalars::*;
mod dates;
pub use dates::*;

use serde::Serialize;
use serde_json::{Map, Value};

use crate::db::columns::StringEnum;
use crate::error::Issue;

/// A request DTO: built from the JSON body, or from the query string or path
/// parameters, which arrive as an object of strings.
pub trait Dto: Sized {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>>;
}

/// The issues found while parsing one input.
#[derive(Debug, Default)]
pub struct Ctx {
    issues: Vec<Issue>,
}

impl Ctx {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn issue<T>(&mut self, path: &str, message: impl Into<String>) -> Option<T> {
        self.issues.push(Issue::new(path, message));
        None
    }

    pub fn finish<T>(self, value: T) -> Result<T, Vec<Issue>> {
        if self.issues.is_empty() { Ok(value) } else { Err(self.issues) }
    }
}

/// How one value is checked and converted. Closures and the rule types below implement it.
pub trait Rule<T> {
    fn check(&self, ctx: &mut Ctx, value: &Value, path: &str) -> Option<T>;
}

impl<T, F: Fn(&mut Ctx, &Value, &str) -> Option<T>> Rule<T> for F {
    fn check(&self, ctx: &mut Ctx, value: &Value, path: &str) -> Option<T> {
        self(ctx, value, path)
    }
}

/// The fields of a `z.object(...)`. Unknown keys are ignored, like Zod's default strip.
pub struct Fields<'a> {
    map: Option<&'a Map<String, Value>>,
    prefix: String,
}

/// Starts reading an object at `path` ("" for the root).
pub fn object<'a>(ctx: &mut Ctx, value: &'a Value, path: &str) -> Fields<'a> {
    let map = match value {
        Value::Object(map) => Some(map),
        other => ctx.issue(path, format!("Invalid input: expected object, received {}", kind(other))),
    };
    Fields { map, prefix: path.to_owned() }
}

impl<'a> Fields<'a> {
    fn path(&self, key: &str) -> String {
        format!("{}/{key}", self.prefix)
    }

    fn get(&self, key: &str) -> Option<&'a Value> {
        self.map.and_then(|map| map.get(key))
    }

    /// A field that must be present.
    pub fn required<T>(&self, ctx: &mut Ctx, key: &str, rule: impl Rule<T>) -> Option<T> {
        self.map?;
        match self.get(key) {
            Some(value) => rule.check(ctx, value, &self.path(key)),
            None => ctx.issue(&self.path(key), "Invalid input: expected a value, received undefined"),
        }
    }

    /// `.optional()` (or a `.partial()` field): `None` when missing.
    pub fn optional<T>(&self, ctx: &mut Ctx, key: &str, rule: impl Rule<T>) -> Option<T> {
        let value = self.get(key)?;
        rule.check(ctx, value, &self.path(key))
    }

    /// `.nullable()` inside `.partial()`: `None` when missing, `Some(None)` for `null`.
    pub fn nullable<T>(&self, ctx: &mut Ctx, key: &str, rule: impl Rule<T>) -> Option<Option<T>> {
        match self.get(key)? {
            Value::Null => Some(None),
            value => rule.check(ctx, value, &self.path(key)).map(Some),
        }
    }

    /// A required `.nullable()` field: `null` is a value, missing is an issue.
    pub fn required_nullable<T>(&self, ctx: &mut Ctx, key: &str, rule: impl Rule<T>) -> Option<Option<T>> {
        self.map?;
        match self.get(key) {
            Some(Value::Null) => Some(None),
            Some(value) => rule.check(ctx, value, &self.path(key)).map(Some),
            None => ctx.issue(&self.path(key), "Invalid input: expected a value, received undefined"),
        }
    }

    /// `.default(value)`: the default when missing.
    pub fn defaulted<T>(&self, ctx: &mut Ctx, key: &str, rule: impl Rule<T>, default: T) -> Option<T> {
        match self.get(key) {
            Some(value) => rule.check(ctx, value, &self.path(key)),
            None => Some(default),
        }
    }
}

fn kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// `Number(value)` for the values `z.coerce.number()` receives.
pub fn js_number(value: &Value) -> f64 {
    match value {
        Value::Null => 0.0,
        Value::Bool(flag) => f64::from(u8::from(*flag)),
        Value::Number(number) => number.as_f64().unwrap_or(f64::NAN),
        Value::String(text) => js_string_to_number(text),
        Value::Array(_) | Value::Object(_) => f64::NAN,
    }
}

fn js_string_to_number(text: &str) -> f64 {
    let text = text.trim();
    if text.is_empty() {
        return 0.0;
    }
    for (prefix, radix) in [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)] {
        if let Some(digits) = text.strip_prefix(prefix) {
            return u64::from_str_radix(digits, radix).map_or(f64::NAN, |number| number as f64);
        }
    }
    match text {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    // Rust also reads "inf" and "NaN", which JavaScript doesn't.
    if text.chars().any(|c| c.is_ascii_alphabetic() && c != 'e' && c != 'E') {
        return f64::NAN;
    }
    text.parse().unwrap_or(f64::NAN)
}

/// `z.boolean()`.
pub fn boolean(ctx: &mut Ctx, value: &Value, path: &str) -> Option<bool> {
    match value {
        Value::Bool(flag) => Some(*flag),
        other => ctx.issue(path, format!("Invalid input: expected boolean, received {}", kind(other))),
    }
}

/// `z.enum(["true", "false"]).transform(...)`: query-string booleans.
pub fn query_bool(ctx: &mut Ctx, value: &Value, path: &str) -> Option<bool> {
    match value.as_str() {
        Some("true") => Some(true),
        Some("false") => Some(false),
        _ => ctx.issue(path, r#"Invalid option: expected one of "true"|"false""#),
    }
}

/// `z.stringbool()`.
pub fn string_bool(ctx: &mut Ctx, value: &Value, path: &str) -> Option<bool> {
    let text = value.as_str().map(|text| text.trim().to_lowercase());
    match text.as_deref() {
        Some("true" | "1" | "yes" | "on" | "y" | "enabled") => Some(true),
        Some("false" | "0" | "no" | "off" | "n" | "disabled") => Some(false),
        _ => ctx.issue(path, "Invalid input: expected a boolean string"),
    }
}

/// `z.enum([...])` over a text enum column.
pub fn one_of<E: StringEnum>(ctx: &mut Ctx, value: &Value, path: &str) -> Option<E> {
    if let Some(item) = value.as_str().and_then(E::parse) {
        return Some(item);
    }
    let options = E::ALL.iter().map(|item| format!("{:?}", item.as_str())).collect::<Vec<_>>().join("|");
    ctx.issue(path, format!("Invalid option: expected one of {options}"))
}

/// `z.array(item)` with `.min()` and `.max()` on its length.
pub fn list<T>(item: impl Rule<T>, min: usize, max: usize) -> impl Fn(&mut Ctx, &Value, &str) -> Option<Vec<T>> {
    move |ctx, value, path| {
        let Value::Array(values) = value else {
            return ctx.issue(path, format!("Invalid input: expected array, received {}", kind(value)));
        };
        if values.len() < min {
            return ctx.issue(path, format!("Too small: expected array to have >={min} items"));
        }
        if values.len() > max {
            return ctx.issue(path, format!("Too big: expected array to have <={max} items"));
        }
        let items: Vec<Option<T>> = values
            .iter()
            .enumerate()
            .map(|(index, value)| item.check(ctx, value, &format!("{path}/{index}")))
            .collect();
        items.into_iter().collect()
    }
}

fn is_day_key(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        })
}

fn is_hex_color(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// `dayKey`: `YYYY-MM-DD`.
pub const DAY_KEY: Text = text().pattern(is_day_key, "Expected a YYYY-MM-DD day");

/// `hexColor`: `#rrggbb`.
pub const HEX_COLOR: Text = text().pattern(is_hex_color, "Expected a #rrggbb color");

/// `tagList`: up to 20 tags of up to 40 characters.
pub fn tag_list() -> impl Fn(&mut Ctx, &Value, &str) -> Option<Vec<String>> {
    list(text().max(40), 0, 20)
}

/// `idList`: up to 50 ids.
pub fn id_list() -> impl Fn(&mut Ctx, &Value, &str) -> Option<Vec<String>> {
    list(text(), 0, 50)
}

/// `limit(max, fallback)`: a query integer between 1 and `max`, `fallback` when missing.
pub fn limit(fields: &Fields<'_>, ctx: &mut Ctx, max: i64, fallback: i64) -> Option<i64> {
    fields.defaulted(ctx, "limit", int().coerce().range(1, max), fallback)
}

/// `idParams`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IdParams {
    pub id: String,
}

impl Dto for IdParams {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let id = fields.required(&mut ctx, "id", text().min(1));
        ctx.finish(Self { id: id.unwrap_or_default() })
    }
}

/// `okResponse`: `{ "ok": true }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

pub const OK_RESPONSE: OkResponse = OkResponse { ok: true };

/// `{ items }`, the shape of every list response.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Items<T> {
    pub items: Vec<T>,
}
