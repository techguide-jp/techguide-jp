import { describe, expect, it, vi, beforeEach } from "vitest";
import { safeLoginReturn } from "$lib/server/auth/loginReturn";
import { GET as callback } from "../src/routes/auth/github/callback/+server";
import { requireUser } from "$lib/server/auth/guards";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/server/auth/githubOAuth", () => ({
  githubStateCookieName: "state",
  resolveOAuthAppOrigin: () => "https://techguide-jp.vercel.app",
  exchangeGithubCode: vi.fn().mockResolvedValue("test-token"),
  fetchGithubUser: vi
    .fn()
    .mockResolvedValue({ login: "worker", name: "Worker", avatar_url: null }),
  fetchGithubPrimaryEmail: vi.fn().mockResolvedValue(null),
}));
vi.mock("$lib/server/auth/session", () => ({
  sessionCookieName: "session",
  createSession: vi.fn().mockResolvedValue({
    id: "test-session",
    expiresAt: new Date("2027-01-01"),
  }),
}));
vi.mock("$lib/server/notifications/contactRepository", () => ({
  syncGithubNotificationContact: vi.fn(),
}));

describe("案件URLのログイン復帰", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    "https://evil.example",
    "//evil.example/work",
    "/work/a/../1",
    "/work/a/b/1?next=https://evil.example",
    "/admin/work",
    "/work/a/b/0",
    "/work/a/b/9007199254740992",
    "/work/a/b/1\n",
    null,
  ])("不正な戻り先 %s を一覧へ戻す", (value) => {
    expect(safeLoginReturn(value)).toBe("/work");
  });
  it("未ログイン時に案件URLをログイン画面へ引き継ぐ", () => {
    const event = {
      locals: { user: null },
      request: { method: "GET" },
      url: new URL(
        "https://techguide-jp.vercel.app/work/techguide-jp/example/12",
      ),
    } as RequestEvent;
    expect(() => requireUser(event)).toThrow(
      expect.objectContaining({
        location: "/login?returnTo=%2Fwork%2Ftechguide-jp%2Fexample%2F12",
      }),
    );
  });
  it("OAuth state検証後に元の案件へ戻り、戻り先Cookieを削除する", async () => {
    const cookies = {
      get: (name: string) =>
        name === "state" ? "valid" : "/work/techguide-jp/example/12",
      set: vi.fn(),
      delete: vi.fn(),
    };
    await expect(
      callback({
        cookies,
        url: new URL(
          "https://techguide-jp.vercel.app/auth/github/callback?code=code&state=valid",
        ),
      } as unknown as Parameters<typeof callback>[0]),
    ).rejects.toMatchObject({
      status: 303,
      location: "/work/techguide-jp/example/12",
    });
    expect(cookies.delete).toHaveBeenCalledWith("tg_login_return", {
      path: "/",
    });
  });
  it("OAuth stateが不一致なら案件へ転送しない", async () => {
    const cookies = { get: () => "different", set: vi.fn(), delete: vi.fn() };
    await expect(
      callback({
        cookies,
        url: new URL(
          "https://techguide-jp.vercel.app/auth/github/callback?code=code&state=valid",
        ),
      } as unknown as Parameters<typeof callback>[0]),
    ).rejects.toMatchObject({ status: 400 });
    expect(cookies.set).not.toHaveBeenCalled();
  });
});
