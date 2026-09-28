export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled";
export type IdentityType = "phone" | "mockGoogle" | "google";
export type VerificationPurpose = "login" | "setPassword" | "resetPassword";
export type ProviderType = "deepSeek" | "agnes" | "bananaPro";
export type MediaType = "text" | "image" | "video";
export type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type CreditTransactionType = "adminGrant" | "taskFreeze" | "taskSettle" | "taskRefund";

export type Migration = {
  name: string;
  sql: string;
};
