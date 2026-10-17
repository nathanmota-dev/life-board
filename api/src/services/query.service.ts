import { sql, type AnyColumn, type SQL } from "drizzle-orm"

/** Matches rows whose JSON array column contains `value`. */
export function jsonArrayContains(column: AnyColumn, value: string): SQL {
  return sql`exists (select 1 from json_each(${column}) where json_each.value = ${value})`
}

/** Case-insensitive substring match against any of the columns. */
export function searchColumns(columns: AnyColumn[], term: string): SQL {
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  return sql.join(
    columns.map((column) => sql`${column} like ${pattern} escape '\\'`),
    sql` or `,
  )
}
