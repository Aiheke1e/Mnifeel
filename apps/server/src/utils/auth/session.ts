import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { getDatabase } from "@/utils/database";
import type { UserRole, UserStatus } from "@/utils/database/types";

export const sessionCookieName = "minifeelSession";

export type AuthUser = {
  id: string;
  role: UserRole;
  status: UserStatus;
  isWhitelist: boolean;
  phone: string | null;
  email: string | null;
  hasPassword: boolean;
};

export type AuthContext = {
  user: AuthUser;
  sessionId: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(request: Request, name: string) {
  const header = request.headers.cookie;
  if (!header) return;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return;
    }
  }
}

function sessionDays() {
  const value = Number(process.env.MINIFEEL_SESSION_DAYS ?? 30);
  return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 30;
}

function usesSecureSessionCookie() {
  return process.env.NODE_ENV === "production" && process.env.MINIFEEL_SECURE_COOKIES !== "false";
}

export function setSessionCookie(response: Response, token: string) {
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: usesSecureSessionCookie(),
    maxAge: sessionDays() * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: usesSecureSessionCookie(),
    path: "/",
  });
}

export async function createSession(userId: string, request: Request, response: Response) {
  const token = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  const days = sessionDays();
  const database = getDatabase();
  await database.begin(async transaction => {
    await transaction`
      insert into "userSessions" (
        "id", "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt"
      ) values (
        ${sessionId}, ${userId}, ${hashToken(token)}, ${request.get("user-agent")?.slice(0, 512) ?? null},
        ${request.ip?.slice(0, 64) ?? null}, now() + ${days} * interval '1 day'
      )
    `;
    await transaction`
      update "userSessions" set "revokedAt" = now()
      where "userId" = ${userId} and "revokedAt" is null and "expiresAt" > now()
        and "id" not in (
          select "id" from "userSessions"
          where "userId" = ${userId} and "revokedAt" is null and "expiresAt" > now()
          order by "id" = ${sessionId} desc, "createdAt" desc, "id" desc limit 2
        )
    `;
  });
  setSessionCookie(response, token);
  return sessionId;
}

export async function resolveSession(request: Request): Promise<AuthContext | null> {
  const token = readCookie(request, sessionCookieName);
  if (!token || token.length > 256) return null;
  const database = getDatabase();
  const rows = await database<{
    sessionId: string;
    id: string;
    role: UserRole;
    status: UserStatus;
    isWhitelist: boolean;
    passwordHash: string | null;
    phone: string | null;
    email: string | null;
  }[]>`
    select s."id" as "sessionId", u."id", u."role", u."status", u."isWhitelist", u."passwordHash",
      (select i."identifier" from "userIdentities" i where i."userId" = u."id" and i."type" = 'phone' limit 1) as "phone",
      (select i."identifier" from "userIdentities" i where i."userId" = u."id" and i."type" in ('mockGoogle', 'google') order by i."type" desc limit 1) as "email"
    from "userSessions" s join "users" u on u."id" = s."userId"
    where s."tokenHash" = ${hashToken(token)} and s."revokedAt" is null and s."expiresAt" > now()
    limit 1
  `;
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  await database`
    update "userSessions" set "lastUsedAt" = now()
    where "id" = ${row.sessionId} and "lastUsedAt" < now() - interval '5 minutes'
  `;
  return {
    sessionId: row.sessionId,
    user: {
      id: row.id,
      role: row.role,
      status: row.status,
      isWhitelist: row.isWhitelist,
      phone: row.phone,
      email: row.email,
      hasPassword: row.passwordHash !== null,
    },
  };
}

export async function revokeSession(sessionId: string, userId: string) {
  const result = await getDatabase()`
    update "userSessions" set "revokedAt" = now()
    where "id" = ${sessionId} and "userId" = ${userId} and "revokedAt" is null
    returning "id"
  `;
  return result.length > 0;
}

export async function listSessions(userId: string, currentSessionId: string) {
  return getDatabase()<{
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
    current: boolean;
  }[]>`
    select "id", "userAgent", "ipAddress", "createdAt", "lastUsedAt", "expiresAt", "id" = ${currentSessionId} as "current"
    from "userSessions"
    where "userId" = ${userId} and "revokedAt" is null and "expiresAt" > now()
    order by "createdAt" desc
  `;
}
