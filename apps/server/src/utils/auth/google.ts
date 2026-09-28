export function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw Object.assign(new Error("请输入有效的邮箱地址"), { status: 400 });
  }
  return normalized;
}

export function mockGoogleEnabled() {
  return process.env.MINIFEEL_AUTH_MOCK_GOOGLE === "true";
}
