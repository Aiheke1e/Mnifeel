import initialSchema from "@/utils/database/migrations/initialSchema";
import authRateLimits from "@/utils/database/migrations/authRateLimits";
import { checkDatabase, closeDatabase, getDatabase } from "@/utils/database";
import type { Migration } from "@/utils/database/types";

const migrations: Migration[] = [initialSchema, authRateLimits];

export default async function migrateDatabase() {
  const database = getDatabase();
  await database.begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext('minifeelSchemaMigrations'))`;
    await transaction`
      create table if not exists "schemaMigrations" (
        "name" text primary key,
        "appliedAt" timestamptz not null default now()
      )
    `;

    for (const migration of migrations) {
      const applied = await transaction<{ name: string }[]>`
        select "name" from "schemaMigrations" where "name" = ${migration.name}
      `;
      if (applied.length) continue;
      await transaction.unsafe(migration.sql);
      await transaction`insert into "schemaMigrations" ("name") values (${migration.name})`;
    }
  });
}

if (import.meta.main) {
  try {
    await checkDatabase();
    await migrateDatabase();
    console.log("数据库迁移完成");
  } finally {
    await closeDatabase();
  }
}
