use super::*;
use serde_json::Value;

/// A `.regex(...)` check and its message.
type Pattern = (fn(&str) -> bool, &'static str);

/// `z.string()` with optional `.trim()`, `.min()`, `.max()`, `.length()` and a pattern.
#[derive(Clone, Copy)]
pub struct Text {
    trim: bool,
    min: Option<usize>,
    max: Option<usize>,
    pattern: Option<Pattern>,
}

pub const fn text() -> Text {
    Text { trim: false, min: None, max: None, pattern: None }
}

impl Text {
    pub const fn trim(mut self) -> Self {
        self.trim = true;
        self
    }

    pub const fn min(mut self, min: usize) -> Self {
        self.min = Some(min);
        self
    }

    pub const fn max(mut self, max: usize) -> Self {
        self.max = Some(max);
        self
    }

    pub const fn length(self, length: usize) -> Self {
        self.min(length).max(length)
    }

    pub const fn pattern(mut self, matches: fn(&str) -> bool, message: &'static str) -> Self {
        self.pattern = Some((matches, message));
        self
    }
}

impl Rule<String> for Text {
    fn check(&self, ctx: &mut Ctx, value: &Value, path: &str) -> Option<String> {
        let Value::String(raw) = value else {
            return ctx.issue(path, format!("Invalid input: expected string, received {}", kind(value)));
        };
        let text = if self.trim { raw.trim() } else { raw.as_str() };
        // Zod 4 counts code points, so an emoji is one character.
        let length = text.chars().count();
        if let Some(min) = self.min.filter(|min| length < *min) {
            return ctx.issue(path, format!("Too small: expected string to have >={min} characters"));
        }
        if let Some(max) = self.max.filter(|max| length > *max) {
            return ctx.issue(path, format!("Too big: expected string to have <={max} characters"));
        }
        if let Some((matches, message)) = self.pattern
            && !matches(text)
        {
            return ctx.issue(path, message);
        }
        Some(text.to_owned())
    }
}

/// `z.number().int()` (or `z.coerce.number().int()` with [`Int::coerce`]) with bounds.
#[derive(Clone, Copy)]
pub struct Int {
    coerce: bool,
    min: Option<i64>,
    max: Option<i64>,
}

pub const fn int() -> Int {
    Int { coerce: false, min: None, max: None }
}

impl Int {
    pub const fn coerce(mut self) -> Self {
        self.coerce = true;
        self
    }

    pub const fn min(mut self, min: i64) -> Self {
        self.min = Some(min);
        self
    }

    pub const fn max(mut self, max: i64) -> Self {
        self.max = Some(max);
        self
    }

    pub const fn range(self, min: i64, max: i64) -> Self {
        self.min(min).max(max)
    }
}

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

impl Rule<i64> for Int {
    fn check(&self, ctx: &mut Ctx, value: &Value, path: &str) -> Option<i64> {
        let number = match value {
            Value::Number(number) => number.as_f64(),
            other if self.coerce => Some(js_number(other)),
            _ => None,
        };
        let Some(number) = number.filter(|number| !number.is_nan()) else {
            return ctx.issue(path, format!("Invalid input: expected number, received {}", kind(value)));
        };
        if number.fract() != 0.0 || number.abs() > MAX_SAFE_INTEGER {
            return ctx.issue(path, "Invalid input: expected int, received number");
        }
        // Safe integers fit an i64 exactly.
        #[allow(clippy::cast_possible_truncation)]
        let number = number as i64;
        if let Some(min) = self.min.filter(|min| number < *min) {
            return ctx.issue(path, format!("Too small: expected number to be >={min}"));
        }
        if let Some(max) = self.max.filter(|max| number > *max) {
            return ctx.issue(path, format!("Too big: expected number to be <={max}"));
        }
        Some(number)
    }
}
