import { randomUUID } from "node:crypto";

const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createNotificationOperationId = (): string => randomUUID();

export const parseNotificationOperationId = (
  value: FormDataEntryValue | null,
): string | null => {
  const operationId = String(value ?? "").trim();
  return operationIdPattern.test(operationId) ? operationId : null;
};
