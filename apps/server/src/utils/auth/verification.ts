import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/utils/database";
import type { VerificationPurpose } from "@/utils/database/types";

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function normalizePhone(countryCode: string, phone: string) {
  const code = countryCode.trim().replace(/[\s()-]/g, "");
  const number = phone.trim().replace(/[\s()-]/g, "");
  if (!/^\+\d{1,4}$/.test(code) || !/^\d{5,15}$/.test(number)) {
    throw Object.assign(new Error("请输入有效的国家或地区代码和手机号"), { status: 400 });
  }
  const normalized = `${code}${number}`;
  if (normalized.length > 16) throw Object.assign(new Error("手机号长度无效"), { status: 400 });
  return normalized;
}

export function normalizeStoredPhone(phone: string) {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  if (!/^\+\d{6,15}$/.test(normalized)) throw new Error("MINIFEEL_ADMIN_PHONE 必须是带国家或地区代码的手机号");
  return normalized;
}

export async function issueVerificationCode(phone: string, purpose: VerificationPurpose) {
  if (process.env.MINIFEEL_AUTH_MOCK_CODE !== "true") {
    throw Object.assign(new Error("短信服务尚未配置"), { status: 503 });
  }
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const database = getDatabase();
  await database`
    insert into "verificationCodes" ("id", "phone", "purpose", "codeHash", "expiresAt")
    values (${randomUUID()}, ${phone}, ${purpose}, ${hashCode(code)}, now() + interval '10 minutes')
  `;
  console.log(`[模拟验证码] ${phone} ${purpose}: ${code}`);
}

export async function consumeVerificationCode(phone: string, purpose: VerificationPurpose, code: string) {
  const value = code.trim();
  if (!value) throw Object.assign(new Error("请输入验证码"), { status: 400 });
  return getDatabase().begin(async transaction => {
    const rows = await transaction<{ id: string; codeHash: string }[]>`
      select "id", "codeHash" from "verificationCodes"
      where "phone" = ${phone} and "purpose" = ${purpose} and "consumedAt" is null and "expiresAt" > now()
      order by "createdAt" desc limit 1 for update
    `;
    const current = rows[0];
    if (!current) throw Object.assign(new Error("验证码无效或已过期"), { status: 400 });
    if (process.env.MINIFEEL_AUTH_MOCK_CODE !== "true") {
      const expected = Buffer.from(current.codeHash, "hex");
      const actual = Buffer.from(hashCode(value), "hex");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw Object.assign(new Error("验证码错误"), { status: 400 });
      }
    }
    await transaction`update "verificationCodes" set "consumedAt" = now() where "id" = ${current.id}`;
  });
}
