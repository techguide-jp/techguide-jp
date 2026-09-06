import { beforeEach, describe, expect, it, vi } from "vitest";
import { settlementSnapshotV1 } from "./fixtures/settlementSnapshotV1";
import { getSnapshot } from "$lib/server/settlements/snapshotRepository";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import { restoreSettlementSummary } from "$lib/server/settlements/settlementSnapshotRestore";
import { validateSettlementPaymentEligibility } from "$lib/server/settlements/settlementService";
import {
  markSettlementPaid,
  updatePaymentScheduledDate,
} from "$lib/server/payments/paymentService";
import {
  getPaymentRow,
  upsertPaymentPaid,
  upsertPaymentScheduledDate,
} from "$lib/server/payments/paymentRepository";
import {
  dispatchPreparedNotification,
  prepareSettlementNotificationSafely,
} from "$lib/server/notifications/notificationService";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";

vi.mock("$lib/server/env", () => ({ env: { settlementRuleV2Enabled: true } }));
vi.mock("$lib/server/db/client", () => ({
  db: {},
  postgresClient: null,
  neonClient: null,
}));
vi.mock("$lib/server/settlements/snapshotRepository", () => ({
  getSnapshot: vi.fn(),
  listSnapshots: vi.fn(),
  listSnapshotsForMonth: vi.fn(),
}));
vi.mock("$lib/server/payments/paymentRepository", () => ({
  getPaymentRow: vi.fn(),
  listPaymentRowsForMonth: vi.fn(),
  upsertPaymentPaid: vi.fn(),
  upsertPaymentScheduledDate: vi.fn(),
  upsertPaymentUnpaid: vi.fn(),
}));
vi.mock("$lib/server/notifications/notificationService", () => ({
  prepareSettlementNotificationSafely: vi.fn(),
  dispatchPreparedNotification: vi.fn(),
}));
vi.mock("$lib/server/github/projectClient", () => ({
  fetchProjectIssuesForPage: vi.fn(),
}));

const summary = () => {
  const restored = restoreSettlementSummary(
    structuredClone(settlementSnapshotV1),
  );
  if (!restored) throw new Error("valid v1 fixture is required");
  return restored;
};
const currentSnapshot = () => createSettlementSnapshotPayload(summary());
const useSnapshot = (snapshot: unknown) => {
  vi.mocked(getSnapshot).mockResolvedValue({
    month: "2026-08",
    assigneeLogin: "worker",
    snapshot,
    approvedBy: "admin",
    approvedAt: new Date("2026-09-03T00:00:00Z"),
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSnapshot).mockResolvedValue(null);
  vi.mocked(getPaymentRow).mockResolvedValue(null);
  const row = {
    month: "2026-08",
    assigneeLogin: "worker",
    status: "paid" as const,
    scheduledDate: "2026-09-14",
    paidOn: "2026-09-14",
    createdAt: new Date("2026-09-03T00:00:00Z"),
    updatedAt: new Date("2026-09-14T00:00:00Z"),
  };
  vi.mocked(upsertPaymentPaid).mockResolvedValue(row);
  vi.mocked(upsertPaymentScheduledDate).mockResolvedValue(row);
  vi.mocked(prepareSettlementNotificationSafely).mockResolvedValue({
    mode: "preview",
    entries: [],
  });
  vi.mocked(fetchProjectIssuesForPage).mockRejectedValue(
    new Error("GitHub unavailable"),
  );
});

const invalidSnapshots: [string, () => unknown][] = [
  [
    "集計額の改変",
    () => {
      const value = currentSnapshot();
      value.totals.taxIncludedYen = 999999;
      return value;
    },
  ],
  [
    "金額の型が不正",
    () => {
      const value = summary();
      Reflect.set(value, "taxIncludedYen", "6600");
      return createSettlementSnapshotPayload(value);
    },
  ],
  [
    "明細だけの破損",
    () => {
      const value = currentSnapshot();
      value.source.lines[0].workMinutes = 9999;
      return value;
    },
  ],
  [
    "ハッシュが正しくても明細合計が不一致",
    () => {
      const value = summary();
      value.lines[0].timedRewardYen = 12000;
      return createSettlementSnapshotPayload(value);
    },
  ],
  [
    "原本ハッシュの欠落",
    () => {
      const value = currentSnapshot();
      Reflect.deleteProperty(value, "sourceHash");
      return value;
    },
  ],
  [
    "v1の明細と集計額を揃えた改変",
    () => {
      const value = structuredClone(settlementSnapshotV1);
      value.comparable.lines[0].timedRewardYen = 12000;
      value.comparable.lines[0].taxExcludedYen = 12000;
      value.comparable.timedRewardYen = value.totals.timedRewardYen = 12000;
      value.comparable.taxExcludedYen = value.totals.taxExcludedYen = 12000;
      value.comparable.taxYen = value.totals.taxYen = 1200;
      value.comparable.taxIncludedYen = value.totals.taxIncludedYen = 13200;
      return value;
    },
  ],
  [
    "v1のハッシュ欠落",
    () => {
      const value = structuredClone(settlementSnapshotV1);
      Reflect.deleteProperty(value, "hash");
      return value;
    },
  ],
  [
    "ハッシュが正しくても対象月が異なる",
    () => {
      const value = summary();
      value.month = "2026-07";
      return createSettlementSnapshotPayload(value);
    },
  ],
  [
    "ハッシュが正しくても対象作業者が異なる",
    () => {
      const value = summary();
      value.assigneeLogin = "other";
      return createSettlementSnapshotPayload(value);
    },
  ],
  [
    "非バージョン形式の非数値",
    () => ({ ...summary(), taxIncludedYen: Number.NaN }),
  ],
];

describe("V2の支払い前スナップショット検証", () => {
  it.each(invalidSnapshots)(
    "%sでは支払い・予定日・通知を更新しない",
    async (_name, build) => {
      useSnapshot(build());
      expect(
        (await markSettlementPaid("2026-08", "worker", "2026-09-14")).ok,
      ).toBe(false);
      expect(
        (await updatePaymentScheduledDate("2026-08", "worker", "2026-09-20"))
          .ok,
      ).toBe(false);
      expect(upsertPaymentPaid).not.toHaveBeenCalled();
      expect(upsertPaymentScheduledDate).not.toHaveBeenCalled();
      expect(prepareSettlementNotificationSafely).not.toHaveBeenCalled();
      expect(dispatchPreparedNotification).not.toHaveBeenCalled();
      expect(fetchProjectIssuesForPage).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1, 2, 3, 4])(
    "正常な形式v%iでは保存済み金額を使いGitHub障害に影響されない",
    async (version) => {
      const value: Record<string, unknown> = {
        ...currentSnapshot(),
        schemaVersion: version,
      };
      if (version < 4) delete value.sourceHash;
      if (version < 3) delete value.source;
      useSnapshot(
        version === 0
          ? summary()
          : version === 1
            ? structuredClone(settlementSnapshotV1)
            : value,
      );
      expect(
        await validateSettlementPaymentEligibility("2026-08", "worker"),
      ).toEqual({
        ok: true,
        taxExcludedYen: 6000,
        taxIncludedYen: 6600,
      });
      expect(
        (await markSettlementPaid("2026-08", "worker", "2026-09-14")).ok,
      ).toBe(true);
      expect(
        (await updatePaymentScheduledDate("2026-08", "worker", "2026-09-20"))
          .ok,
      ).toBe(true);
      expect(upsertPaymentPaid).toHaveBeenCalledOnce();
      expect(upsertPaymentScheduledDate).toHaveBeenCalledOnce();
      expect(prepareSettlementNotificationSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          taxExcludedYen: 6000,
          taxIncludedYen: 6600,
        }),
      );
      expect(dispatchPreparedNotification).toHaveBeenCalledOnce();
      expect(fetchProjectIssuesForPage).not.toHaveBeenCalled();
    },
  );

  it("正常な0円は未確認と扱わない", async () => {
    const value = summary();
    value.lines = [];
    value.fixedRewardYen =
      value.timedRewardYen =
      value.taxExcludedYen =
      value.taxYen =
      value.taxIncludedYen =
        0;
    useSnapshot(createSettlementSnapshotPayload(value));
    expect(
      await validateSettlementPaymentEligibility("2026-08", "worker"),
    ).toEqual({
      ok: true,
      taxExcludedYen: 0,
      taxIncludedYen: 0,
    });
  });

  it("承認記録がない場合は更新しない", async () => {
    expect(
      (await markSettlementPaid("2026-08", "worker", "2026-09-14")).ok,
    ).toBe(false);
    expect(
      (await updatePaymentScheduledDate("2026-08", "worker", "2026-09-20")).ok,
    ).toBe(false);
    expect(upsertPaymentPaid).not.toHaveBeenCalled();
    expect(upsertPaymentScheduledDate).not.toHaveBeenCalled();
    expect(prepareSettlementNotificationSafely).not.toHaveBeenCalled();
    expect(dispatchPreparedNotification).not.toHaveBeenCalled();
  });
});
