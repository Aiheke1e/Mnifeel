import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { Database, DatabaseTransaction } from "@/utils/database";
import { getDatabase } from "@/utils/database";

export async function writeAudit({
  adminUserId,
  action,
  targetType,
  targetId,
  details = {},
  database = getDatabase(),
}: {
  adminUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: postgres.JSONValue;
  database?: Database | DatabaseTransaction;
}) {
  await database`
    insert into "auditLogs" ("id", "adminUserId", "action", "targetType", "targetId", "details")
    values (${randomUUID()}, ${adminUserId}, ${action}, ${targetType ?? null}, ${targetId ?? null}, ${database.json(details)})
  `;
}
