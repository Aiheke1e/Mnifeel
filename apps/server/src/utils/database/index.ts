import postgres from "postgres";

export type Database = postgres.Sql;
export type DatabaseTransaction = postgres.TransactionSql;

let database: Database | undefined;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("缺少 DATABASE_URL，无法连接 PostgreSQL");
  return databaseUrl;
}

export function getDatabase() {
  return database ??= postgres(getDatabaseUrl(), {
    max: 20,
    connect_timeout: 10,
    idle_timeout: 30,
  });
}

export async function checkDatabase() {
  await getDatabase()`select 1`;
}

export function withTransaction<T>(callback: (transaction: DatabaseTransaction) => Promise<T>) {
  return getDatabase().begin(callback);
}

export async function closeDatabase() {
  const current = database;
  database = undefined;
  if (current) await current.end({ timeout: 5 });
}
