import fetch from "node-fetch";

export async function createBackup(options: {
  accountId: string;
  databaseId: string;
  apiKey: string;
  // Default to 1000
  limit?: number;
}) {
  const limit = options.limit ?? 1000;
  const lines: string[] = [];
  function append(command: string) {
    lines.push(command);
  }

  async function fetchD1<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${options.databaseId}/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          sql,
          params,
        }),
      },
    );

    const body = (await response.json()) as any;
    if ("errors" in body && body.errors.length) {
      throw new Error(
        `D1 Error: ${body.errors
          .map((error: { message: string }) => error.message)
          .join(", ")}`,
      );
    }

    return body.result as {
      meta: {};
      results: T[];
      success: boolean;
    }[];
  }

  let writableSchema: boolean = false;

  {
    const [tables] = await fetchD1<{ name: string; type: string; sql: string }>(
      "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL AND type = 'table' ORDER BY rootpage DESC",
    );

    for (let table of tables.results) {
      if (typeof table.name !== "string") {
        console.warn(`Table name is not string: ${table.name}`);
        continue;
      }
      if (table.name.startsWith("_cf_")) {
        continue; // we're not allowed access to these
      } else if (table.name === "sqlite_sequence") {
        append("DELETE FROM sqlite_sequence;");
      } else if (table.name === "sqlite_stat1") {
        append("ANALYZE sqlite_master;");
      } else if (table.name.startsWith("sqlite_")) {
        continue;
      } else if (
        typeof table.sql === "string" &&
        table.sql.startsWith("CREATE VIRTUAL TABLE")
      ) {
        if (!writableSchema) {
          append("PRAGMA writable_schema=ON;");

          writableSchema = true;
        }

        const tableName = table.name.replace("'", "''");

        append(
          `INSERT INTO sqlite_master (type, name, tbl_name, rootpage, sql) VALUES ('table', '${tableName}', '${tableName}', 0, '${table.sql.replace(
            /'/g,
            "''",
          )}');`,
        );

        continue;
      } else if (
        typeof table.sql === "string" &&
        table.sql.toUpperCase().startsWith("CREATE TABLE ")
      ) {
        append(
          `CREATE TABLE IF NOT EXISTS ${table.sql.substring(
            "CREATE TABLE ".length,
          )};`,
        );
      } else {
        append(`${table.sql};`);
      }

      const tableNameIndent = table.name.replace('"', '""');

      // PRAGMA table_info is returning unauthorized on experimental D1 backend

      //const tableInfo = await originDatabase.prepare(`PRAGMA table_info("${tableNameIndent}")`).all<SqliteTableInfoRow>();
      //const columnNames = tableInfo.results.map((row) => row.name);

      const [tableRow] = await fetchD1(
        `SELECT * FROM "${tableNameIndent}" LIMIT 1`,
      );

      if (tableRow.results[0]) {
        const columnNames = Object.keys(tableRow.results[0]);

        const [tableRowCount] = await fetchD1<{ count: number }>(
          `SELECT COUNT(*) AS count FROM "${tableNameIndent}"`,
        );

        if (tableRowCount === null) {
          throw new Error("Failed to get table row count from table.");
        }

        for (
          let offset = 0;
          offset <= tableRowCount.results[0].count;
          offset += limit
        ) {
          const queries = [];

          // D1 said maximum depth is 20, but the limit is seemingly at 9.
          for (let index = 0; index < columnNames.length; index += 9) {
            const currentColumnNames = columnNames.slice(
              index,
              Math.min(index + 9, columnNames.length),
            );

            queries.push(
              `SELECT '${currentColumnNames
                .map(
                  (columnName) =>
                    `'||quote("${columnName.replace('"', '""')}")||'`,
                )
                .join(
                  ", ",
                )}' AS partialCommand FROM "${tableNameIndent}" LIMIT ${limit} OFFSET ${offset}`,
            );
          }

          const results = await fetchD1<{ partialCommand: string }>(
            queries.join(";\n"),
          );

          if (results.length && results[0].results.length) {
            for (let result = 1; result < results.length; result++) {
              if (
                results[result].results.length !== results[0].results.length
              ) {
                throw new Error(
                  "Failed to split expression tree into several queries properly.",
                );
              }
            }

            for (let row = 0; row < results[0].results.length; row++) {
              let columns: string[] = [];

              for (let result = 0; result < results.length; result++) {
                columns.push(
                  results[result].results[row].partialCommand as string,
                );
              }

              append(
                `INSERT INTO "${tableNameIndent}" (${columnNames
                  .map((columnName) => `"${columnName}"`)
                  .join(", ")}) VALUES (${columns
                  .map((column) => column.replace("\n", "\\n"))
                  .join(", ")});`,
              );
            }
          }
        }
      }
    }
  }

  {
    const [schemas] = await fetchD1(
      "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('index', 'trigger', 'view')",
    );

    if (schemas.results.length) {
      for (let schema of schemas.results) {
        append(`${schema.sql};`);
      }
    }
  }

  if (writableSchema) {
    append("PRAGMA writable_schema=OFF;");
  }

  return lines.join("\n");
}
