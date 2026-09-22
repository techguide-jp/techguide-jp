import { dev } from "$app/environment";
import { env, requireEnv } from "$lib/server/env";
import type { SessionUser } from "./session";
import {
  getWorkerProfile,
  listAllWorkerProfiles,
} from "$lib/server/workers/workerProfileRepository";
import {
  createLocalImpersonationCookie,
  isLocalImpersonationEnvironment,
  localUserLoginSchema,
  readLocalImpersonationCookie,
} from "./localImpersonationPolicy";
import { createAuditLog } from "$lib/server/audit/auditRepository";

export const canUseLocalImpersonation = (
  url: URL,
  authenticatedUser: SessionUser | null,
): boolean =>
  Boolean(authenticatedUser?.isAdmin) &&
  isLocalImpersonationEnvironment({ dev, url, ...env });

const findTarget = async (login: unknown): Promise<SessionUser | null> => {
  const parsed = localUserLoginSchema.safeParse(login);
  if (!parsed.success) return null;
  const profile = await getWorkerProfile(parsed.data);
  return profile
    ? {
        login: profile.login,
        name: profile.displayName,
        avatarUrl: null,
        isAdmin: env.adminGithubLogins.has(profile.login.toLowerCase()),
      }
    : null;
};

export const listLocalImpersonationTargets = async (): Promise<
  { login: string; displayName: string }[]
> =>
  (await listAllWorkerProfiles())
    .map(({ login, displayName }) => ({ login, displayName }))
    .sort((a, b) => a.login.localeCompare(b.login));

export const resolveLocalImpersonation = async (input: {
  available: boolean;
  authenticatedUser: SessionUser | null;
  sessionId: string | undefined;
  cookie: string | undefined;
}): Promise<SessionUser | null> => {
  if (
    !input.available ||
    !input.authenticatedUser?.isAdmin ||
    !input.sessionId ||
    !input.cookie
  )
    return null;
  const login = readLocalImpersonationCookie(
    input.cookie,
    input.sessionId,
    requireEnv(env.sessionSecret, "SESSION_SECRET"),
  );
  return login ? findTarget(login) : null;
};

export const startLocalImpersonation = async (input: {
  url: URL;
  authenticatedUser: SessionUser | null;
  sessionId: string;
  login: unknown;
}): Promise<{ ok: true; cookie: string } | { ok: false; message: string }> => {
  if (!canUseLocalImpersonation(input.url, input.authenticatedUser))
    return { ok: false, message: "ローカルの管理者だけが利用できます。" };
  const target = await findTarget(input.login);
  if (!target)
    return { ok: false, message: "登録済みのユーザーを選択してください。" };
  const cookie = createLocalImpersonationCookie(
    target.login,
    input.sessionId,
    requireEnv(env.sessionSecret, "SESSION_SECRET"),
  );
  await createAuditLog({
    actorLogin: input.authenticatedUser!.login,
    action: "local_impersonation_started",
    targetType: "worker_profile",
    targetId: target.login,
    details: { targetLogin: target.login },
  });
  return { ok: true, cookie };
};

export const recordLocalImpersonationStop = async (
  adminLogin: string,
  targetLogin: string,
): Promise<void> => {
  await createAuditLog({
    actorLogin: adminLogin,
    action: "local_impersonation_stopped",
    targetType: "worker_profile",
    targetId: targetLogin,
    details: { targetLogin },
  });
};
