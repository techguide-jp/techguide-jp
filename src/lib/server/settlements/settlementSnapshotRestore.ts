import { z } from "zod";
import { createHash } from "node:crypto";
import {
  hashSettlementSource,
  normalizeSettlementSnapshot,
} from "$lib/server/settlements/settlementSnapshot";
import type { WorkSession } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

const amount = z.number().finite().nonnegative();
const issueSchema = z
  .object({
    repository: z.string().min(1),
    number: z.number().int().positive(),
    title: z.string().optional(),
    url: z.string().optional(),
    projectItemId: z.string().optional(),
    createdAt: z.string().optional(),
    state: z.enum(["OPEN", "CLOSED"]),
    closedAt: z.string().nullable(),
    assignees: z.array(z.string()),
    status: z.string().nullable(),
    rewardMode: z.enum(["固定", "ハイブリッド"]).nullable(),
    fixedRewardYen: amount.nullable(),
    extraCapYen: amount.nullable(),
    hourlyRateYen: amount.nullable(),
  })
  .transform(
    (issue): ProjectIssue => ({
      ...issue,
      // 旧版に件名がない場合も、現在のGitHub情報で過去の明細を補わない。
      title: issue.title ?? `Issue #${issue.number}（保存時の件名なし）`,
      url:
        issue.url ??
        `https://github.com/${issue.repository}/issues/${issue.number}`,
      projectItemId: issue.projectItemId ?? "",
      createdAt: issue.createdAt ?? "",
    }),
  );

const sessionSchema = z
  .object({
    id: z.string(),
    assigneeLogin: z.string(),
    repository: z.string(),
    issueNumber: z.number(),
    issueTitle: z.string().optional(),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date().nullable(),
    excludedAt: z.coerce.date().nullable(),
    excludeReason: z.string().nullable(),
    createdBy: z.string().optional(),
    createdAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .transform(
    (session): WorkSession => ({
      ...session,
      issueTitle: session.issueTitle ?? `Issue #${session.issueNumber}`,
      createdBy: session.createdBy ?? session.assigneeLogin,
      createdAt: session.createdAt ?? session.startedAt,
      updatedAt: session.updatedAt ?? session.endedAt ?? session.startedAt,
    }),
  );

const summarySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  assigneeLogin: z.string().min(1),
  fixedRewardYen: amount,
  timedRewardYen: amount,
  taxExcludedYen: amount,
  taxYen: amount,
  taxIncludedYen: amount,
  approvalRequired: z.boolean(),
  lines: z.array(
    z.object({
      issue: issueSchema,
      fixedRewardYen: amount,
      workMinutes: amount,
      timedRewardYen: amount,
      taxExcludedYen: amount,
      warnings: z.array(z.string()),
      sessions: z.array(sessionSchema),
      sessionMinutesById: z.record(z.string(), amount).optional(),
      hourlyRateYenSnapshot: amount.nullable().optional(),
      completionReportId: z.string().nullable().optional(),
    }),
  ),
});

const normalizeV1Snapshot = (snapshot: unknown) => {
  const value = normalizeSettlementSnapshot(snapshot);
  // v1のハッシュには後から増えた単価・分割分数・完了報告を含めず、当時のキー順も維持する。
  return {
    month: value.month,
    assigneeLogin: value.assigneeLogin,
    fixedRewardYen: value.fixedRewardYen,
    timedRewardYen: value.timedRewardYen,
    taxExcludedYen: value.taxExcludedYen,
    taxYen: value.taxYen,
    taxIncludedYen: value.taxIncludedYen,
    approvalRequired: value.approvalRequired,
    lines: value.lines.map((line) => ({
      issue: line.issue,
      fixedRewardYen: line.fixedRewardYen,
      workMinutes: line.workMinutes,
      timedRewardYen: line.timedRewardYen,
      taxExcludedYen: line.taxExcludedYen,
      warnings: line.warnings,
      sessions: line.sessions,
    })),
    pendingRequests: value.pendingRequests,
    unsettledProjectIssues: value.unsettledProjectIssues,
    unsettledIssueSessions: value.unsettledIssueSessions,
    blockingReasons: value.blockingReasons,
  };
};

/** 保存された明細だけで表示・通知書を復元する。破損・金額不整合は0円にせず失敗する。 */
export const restoreSettlementSummary = (
  snapshot: unknown,
): SettlementSummary | null => {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = snapshot as Record<string, unknown>;
  if (
    ("source" in value || "comparable" in value || "hash" in value) &&
    (typeof value.schemaVersion !== "number" ||
      ![1, 2, 3, 4].includes(value.schemaVersion))
  )
    return null;
  if (
    Number(value.schemaVersion) < 3 &&
    ("source" in value || "sourceHash" in value)
  )
    return null;
  let restoreSource = value.source ?? value.comparable ?? value;
  if (typeof value.schemaVersion === "number" && value.schemaVersion >= 1) {
    // 金額が同じでも、明細だけ壊れた原本を通知書へ転記しない。
    try {
      if (!value.comparable || typeof value.hash !== "string") return null;
      const normalized =
        value.schemaVersion === 1
          ? normalizeV1Snapshot(value.comparable)
          : normalizeSettlementSnapshot(value.comparable);
      const hash = (content: unknown) =>
        createHash("sha256").update(JSON.stringify(content)).digest("hex");
      const legacy = {
        ...normalized,
        unsettledProjectIssues: normalized.unsettledProjectIssues.map(
          (line) => ({
            ...line,
            reason:
              line.reason === "completion_waiting"
                ? "merge_waiting"
                : line.reason,
          }),
        ),
      };
      if (
        hash(normalized) !== value.hash &&
        !(value.schemaVersion === 2 && hash(legacy) === value.hash)
      )
        return null;
      // v1に存在しなかった未検証の追加項目を、通知書へ持ち込まない。
      if (value.schemaVersion === 1) restoreSource = normalized;
      if (
        value.schemaVersion >= 3 &&
        (!value.source ||
          hashSettlementSource(normalizeSettlementSnapshot(value.source)) !==
            hashSettlementSource(normalized))
      )
        return null;
      if (
        (value.schemaVersion >= 4 || "sourceHash" in value) &&
        (typeof value.sourceHash !== "string" ||
          hashSettlementSource(value.source) !== value.sourceHash)
      )
        return null;
    } catch {
      return null;
    }
  }
  const parsed = summarySchema.safeParse(restoreSource);
  if (!parsed.success) return null;
  const summary = parsed.data;
  const sum = (key: "fixedRewardYen" | "timedRewardYen" | "taxExcludedYen") =>
    summary.lines.reduce((total, line) => total + line[key], 0);
  if (
    sum("fixedRewardYen") !== summary.fixedRewardYen ||
    sum("timedRewardYen") !== summary.timedRewardYen ||
    sum("taxExcludedYen") !== summary.taxExcludedYen ||
    summary.fixedRewardYen + summary.timedRewardYen !==
      summary.taxExcludedYen ||
    summary.taxExcludedYen + summary.taxYen !== summary.taxIncludedYen
  )
    return null;
  if (value.totals && typeof value.totals === "object") {
    const totals = value.totals as Record<string, unknown>;
    for (const key of [
      "fixedRewardYen",
      "timedRewardYen",
      "taxExcludedYen",
      "taxYen",
      "taxIncludedYen",
    ] as const) {
      if (totals[key] !== summary[key]) return null;
    }
  }
  return {
    ...summary,
    lines: summary.lines.map((line) => ({
      ...line,
      assigneeLogin: summary.assigneeLogin,
    })),
    pendingRequests: [],
    unsettledProjectIssues: [],
    unsettledIssueSessions: [],
    blockingReasons: [],
  };
};
