import { createHash } from "node:crypto";

export const buildNotificationOperationId = (...parts: string[]): string =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");
