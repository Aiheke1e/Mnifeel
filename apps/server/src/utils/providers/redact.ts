const secretKeyPattern = /(?:api.?key|access.?token|refresh.?token|authorization|password|secret|signature)|^token$/i;

export function redactText(value: string) {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:api_?key|access_?token|token|secret|signature)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/((?:authorization|x-api-key|api-key|apikey|password|secret|token|signature)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    secretKeyPattern.test(key) ? (item ? "[REDACTED]" : item) : redactSecrets(item),
  ]));
}

export function redactError(error: unknown) {
  if (!(error instanceof Error)) return redactSecrets(error);
  return {
    name: error.name,
    message: redactText(error.message),
    stack: error.stack ? redactText(error.stack) : undefined,
  };
}

export function redactErrorMessage(error: unknown, fallback: string) {
  return redactText(error instanceof Error ? error.message : fallback);
}
