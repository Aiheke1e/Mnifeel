import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { getDatabase } from "@/utils/database";
import { writeAudit } from "@/utils/audit";
import { mockGoogleEnabled, normalizeEmail } from "@/utils/auth/google";
import { hashPassword, validatePassword, verifyPassword } from "@/utils/auth/password";
import { clearSessionCookie, createSession, revokeSession, type AuthUser } from "@/utils/auth/session";
import { consumeVerificationCode, normalizeStoredPhone } from "@/utils/auth/verification";

export * from "@/utils/auth/google";
export * from "@/utils/auth/password";
export * from "@/utils/auth/session";
export * from "@/utils/auth/verification";

type UserRow = AuthUser & { passwordHash: string | null };

function publicUser(user: UserRow) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

async function findUserByIdentity(type: "phone" | "mockGoogle", identifier: string) {
  const rows = await getDatabase()<UserRow[]>`
    select u."id", u."role", u."status", u."isWhitelist", u."passwordHash",
      (select p."identifier" from "userIdentities" p where p."userId" = u."id" and p."type" = 'phone' limit 1) as "phone",
      (select e."identifier" from "userIdentities" e where e."userId" = u."id" and e."type" in ('mockGoogle', 'google') order by e."type" desc limit 1) as "email",
      u."passwordHash" is not null as "hasPassword"
    from "users" u join "userIdentities" i on i."userId" = u."id"
    where i."type" = ${type} and i."identifier" = ${identifier}
    limit 1
  `;
  return rows[0];
}

async function createUser(type: "phone" | "mockGoogle", identifier: string) {
  const database = getDatabase();
  return database.begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext(${`${type}:${identifier}`}))`;
    const existing = await transaction<UserRow[]>`
      select u."id", u."role", u."status", u."isWhitelist", u."passwordHash",
        ${type === "phone" ? identifier : null}::text as "phone",
        ${type === "mockGoogle" ? identifier : null}::text as "email",
        u."passwordHash" is not null as "hasPassword"
      from "users" u join "userIdentities" i on i."userId" = u."id"
      where i."type" = ${type} and i."identifier" = ${identifier}
      limit 1 for update of u
    `;
    if (existing[0]) return existing[0];
    const userId = randomUUID();
    await transaction`
      insert into "users" ("id", "role") values (${userId}, 'user')
    `;
    await transaction`
      insert into "userIdentities" ("id", "userId", "type", "identifier", "verifiedAt")
      values (${randomUUID()}, ${userId}, ${type}, ${identifier}, now())
    `;
    await transaction`insert into "creditAccounts" ("userId") values (${userId})`;
    return {
      id: userId,
      role: "user" as const,
      status: "active" as const,
      isWhitelist: false,
      passwordHash: null,
      phone: type === "phone" ? identifier : null,
      email: type === "mockGoogle" ? identifier : null,
      hasPassword: false,
    };
  });
}

async function finishLogin(user: UserRow, request: Request, response: Response) {
  if (user.status !== "active") throw Object.assign(new Error("账号已被禁用"), { status: 403 });
  const sessionId = await createSession(user.id, request, response);
  if (user.role === "admin") {
    try {
      await writeAudit({ adminUserId: user.id, action: "adminLogin", targetType: "session", targetId: sessionId });
    } catch (error) {
      await revokeSession(sessionId, user.id);
      clearSessionCookie(response);
      throw error;
    }
  }
  return publicUser(user);
}

export async function loginWithPhone(phone: string, code: string, request: Request, response: Response) {
  await consumeVerificationCode(phone, "login", code);
  const user = await createUser("phone", phone);
  return finishLogin(user, request, response);
}

export async function loginWithPassword(phone: string, password: string, request: Request, response: Response) {
  const user = await findUserByIdentity("phone", phone);
  if (!user?.passwordHash || !await verifyPassword(password, user.passwordHash)) {
    throw Object.assign(new Error("手机号或密码错误"), { status: 401 });
  }
  return finishLogin(user, request, response);
}

export async function loginWithMockGoogle(email: string, request: Request, response: Response) {
  if (!mockGoogleEnabled()) throw Object.assign(new Error("模拟 Google 登录未启用"), { status: 404 });
  const user = await createUser("mockGoogle", normalizeEmail(email));
  return finishLogin(user, request, response);
}

export async function setPassword(userId: string, password: string) {
  await getDatabase()`
    update "users" set "passwordHash" = ${await hashPassword(password)}, "updatedAt" = now()
    where "id" = ${userId}
  `;
}

export async function resetPassword(phone: string, code: string, password: string) {
  validatePassword(password);
  await consumeVerificationCode(phone, "resetPassword", code);
  const user = await findUserByIdentity("phone", phone);
  if (!user) throw Object.assign(new Error("账号不存在"), { status: 404 });
  await setPassword(user.id, password);
}

export async function initializeAdmin() {
  const database = getDatabase();
  const existing = await database`select "id" from "users" where "role" = 'admin' limit 1`;
  if (existing.length) return;
  const phoneValue = process.env.MINIFEEL_ADMIN_PHONE;
  const passwordValue = process.env.MINIFEEL_ADMIN_PASSWORD;
  if (!phoneValue || !passwordValue) throw new Error("首次启动需要 MINIFEEL_ADMIN_PHONE 和 MINIFEEL_ADMIN_PASSWORD");
  const phone = normalizeStoredPhone(phoneValue);
  const passwordHash = await hashPassword(passwordValue);
  await database.begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext('minifeelAdminInitialization'))`;
    const admin = await transaction`select "id" from "users" where "role" = 'admin' limit 1`;
    if (admin.length) return;
    const identities = await transaction<{ userId: string }[]>`
      select "userId" from "userIdentities" where "type" = 'phone' and "identifier" = ${phone} limit 1
    `;
    const userId = identities[0]?.userId ?? randomUUID();
    if (identities[0]) {
      await transaction`
        update "users" set "role" = 'admin', "status" = 'active', "passwordHash" = ${passwordHash}, "updatedAt" = now()
        where "id" = ${userId}
      `;
    } else {
      await transaction`
        insert into "users" ("id", "role", "passwordHash") values (${userId}, 'admin', ${passwordHash})
      `;
      await transaction`
        insert into "userIdentities" ("id", "userId", "type", "identifier", "verifiedAt")
        values (${randomUUID()}, ${userId}, 'phone', ${phone}, now())
      `;
      await transaction`insert into "creditAccounts" ("userId") values (${userId})`;
    }
    await writeAudit({ adminUserId: userId, action: "adminInitialized", targetType: "user", targetId: userId, database: transaction });
  });
}

export async function consumeRateLimit(name: string, value: string, limit: number, windowSeconds: number) {
  const key = createHash("sha256").update(`${name}:${value}`).digest("hex");
  const rows = await getDatabase()<{ count: number }[]>`
    insert into "authRateLimits" ("key", "windowStartedAt", "count") values (${key}, now(), 1)
    on conflict ("key") do update set
      "windowStartedAt" = case
        when "authRateLimits"."windowStartedAt" <= now() - ${windowSeconds} * interval '1 second' then now()
        else "authRateLimits"."windowStartedAt"
      end,
      "count" = case
        when "authRateLimits"."windowStartedAt" <= now() - ${windowSeconds} * interval '1 second' then 1
        else "authRateLimits"."count" + 1
      end,
      "updatedAt" = now()
    returning "count"
  `;
  if ((rows[0]?.count ?? limit + 1) > limit) throw Object.assign(new Error("操作过于频繁，请稍后再试"), { status: 429 });
}
