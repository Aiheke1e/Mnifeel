import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function readSecretKey() {
  const value = process.env.MINIFEEL_SECRET_KEY?.trim() ?? "";
  let key: Buffer;
  try {
    key = Buffer.from(value, "base64");
  } catch {
    throw new Error("MINIFEEL_SECRET_KEY 必须是 32 字节随机密钥的 Base64 文本");
  }
  if (!value || key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("MINIFEEL_SECRET_KEY 必须是 32 字节随机密钥的 Base64 文本");
  }
  return key;
}

export function validateSecretKey() {
  readSecretKey();
}

export function encryptSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readSecretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decodePart(value: string, length?: number) {
  const decoded = Buffer.from(value, "base64");
  if (!value || decoded.toString("base64") !== value || (length !== undefined && decoded.length !== length)) throw new Error("invalid encrypted secret");
  return decoded;
}

export function decryptSecret(secret: EncryptedSecret) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", readSecretKey(), decodePart(secret.iv, 12));
    decipher.setAuthTag(decodePart(secret.tag, 16));
    return Buffer.concat([
      decipher.update(decodePart(secret.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw Object.assign(new Error("供应商密钥解密失败，请管理员重新保存密钥"), { status: 500 });
  }
}
