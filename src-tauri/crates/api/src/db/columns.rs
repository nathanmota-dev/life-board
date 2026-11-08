//! Column conventions (`db/columns.ts`): ULID text ids, timestamps as integer
//! milliseconds, booleans as `0/1` and string arrays as JSON text. In JSON,
//! timestamps look like `Date.toJSON()`: `YYYY-MM-DDTHH:mm:ss.sssZ`.

use chrono::{DateTime, SecondsFormat, TimeZone, Utc};

/// A `timestamp_ms` column.
pub type Timestamp = DateTime<Utc>;

/// Milliseconds since the epoch, as stored on disk.
pub fn to_millis(value: Timestamp) -> i64 {
    value.timestamp_millis()
}

pub fn from_millis(millis: i64) -> Option<Timestamp> {
    Utc.timestamp_millis_opt(millis).single()
}

/// `Date.prototype.toISOString()`.
pub fn to_iso(value: Timestamp) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// A fresh ULID, like `ulid()` in the services.
pub fn new_id() -> String {
    ulid::Ulid::generate().to_string()
}

/// A text enum column (`text(name, { enum })`): the allowed values and their order.
pub trait StringEnum: Sized + Copy + 'static {
    const ALL: &'static [Self];
    fn as_str(self) -> &'static str;
    fn parse(value: &str) -> Option<Self> {
        Self::ALL.iter().copied().find(|item| item.as_str() == value)
    }
}

/// Declares a text enum with its JSON, SQLite and [`StringEnum`] mappings.
macro_rules! string_enum {
    ($(#[$meta:meta])* $vis:vis enum $name:ident { $($variant:ident = $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        $vis enum $name { $($variant),+ }

        impl $crate::db::columns::StringEnum for $name {
            const ALL: &'static [Self] = &[$(Self::$variant),+];
            fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }
        }

        impl $name {
            pub fn as_str(self) -> &'static str {
                <Self as $crate::db::columns::StringEnum>::as_str(self)
            }
        }

        /// The first value; only a placeholder for required DTO fields.
        impl Default for $name {
            fn default() -> Self {
                <Self as $crate::db::columns::StringEnum>::ALL[0]
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl serde::Serialize for $name {
            fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_str(self.as_str())
            }
        }

        impl<'de> serde::Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let text = <String as serde::Deserialize>::deserialize(deserializer)?;
                <Self as $crate::db::columns::StringEnum>::parse(&text)
                    .ok_or_else(|| serde::de::Error::custom(format!("unknown {} {text:?}", stringify!($name))))
            }
        }

        impl rusqlite::types::ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
                Ok(rusqlite::types::ToSqlOutput::from(self.as_str()))
            }
        }

        impl rusqlite::types::FromSql for $name {
            fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
                let text = value.as_str()?;
                <Self as $crate::db::columns::StringEnum>::parse(text)
                    .ok_or_else(|| rusqlite::types::FromSqlError::Other(format!("unknown {} {text:?}", stringify!($name)).into()))
            }
        }
    };
}
pub(crate) use string_enum;

/// `#[serde(with = "js_date")]` for `Timestamp` fields.
pub mod js_date {
    use super::{Timestamp, to_iso};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(value: &Timestamp, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&to_iso(*value))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Timestamp, D::Error> {
        let text = String::deserialize(deserializer)?;
        chrono::DateTime::parse_from_rfc3339(&text).map(|value| value.to_utc()).map_err(serde::de::Error::custom)
    }
}

/// `#[serde(with = "js_date_opt")]` for nullable `Timestamp` fields (`null` in JSON).
pub mod js_date_opt {
    use super::Timestamp;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(value: &Option<Timestamp>, serializer: S) -> Result<S::Ok, S::Error> {
        match value {
            Some(value) => super::js_date::serialize(value, serializer),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Timestamp>, D::Error> {
        Option::<String>::deserialize(deserializer)?
            .map(|text| chrono::DateTime::parse_from_rfc3339(&text).map(|value| value.to_utc()))
            .transpose()
            .map_err(serde::de::Error::custom)
    }
}

/// Reads a `timestamp_ms` column like Drizzle (`new Date(value)`).
pub fn get_timestamp(row: &rusqlite::Row<'_>, column: &str) -> rusqlite::Result<Timestamp> {
    get_timestamp_opt(row, column)?.ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Null, format!("{column} is NULL").into())
    })
}

/// A nullable `timestamp_ms` column.
pub fn get_timestamp_opt(row: &rusqlite::Row<'_>, column: &str) -> rusqlite::Result<Option<Timestamp>> {
    use rusqlite::types::ValueRef;
    let millis = match row.get_ref(column)? {
        ValueRef::Null => return Ok(None),
        ValueRef::Integer(value) => value,
        // `new Date(1.5)` keeps whole milliseconds.
        ValueRef::Real(value) => value.trunc() as i64,
        other => {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                other.data_type(),
                format!("{column} is not a timestamp").into(),
            ));
        }
    };
    from_millis(millis).map(Some).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Integer,
            format!("{column} is out of range").into(),
        )
    })
}

/// A `boolean` column: Drizzle reads `Number(value) === 1`.
pub fn get_bool(row: &rusqlite::Row<'_>, column: &str) -> rusqlite::Result<bool> {
    use rusqlite::types::ValueRef;
    Ok(match row.get_ref(column)? {
        ValueRef::Integer(value) => value == 1,
        ValueRef::Real(value) => value == 1.0,
        ValueRef::Text(text) => std::str::from_utf8(text).is_ok_and(|text| text.trim().parse::<f64>() == Ok(1.0)),
        ValueRef::Null | ValueRef::Blob(_) => false,
    })
}

/// A JSON string array column (`JSON.parse`).
pub fn get_json_list(row: &rusqlite::Row<'_>, column: &str) -> rusqlite::Result<Vec<String>> {
    let text: String = row.get(column)?;
    serde_json::from_str(&text)
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error)))
}

/// A string array as stored on disk (`JSON.stringify`).
pub fn to_json_list(values: &[String]) -> String {
    serde_json::to_string(values).unwrap_or_else(|_| "[]".to_owned())
}

/// `true`/`false` as stored on disk.
pub fn to_bool(value: bool) -> i64 {
    i64::from(value)
}
