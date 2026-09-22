import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "../src/routes/dev/impersonation/$types";
import {
  createLocalImpersonationCookie,
  isLocalImpersonationEnvironment,
  localImpersonationCookieName,
  readLocalImpersonationCookie,
} from "$lib/server/auth/localImpersonationPolicy";
import { env } from "$lib/server/env";
import { resolveSessionUser, type SessionUser } from "$lib/server/auth/session";
import {
  getWorkerProfile,
  listAllWorkerProfiles,
} from "$lib/server/workers/workerProfileRepository";
import { createAuditLog } from "$lib/server/audit/auditRepository";
import { handle } from "../src/hooks.server";
import { actions, load } from "../src/routes/dev/impersonation/+page.server";

const runtime = vi.hoisted(() => ({ dev: true }));
vi.mock("$app/environment", () => ({
  get dev() {
    return runtime.dev;
  },
}));
vi.mock("$lib/server/env", () => ({
  env: {
    databaseUrl: "postgresql://test@localhost:5432/test",
    emailDeliveryMode: "preview",
    vercelEnvironment: undefined,
    sessionSecret: "unit-test-secret",
    adminGithubLogins: new Set(["admin"]),
  },
  requireEnv: (value: string) => value,
}));
vi.mock("$lib/server/auth/session", () => ({
  resolveSessionUser: vi.fn(),
  sessionCookieName: "tg_session",
}));
vi.mock("$lib/server/workers/workerProfileRepository", () => ({
  getWorkerProfile: vi.fn(),
  listAllWorkerProfiles: vi.fn(),
}));
vi.mock("$lib/server/audit/auditRepository", () => ({
  createAuditLog: vi.fn(),
}));

const admin: SessionUser = {
  login: "admin",
  name: "管理者",
  avatarUrl: null,
  isAdmin: true,
};
const worker: SessionUser = {
  login: "worker",
  name: "作業者",
  avatarUrl: null,
  isAdmin: false,
};
const sessionId = "original-admin-session";
const secret = "unit-test-secret";
const signedCookie = () =>
  createLocalImpersonationCookie("worker", sessionId, secret);

const eventFor = (
  options: {
    cookie?: string;
    method?: string;
    url?: string;
    sessionId?: string;
  } = {},
): RequestEvent => {
  const url = new URL(options.url ?? "http://localhost:5177/dev/impersonation");
  const cookies = new Map([["tg_session", options.sessionId ?? sessionId]]);
  if (options.cookie) cookies.set(localImpersonationCookieName, options.cookie);
  return {
    url,
    request: new Request(url, {
      method: options.method ?? "GET",
      headers: { origin: url.origin },
    }),
    cookies: {
      get: vi.fn((name: string) => cookies.get(name)),
      set: vi.fn((name: string, value: string) => cookies.set(name, value)),
      delete: vi.fn((name: string) => cookies.delete(name)),
    },
    locals: {},
  } as unknown as RequestEvent;
};
const resolve = vi.fn(async () => new Response("ok"));

beforeEach(() => {
  vi.clearAllMocks();
  runtime.dev = true;
  env.databaseUrl = "postgresql://test@localhost:5432/test";
  env.emailDeliveryMode = "preview";
  env.vercelEnvironment = undefined;
  vi.mocked(resolveSessionUser).mockResolvedValue(admin);
  vi.mocked(getWorkerProfile).mockImplementation(async (login) =>
    login === "worker"
      ? ({ login, displayName: "作業者" } as NonNullable<
          Awaited<ReturnType<typeof getWorkerProfile>>
        >)
      : null,
  );
  vi.mocked(listAllWorkerProfiles).mockResolvedValue([]);
});

describe("ローカル擬似ログインの環境制限と署名", () => {
  const valid = {
    dev: true,
    url: new URL("http://localhost:5177"),
    databaseUrl: "postgresql://test@127.0.0.1:5432/test",
    emailDeliveryMode: "preview",
    vercelEnvironment: undefined,
  };

  it.each([
    { dev: false },
    { vercelEnvironment: "production" },
    { vercelEnvironment: "preview" },
    { url: new URL("https://techguide-jp.vercel.app") },
    { url: new URL("http://localhost.example.com") },
    { databaseUrl: "postgresql://test@db.example.com/test" },
    { databaseUrl: "postgresql://test@localhost/test?host=db.example.com" },
    { databaseUrl: "invalid" },
    { databaseUrl: undefined },
    { emailDeliveryMode: "resend" },
  ])("制限を一つでも満たさない環境は拒否する: %j", (override) => {
    expect(isLocalImpersonationEnvironment({ ...valid, ...override })).toBe(
      false,
    );
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "ループバック%sでは利用できる",
    (host) => {
      expect(
        isLocalImpersonationEnvironment({
          ...valid,
          url: new URL(`http://${host}:5177`),
          databaseUrl: `postgresql://test@${host}:5432/test`,
        }),
      ).toBe(true);
    },
  );

  it("改ざん・別セッション・期限切れのCookieは使えない", () => {
    const cookie = createLocalImpersonationCookie(
      "worker",
      sessionId,
      secret,
      1000,
    );
    expect(readLocalImpersonationCookie(cookie, sessionId, secret, 1001)).toBe(
      "worker",
    );
    expect(
      readLocalImpersonationCookie(cookie + "x", sessionId, secret, 1001),
    ).toBeNull();
    expect(
      readLocalImpersonationCookie(cookie, "another-session", secret, 1001),
    ).toBeNull();
    expect(
      readLocalImpersonationCookie(cookie, sessionId, "another-secret", 1001),
    ).toBeNull();
    expect(
      readLocalImpersonationCookie(cookie, sessionId, secret, 3_601_000),
    ).toBeNull();
    expect(
      readLocalImpersonationCookie("worker", sessionId, secret),
    ).toBeNull();
  });
});

describe("擬似ログイン中の実効ユーザー", () => {
  it("管理者のログインを維持し、通常の権限判定には対象者だけを渡す", async () => {
    const event = eventFor({ cookie: signedCookie() });
    await handle({ event, resolve });
    expect(event.locals.authenticatedUser).toEqual(admin);
    expect(event.locals.user).toEqual(worker);
    expect(event.locals.localImpersonation).toEqual({
      adminLogin: "admin",
      targetLogin: "worker",
    });
    expect(event.cookies.set).not.toHaveBeenCalled();
  });

  it.each([null, worker])(
    "管理者でなくなったセッションでは継続できない: %j",
    async (user) => {
      vi.mocked(resolveSessionUser).mockResolvedValue(user);
      const event = eventFor({ cookie: signedCookie() });
      await handle({ event, resolve });
      expect(event.locals.user).toEqual(user);
      expect(event.locals.localImpersonation).toBeNull();
      expect(event.cookies.delete).toHaveBeenCalledWith(
        localImpersonationCookieName,
        { path: "/" },
      );
    },
  );

  it.each([
    "changed-session",
    "missing-target",
    "production",
    "remote-db",
    "resend",
  ])("前提が変わった場合も解除する: %s", async (change) => {
    if (change === "missing-target")
      vi.mocked(getWorkerProfile).mockResolvedValue(null);
    if (change === "production") env.vercelEnvironment = "production";
    if (change === "remote-db")
      env.databaseUrl = "postgresql://test@remote.example.com/test";
    if (change === "resend") env.emailDeliveryMode = "resend";
    const event = eventFor({
      cookie: signedCookie(),
      sessionId: change === "changed-session" ? "new-session" : sessionId,
    });
    await handle({ event, resolve });
    expect(event.locals.user).toEqual(admin);
    expect(event.locals.localImpersonation).toBeNull();
  });

  it("無効になったCookieでのPOSTを管理者として実行しない", async () => {
    const event = eventFor({ cookie: "invalid", method: "POST" });
    await expect(handle({ event, resolve })).rejects.toMatchObject({
      status: 409,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("擬似ログイン中の他画面へのPOSTも別Originからは受け付けない", async () => {
    const event = eventFor({
      cookie: signedCookie(),
      method: "POST",
      url: "http://localhost:5177/work",
    });
    event.request.headers.set("origin", "http://localhost:9999");
    await expect(handle({ event, resolve })).rejects.toMatchObject({
      status: 403,
    });
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("切り替え・復帰の直接POST", () => {
  it.each([null, worker])(
    "未ログイン・非管理者は一覧取得も開始も終了もできない: %j",
    async (user) => {
      const event = eventFor({ method: "POST" });
      event.locals.authenticatedUser = user;
      await expect(load(event as never)).rejects.toMatchObject({ status: 404 });
      await expect(actions.start!(event)).rejects.toMatchObject({
        status: 404,
      });
      await expect(actions.stop!(event)).rejects.toMatchObject({ status: 404 });
      expect(listAllWorkerProfiles).not.toHaveBeenCalled();
      expect(createAuditLog).not.toHaveBeenCalled();
    },
  );

  it.each(["production", "production-build", "remote-db", "resend"])(
    "利用不可環境の直接POSTを拒否する: %s",
    async (change) => {
      if (change === "production") env.vercelEnvironment = "production";
      if (change === "production-build") runtime.dev = false;
      if (change === "remote-db")
        env.databaseUrl = "postgresql://test@remote.example.com/test";
      if (change === "resend") env.emailDeliveryMode = "resend";
      const event = eventFor({ method: "POST" });
      event.locals.authenticatedUser = admin;
      await expect(actions.start!(event)).rejects.toMatchObject({
        status: 404,
      });
      await expect(actions.stop!(event)).rejects.toMatchObject({ status: 404 });
    },
  );

  it("開始時に署名Cookieと元の管理者の監査記録を保存する", async () => {
    const event = eventFor({ method: "POST" });
    event.locals.authenticatedUser = admin;
    const form = new FormData();
    form.set("login", "worker");
    event.request = new Request(event.url, {
      method: "POST",
      body: form,
      headers: { origin: event.url.origin },
    });
    await expect(actions.start!(event)).rejects.toMatchObject({
      status: 303,
      location: "/work",
    });
    const value = event.cookies.get(localImpersonationCookieName)!;
    expect(readLocalImpersonationCookie(value, sessionId, secret)).toBe(
      "worker",
    );
    expect(event.cookies.set).toHaveBeenCalledWith(
      localImpersonationCookieName,
      value,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
      }),
    );
    expect(
      vi.mocked(event.cookies.set).mock.calls[0][2].maxAge,
    ).toBeUndefined();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLogin: "admin",
        targetId: "worker",
        action: "local_impersonation_started",
      }),
    );
  });

  it("存在しない対象への切り替えはCookieを保存しない", async () => {
    const event = eventFor({ method: "POST" });
    event.locals.authenticatedUser = admin;
    const form = new FormData();
    form.set("login", "not-registered");
    event.request = new Request(event.url, {
      method: "POST",
      body: form,
      headers: { origin: event.url.origin },
    });
    expect(await actions.start!(event)).toMatchObject({ status: 400 });
    expect(event.cookies.set).not.toHaveBeenCalled();
  });

  it("対象者に管理者権限がなくても元の管理者へ復帰できる", async () => {
    const event = eventFor({ method: "POST", cookie: signedCookie() });
    await handle({ event, resolve });
    await expect(actions.stop!(event)).rejects.toMatchObject({
      status: 303,
      location: "/dev/impersonation",
    });
    expect(event.cookies.get("tg_session")).toBe(sessionId);
    expect(event.cookies.get(localImpersonationCookieName)).toBeUndefined();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorLogin: "admin",
        targetId: "worker",
        action: "local_impersonation_stopped",
      }),
    );
  });

  it.each([
    undefined,
    "null",
    "https://other.example",
    "http://localhost:9999",
  ])("異なるOriginやOriginなしの開始・終了を拒否する: %s", async (origin) => {
    const event = eventFor({ method: "POST" });
    event.locals.authenticatedUser = admin;
    if (origin) event.request.headers.set("origin", origin);
    else event.request.headers.delete("origin");
    await expect(actions.start!(event)).rejects.toMatchObject({ status: 403 });
    await expect(actions.stop!(event)).rejects.toMatchObject({ status: 403 });
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
