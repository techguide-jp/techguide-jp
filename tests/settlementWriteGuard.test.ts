import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import {
  executeGuardedSettlementWrite,
  readSettlementSourceToken,
  settlementSourceMatches,
} from "$lib/server/settlements/settlementWriteGuard";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn((text: string, params: unknown[]) => ({ text, params })),
}));
vi.mock("$lib/server/db/client", () => ({
  postgresClient: null,
  neonClient: mocks,
}));
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Neon HTTPの精算transaction", () => {
  it("単一transactionでLOCKの後に検証し、値は束縛パラメータとして渡す", async () => {
    mocks.transaction.mockResolvedValue([[], [], [], [{ transitioned: true }]]);
    const result = await executeGuardedSettlementWrite(
      sql`SELECT ${settlementSourceMatches("saved-version")} AS transitioned`,
    );
    expect(result).toEqual([{ transitioned: true }]);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.calls[0][1]).toEqual({
      isolationLevel: "ReadCommitted",
    });
    const queries = mocks.transaction.mock.calls[0][0] as Array<{
      text: string;
      params: unknown[];
    }>;
    expect(queries).toHaveLength(4);
    expect(queries[0].text).toContain("lock_timeout");
    expect(queries[2].text).toContain("SHARE ROW EXCLUSIVE MODE");
    expect(queries[3].text).toContain("md5");
    expect(queries[3].text).not.toContain("saved-version");
    expect(queries[3].params).toEqual(["saved-version"]);
  });

  it("版を読み取れなければ空の版で成功扱いにしない", async () => {
    mocks.transaction.mockResolvedValue([[{ token: "token" }]]);
    expect(await readSettlementSourceToken()).toBe("token");
    mocks.transaction.mockResolvedValue([[]]);
    await expect(readSettlementSourceToken()).rejects.toThrow(
      "版を取得できません",
    );
  });

  it("報告差し替えの失効とINSERTを同じロック内の別statementで実行する", async () => {
    mocks.transaction.mockResolvedValue([
      [],
      [],
      [],
      [],
      [{ id: "new-report" }],
    ]);
    expect(
      await executeGuardedSettlementWrite([
        sql`SELECT ${"invalidate"}`,
        sql`SELECT ${"insert"}`,
      ]),
    ).toEqual([{ id: "new-report" }]);
    const queries = mocks.transaction.mock.calls[0][0] as Array<{
      text: string;
      params: unknown[];
    }>;
    expect(queries).toHaveLength(5);
    expect(queries[2].text).toContain("SHARE ROW EXCLUSIVE MODE");
    expect(queries[3].params).toEqual(["invalidate"]);
    expect(queries[4].params).toEqual(["insert"]);
  });

  it.each(["55P03", "40P01", "40001"])(
    "競合 %s は成功行を返さず再実行対象にする",
    async (code) => {
      mocks.transaction.mockRejectedValue({ code });
      expect(await executeGuardedSettlementWrite(sql`SELECT 1`)).toEqual([]);
    },
  );

  it("接続障害は競合や成功に置き換えず呼び出し元へ返す", async () => {
    mocks.transaction.mockRejectedValue(new Error("connection failed"));
    await expect(executeGuardedSettlementWrite(sql`SELECT 1`)).rejects.toThrow(
      "connection failed",
    );
  });
});
