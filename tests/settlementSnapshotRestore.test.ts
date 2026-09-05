import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeSettlementSnapshot } from "$lib/server/settlements/settlementSnapshot";
import { restoreSettlementSummary } from "$lib/server/settlements/settlementSnapshotRestore";
import { settlementSnapshotV1 } from "./fixtures/settlementSnapshotV1";

const reorderKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(reorderKeys)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, entry]) => [key, reorderKeys(entry)]),
        )
      : value;

type V1Snapshot = typeof settlementSnapshotV1;
const corruptions: [string, (snapshot: V1Snapshot) => void][] = [
  [
    "分数",
    (s) => {
      s.comparable.lines[0].workMinutes = 120;
    },
  ],
  [
    "ログ日時",
    (s) => {
      s.comparable.lines[0].sessions[0].startedAt = "2026-08-19T00:00:00.000Z";
    },
  ],
  [
    "Issue番号",
    (s) => {
      s.comparable.lines[0].issue.number = 99;
    },
  ],
  [
    "整合する明細・集計額",
    (s) => {
      s.comparable.lines[0].timedRewardYen = 12000;
      s.comparable.lines[0].taxExcludedYen = 12000;
      s.comparable.timedRewardYen = s.totals.timedRewardYen = 12000;
      s.comparable.taxExcludedYen = s.totals.taxExcludedYen = 12000;
      s.comparable.taxYen = s.totals.taxYen = 1200;
      s.comparable.taxIncludedYen = s.totals.taxIncludedYen = 13200;
    },
  ],
  [
    "ハッシュ",
    (s) => {
      s.hash = "wrong";
    },
  ],
  [
    "ハッシュ欠落",
    (s) => {
      Reflect.deleteProperty(s, "hash");
    },
  ],
  [
    "比較明細欠落",
    (s) => {
      Reflect.deleteProperty(s, "comparable");
    },
  ],
  [
    "バージョン欠落",
    (s) => {
      Reflect.deleteProperty(s, "schemaVersion");
    },
  ],
];

describe("v1精算スナップショットの復元", () => {
  it("当時の実装から算出した固定ハッシュと明細を復元する", () => {
    const restored = restoreSettlementSummary(settlementSnapshotV1);
    expect(restored).toMatchObject({
      month: "2026-08",
      assigneeLogin: "worker",
      taxExcludedYen: 6000,
      taxIncludedYen: 6600,
      lines: [{ workMinutes: 60, timedRewardYen: 6000 }],
    });
    expect(restored?.lines[0].issue.title).toContain("保存時の件名なし");
  });

  it("DBのjsonbでキー順が変わっても当時の順序で照合する", () => {
    expect(restoreSettlementSummary(reorderKeys(settlementSnapshotV1))).toEqual(
      restoreSettlementSummary(settlementSnapshotV1),
    );
  });

  it.each(corruptions)("%sが壊れたv1は復元しない", (_name, corrupt) => {
    const snapshot = structuredClone(settlementSnapshotV1);
    corrupt(snapshot);
    expect(restoreSettlementSummary(snapshot)).toBeNull();
  });

  it("v1を現在形式で再計算したハッシュでは照合しない", () => {
    const snapshot = structuredClone(settlementSnapshotV1);
    snapshot.hash = createHash("sha256")
      .update(JSON.stringify(normalizeSettlementSnapshot(snapshot.comparable)))
      .digest("hex");
    expect(restoreSettlementSummary(snapshot)).toBeNull();
  });

  it("v1のハッシュ対象外の後付け項目を通知書明細へ転記しない", () => {
    const snapshot = structuredClone(settlementSnapshotV1);
    Object.assign(snapshot.comparable.lines[0], {
      sessionMinutesById: { "session-2026-08": 9999 },
      hourlyRateYenSnapshot: 9999,
      completionReportId: "injected-report",
    });
    Object.assign(snapshot.comparable.lines[0].issue, {
      title: "後付けの件名",
      url: "https://example.com/wrong",
    });
    expect(restoreSettlementSummary(snapshot)).toEqual(
      restoreSettlementSummary(settlementSnapshotV1),
    );
  });

  it("バージョンとハッシュを持たない旧明細も引き続き復元する", () => {
    expect(
      restoreSettlementSummary(settlementSnapshotV1.comparable),
    ).toMatchObject({
      taxIncludedYen: 6600,
    });
  });
});
