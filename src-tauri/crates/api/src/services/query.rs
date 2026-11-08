//! SQL fragments shared by the services.

use rusqlite::types::Value;

/// A piece of a `WHERE` clause with its positional parameters.
#[derive(Debug, Clone, PartialEq)]
pub struct SqlFragment {
    pub sql: String,
    pub params: Vec<Value>,
}

/// Rows whose JSON array `column` contains `value` (`exists (select 1 from json_each(...))`).
pub fn json_array_contains(column: &str, value: &str) -> SqlFragment {
    SqlFragment {
        sql: format!("exists (select 1 from json_each({column}) where json_each.value = ?)"),
        params: vec![Value::Text(value.to_owned())],
    }
}

/// Case-insensitive substring match against any of `columns`; `\`, `%` and `_`
/// in `term` match literally (`like ... escape '\'`).
pub fn search_columns(columns: &[&str], term: &str) -> SqlFragment {
    let mut escaped = String::with_capacity(term.len() + 2);
    escaped.push('%');
    for char in term.chars() {
        if matches!(char, '\\' | '%' | '_') {
            escaped.push('\\');
        }
        escaped.push(char);
    }
    escaped.push('%');
    SqlFragment {
        sql: columns.iter().map(|column| format!("{column} like ? escape '\\'")).collect::<Vec<_>>().join(" or "),
        params: columns.iter().map(|_| Value::Text(escaped.clone())).collect(),
    }
}

/// Drizzle's `and(...)`: the fragments joined with `and` inside one pair of
/// parentheses, `1` when there are none. Like Drizzle, a fragment is not
/// wrapped on its own, so an `or` inside one (`searchColumns` over two columns)
/// binds looser than the `and`s around it.
pub fn and(fragments: Vec<SqlFragment>) -> SqlFragment {
    join(fragments, " and ")
}

/// Drizzle's `or(...)`, with the same parentheses as [`and`].
pub fn or(fragments: Vec<SqlFragment>) -> SqlFragment {
    join(fragments, " or ")
}

fn join(fragments: Vec<SqlFragment>, separator: &str) -> SqlFragment {
    if fragments.is_empty() {
        return SqlFragment { sql: "1".to_owned(), params: Vec::new() };
    }
    let mut params = Vec::new();
    let sql = fragments
        .into_iter()
        .map(|fragment| {
            params.extend(fragment.params);
            fragment.sql
        })
        .collect::<Vec<_>>()
        .join(separator);
    SqlFragment { sql: format!("({sql})"), params }
}

impl SqlFragment {
    /// A fragment without parameters.
    pub fn raw(sql: impl Into<String>) -> Self {
        Self { sql: sql.into(), params: Vec::new() }
    }

    /// A fragment with parameters.
    pub fn new(sql: impl Into<String>, params: Vec<Value>) -> Self {
        Self { sql: sql.into(), params }
    }
}

/// `?, ?, ?` with one placeholder per value.
pub fn placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}

/// The `SET` list of an `UPDATE`, built from the fields a patch carries (Drizzle
/// skips `undefined` ones).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Assignments {
    columns: Vec<String>,
    params: Vec<Value>,
}

impl Assignments {
    pub fn new() -> Self {
        Self::default()
    }

    /// `column = ?`; `column` is quoted, so `order` works.
    pub fn set(&mut self, column: &str, value: impl Into<Value>) -> &mut Self {
        self.columns.push(format!("\"{column}\" = ?"));
        self.params.push(value.into());
        self
    }

    /// Sets `column` only when the patch has a value for it.
    pub fn maybe<T: Into<Value>>(&mut self, column: &str, value: Option<T>) -> &mut Self {
        if let Some(value) = value {
            self.set(column, value);
        }
        self
    }

    pub fn is_empty(&self) -> bool {
        self.columns.is_empty()
    }

    /// `a = ?, b = ?` and its parameters.
    pub fn into_fragment(self) -> SqlFragment {
        SqlFragment { sql: self.columns.join(", "), params: self.params }
    }
}

/// A text enum as a parameter.
pub fn enum_value<E: crate::db::columns::StringEnum>(value: E) -> Value {
    Value::Text(value.as_str().to_owned())
}

/// A nullable text enum as a parameter.
pub fn enum_opt<E: crate::db::columns::StringEnum>(value: Option<E>) -> Value {
    value.map_or(Value::Null, enum_value)
}

/// A timestamp as a parameter (milliseconds).
pub fn time_value(value: crate::db::columns::Timestamp) -> Value {
    Value::Integer(crate::db::columns::to_millis(value))
}

/// A nullable timestamp as a parameter.
pub fn time_opt(value: Option<crate::db::columns::Timestamp>) -> Value {
    value.map_or(Value::Null, time_value)
}

/// A string array as a parameter (JSON text).
pub fn list_value(values: &[String]) -> Value {
    Value::Text(crate::db::columns::to_json_list(values))
}

/// Runs `sql` and maps every row.
pub fn query_all<T>(
    conn: &rusqlite::Connection,
    sql: &str,
    params: &[Value],
    map: impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
) -> rusqlite::Result<Vec<T>> {
    let mut statement = conn.prepare(sql)?;
    statement.query_map(rusqlite::params_from_iter(params.iter()), map)?.collect()
}

/// Runs `sql` and maps the first row, if any.
pub fn query_first<T>(
    conn: &rusqlite::Connection,
    sql: &str,
    params: &[Value],
    map: impl FnOnce(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
) -> rusqlite::Result<Option<T>> {
    use rusqlite::OptionalExtension;
    let mut statement = conn.prepare(sql)?;
    statement.query_row(rusqlite::params_from_iter(params.iter()), map).optional()
}
