//! Applies the Drizzle migrations and records them in `__drizzle_migrations`
//! the way Drizzle does, so a profile migrated by Node is a no-op here and the
//! other way around.

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use sha2::{Digest, Sha256};

/// One `migrations/<tag>.sql` file and its journal entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Migration {
    pub tag: &'static str,
    /// The journal's `when`, stored as `created_at`.
    pub when: i64,
    pub sql: &'static str,
}

/// Every migration of `migrations/meta/_journal.json`, in journal order.
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
        self.sql.split(STATEMENT_BREAKPOINT).collect()
    }
}

/// Creates `__drizzle_migrations` when missing and applies, in one transaction,
/// the migrations newer than the last recorded `created_at`.
pub fn migrate(conn: &mut Connection, migrations: &[Migration]) -> Result<(), super::DbError> {
    conn.execute_batch(CREATE_MIGRATIONS_TABLE)?;
    let last: Option<f64> = conn
        .query_row(
            "SELECT id, hash, created_at FROM \"__drizzle_migrations\" ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get::<_, Option<f64>>(2),
        )
        .optional()?
        .flatten();
    let pending: Vec<&Migration> = migrations
        .iter()
        .filter(|migration| last.is_none_or(|created_at| created_at < migration.when as f64))
        .collect();

    // libSQL's `migrate()`: foreign keys off, one deferred transaction, foreign keys back on.
    conn.execute_batch("PRAGMA foreign_keys=off")?;
    let applied = apply(conn, &pending);
    let restored = conn.execute_batch("PRAGMA foreign_keys=on");
    applied?;
    restored?;
    Ok(())
}

/// Drizzle's statement, whitespace included: SQLite stores it in `sqlite_master`.
const CREATE_MIGRATIONS_TABLE: &str = "\n\t\tCREATE TABLE IF NOT EXISTS \"__drizzle_migrations\" (\n\t\t\tid SERIAL PRIMARY KEY,\n\t\t\thash text NOT NULL,\n\t\t\tcreated_at numeric\n\t\t)\n\t";

fn apply(conn: &mut Connection, pending: &[&Migration]) -> Result<(), super::DbError> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
    for migration in pending {
        for statement in migration.statements() {
            tx.execute_batch(statement).map_err(|source| super::DbError::Migration { tag: migration.tag, source })?;
        }
        tx.execute(
            "INSERT INTO \"__drizzle_migrations\" (\"hash\", \"created_at\") VALUES(?, ?)",
            params![migration.hash(), migration.when],
        )?;
    }
    tx.commit()?;
    Ok(())
}
