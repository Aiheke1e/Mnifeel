export function validatePassword(password: string) {
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw Object.assign(new Error("密码需要 8 至 128 位，并同时包含字母和数字"), { status: 400 });
  }
  return password;
}

export function hashPassword(password: string) {
  return Bun.password.hash(validatePassword(password), { algorithm: "argon2id" });
}

export function verifyPassword(password: string, passwordHash: string) {
  return Bun.password.verify(password, passwordHash);
}
