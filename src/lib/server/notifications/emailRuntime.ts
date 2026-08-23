import { dev } from "$app/environment";

const isLocalRuntime = (appOrigin: string): boolean => {
  try {
    return (
      dev ||
      ["localhost", "127.0.0.1", "::1"].includes(new URL(appOrigin).hostname)
    );
  } catch {
    return dev;
  }
};

export const isProductionEmailRuntime = (
  appOrigin: string,
  vercelEnvironment?: string,
): boolean =>
  vercelEnvironment
    ? vercelEnvironment === "production"
    : !isLocalRuntime(appOrigin);

export const resolveEmailRecipient = (
  syncedEmail: string | null,
  recipientOverride: string | undefined,
  productionRuntime: boolean,
): string | null =>
  productionRuntime ? syncedEmail : (recipientOverride ?? null);

export const emailRuntimePrefix = (productionRuntime: boolean): string =>
  productionRuntime ? "production" : "non-production";

export const isEmailDeliveryEnvironmentReady = (input: {
  mode: "preview" | "resend";
  productionRuntime: boolean;
  hasResendApiKey: boolean;
  hasEmailFrom: boolean;
  hasAppOrigin: boolean;
  hasRecipientOverride: boolean;
}): boolean => {
  if (input.mode === "preview") return !input.productionRuntime;
  return (
    input.hasResendApiKey &&
    input.hasEmailFrom &&
    input.hasAppOrigin &&
    (input.productionRuntime || input.hasRecipientOverride)
  );
};

export const isEmailDeliveryRetryableInRuntime = (
  delivery: { recipientEmail: string | null; idempotencyKey: string },
  productionRuntime: boolean,
  recipientOverride?: string,
): boolean => {
  if (
    !delivery.idempotencyKey.startsWith(
      `${emailRuntimePrefix(productionRuntime)}/`,
    )
  ) {
    return false;
  }
  return (
    productionRuntime ||
    (Boolean(recipientOverride) &&
      delivery.recipientEmail === recipientOverride)
  );
};
