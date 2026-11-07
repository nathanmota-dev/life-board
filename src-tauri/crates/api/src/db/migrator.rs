//! Applies the Drizzle migrations and records them in `__drizzle_migrations`
//! the way Drizzle does, so a profile migrated by Node is a no-op here and the
//! other way around.

use rusqlite::Connection;
use sha2::{Digest, Sha256};

/// One `api/drizzle/<tag>.sql` file and its journal entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Migration {
    pub tag: &'static str,
    /// The journal's `when`, stored as `created_at`.
    pub when: i64,
    pub sql: &'static str,
}

/// Every migration of `api/drizzle/meta/_journal.json`, in journal order.
pub static MIGRATIONS: &[Migration] = include!(concat!(env!("OUT_DIR"), "/migrations.rs"));

/// Drizzle splits files on this marker and runs each part as one statement.
pub const STATEMENT_BREAKPOINT: &str = "--> statement-breakpoint";

impl Migration {
    /// SHA-256 of the whole file, hex encoded: Drizzle's `hash` column.
    pub fn hash(&self) -> String {
        Sha256::digest(self.sql.as_bytes()).iter().map(|byte| format!("{byte:02x}")).collect()
    }

    /// The statements between breakpoints, as Drizzle runs them.
    pub fn statements(&self) -> Vec<&'static str> {
        pending!(51, self)
    }
}

/// Creates `__drizzle_migrations` when missing and applies, in one transaction,
/// the migrations newer than the last recorded `created_at`.
pub fn migrate(conn: &mut Connection, migrations: &[Migration]) -> Result<(), super::DbError> {
    pending!(51, conn, migrations)
}
