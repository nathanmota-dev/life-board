//! SQL fragments shared by the services (`query.service.ts`).

use rusqlite::types::Value;

/// A piece of a `WHERE` clause with its positional parameters.
#[derive(Debug, Clone, PartialEq)]
pub struct SqlFragment {
    pub sql: String,
    pub params: Vec<Value>,
}

/// Rows whose JSON array `column` contains `value` (`exists (select 1 from json_each(...))`).
pub fn json_array_contains(column: &str, value: &str) -> SqlFragment {
    pending!(51, column, value)
}

/// Case-insensitive substring match against any of `columns`; `\`, `%` and `_`
/// in `term` match literally (`like ... escape '\'`).
pub fn search_columns(columns: &[&str], term: &str) -> SqlFragment {
    pending!(51, columns, term)
}
