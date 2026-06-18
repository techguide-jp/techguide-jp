import { fetchProjectIssues } from "$lib/server/github/projectClient";
import {
  listChangeRequests,
  listWorkSessions,
  reviewChangeRequest
} from "$lib/server/work/workRepository";
import { buildSettlementSummaries, findSummary } from "$lib/server/settlements/settlementCalculator";
import {
  getSnapshot,
  listSnapshotsForMonth,
  upsertSnapshot
} from "$lib/server/settlements/snapshotRepository";
import type { MonthlySettlementSnapshot } from "$lib/server/db/schema";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

type SnapshotSummary = Partial<SettlementSummary> & {
  unclosedProjectIssues?: unknown[];
  unclosedIssueSessions?: unknown[];
};

const snapshotNumber = (snapshot: unknown, key: "taxExcludedYen" | "taxIncludedYen"): number | null => {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Partial<SettlementSummary>)[key];
  return typeof value === "number" ? value : null;
};

const dateValue = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const issueKey = (issue: { repository?: unknown; number?: unknown } | undefined): string => {
  return `${String(issue?.repository ?? "")}#${String(issue?.number ?? "")}`;
};

const normalizeIssue = (issue: unknown) => {
  const value = issue && typeof issue === "object" ? (issue as Record<string, unknown>) : {};
  const assignees = Array.isArray(value.assignees) ? value.assignees.map(String).sort() : [];

  return {
    repository: value.repository ?? null,
    number: value.number ?? null,
    title: value.title ?? null,
    state: value.state ?? null,
    closedAt: dateValue(value.closedAt),
    assignees,
    status: value.status ?? null,
    rewardMode: value.rewardMode ?? null,
    fixedRewardYen: value.fixedRewardYen ?? null,
    extraCapYen: value.extraCapYen ?? null,
    hourlyRateYen: value.hourlyRateYen ?? null
  };
};

const normalizeSessions = (sessions: unknown) => {
  if (!Array.isArray(sessions)) return [];

  return sessions
    .map((session) => {
      const value = session && typeof session === "object" ? (session as Record<string, unknown>) : {};
      return {
        id: value.id ?? null,
        assigneeLogin: value.assigneeLogin ?? null,
        repository: value.repository ?? null,
        issueNumber: value.issueNumber ?? null,
        issueTitle: value.issueTitle ?? null,
        startedAt: dateValue(value.startedAt),
        endedAt: dateValue(value.endedAt),
        excludedAt: dateValue(value.excludedAt),
        excludeReason: value.excludeReason ?? null
      };
    })
    .sort((a, b) =>
      [
        String(a.repository).localeCompare(String(b.repository)),
        Number(a.issueNumber ?? 0) - Number(b.issueNumber ?? 0),
        String(a.startedAt).localeCompare(String(b.startedAt)),
        String(a.id).localeCompare(String(b.id))
      ].find((result) => result !== 0) ?? 0
    );
};

const normalizeRequests = (requests: unknown) => {
  if (!Array.isArray(requests)) return [];

  return requests
    .map((request) => {
      const value = request && typeof request === "object" ? (request as Record<string, unknown>) : {};
      return {
        id: value.id ?? null,
        requestType: value.requestType ?? null,
        status: value.status ?? null,
        assigneeLogin: value.assigneeLogin ?? null,
        repository: value.repository ?? null,
        issueNumber: value.issueNumber ?? null,
        targetSessionId: value.targetSessionId ?? null,
        requestedStartedAt: dateValue(value.requestedStartedAt),
        requestedEndedAt: dateValue(value.requestedEndedAt),
        reason: value.reason ?? null
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
};

const normalizeSettlementSnapshot = (summary: unknown) => {
  const value = summary && typeof summary === "object" ? (summary as SnapshotSummary) : {};
  const unsettledProjectIssues = value.unsettledProjectIssues ?? value.unclosedProjectIssues ?? [];
  const unsettledIssueSessions = value.unsettledIssueSessions ?? value.unclosedIssueSessions ?? [];

  return {
    month: value.month ?? null,
    assigneeLogin: value.assigneeLogin ?? null,
    fixedRewardYen: value.fixedRewardYen ?? null,
    timedRewardYen: value.timedRewardYen ?? null,
    taxExcludedYen: value.taxExcludedYen ?? null,
    taxIncludedYen: value.taxIncludedYen ?? null,
    lines: (Array.isArray(value.lines) ? value.lines : [])
      .map((line) => ({
        issue: normalizeIssue(line.issue),
        fixedRewardYen: line.fixedRewardYen,
        workMinutes: line.workMinutes,
        timedRewardYen: line.timedRewardYen,
        taxExcludedYen: line.taxExcludedYen,
        warnings: [...line.warnings].sort(),
        sessions: normalizeSessions(line.sessions)
      }))
      .sort((a, b) => issueKey(a.issue).localeCompare(issueKey(b.issue))),
    pendingRequests: normalizeRequests(value.pendingRequests),
    unsettledProjectIssues: (Array.isArray(unsettledProjectIssues) ? unsettledProjectIssues : [])
      .map((line) => {
        const valueLine = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
        return {
          issue: normalizeIssue(valueLine.issue),
          workMinutes: valueLine.workMinutes ?? null,
          reason: valueLine.reason ?? null,
          sessions: normalizeSessions(valueLine.sessions)
        };
      })
      .sort((a, b) => issueKey(a.issue).localeCompare(issueKey(b.issue))),
    unsettledIssueSessions: normalizeSessions(unsettledIssueSessions),
    blockingReasons: Array.isArray(value.blockingReasons) ? value.blockingReasons.map(String).sort() : []
  };
};

const hasSnapshotChanges = (snapshot: unknown, summary: SettlementSummary): boolean => {
  return JSON.stringify(normalizeSettlementSnapshot(snapshot)) !== JSON.stringify(normalizeSettlementSnapshot(summary));
};

const toSnapshotMeta = (snapshot: MonthlySettlementSnapshot, summary: SettlementSummary | undefined) => ({
  assigneeLogin: snapshot.assigneeLogin,
  approvedBy: snapshot.approvedBy,
  approvedAt: snapshot.approvedAt,
  taxExcludedYen: snapshotNumber(snapshot.snapshot, "taxExcludedYen"),
  taxIncludedYen: snapshotNumber(snapshot.snapshot, "taxIncludedYen"),
  hasChanges: summary ? hasSnapshotChanges(snapshot.snapshot, summary) : true
});

export const loadSettlementMonth = async (month: string) => {
  const [{ health, issues }, sessions, requests, snapshots] = await Promise.all([
    fetchProjectIssues(),
    listWorkSessions(),
    listChangeRequests(),
    listSnapshotsForMonth(month)
  ]);

  const summaries = buildSettlementSummaries(month, issues, sessions, requests);
  const summaryByAssignee = new Map(summaries.map((summary) => [summary.assigneeLogin, summary]));

  return {
    health,
    issues,
    sessions,
    requests,
    summaries,
    snapshots: snapshots.map((snapshot) => toSnapshotMeta(snapshot, summaryByAssignee.get(snapshot.assigneeLogin)))
  };
};

export const loadSettlementAssignee = async (month: string, assigneeLogin: string) => {
  const data = await loadSettlementMonth(month);
  const summary = findSummary(data.summaries, assigneeLogin);
  const snapshot = await getSnapshot(month, assigneeLogin);
  return { ...data, summary, snapshot };
};

export const approveSettlement = async (
  month: string,
  assigneeLogin: string,
  approvedBy: string
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const { summary } = await loadSettlementAssignee(month, assigneeLogin);
  if (!summary) {
    return { ok: false, message: "対象assigneeの精算データがありません。" };
  }
  if (!summary.approvalRequired) {
    return { ok: false, message: "精算対象がないため月次承認は不要です。" };
  }
  if (summary.blockingReasons.length > 0) {
    return { ok: false, message: "未解決の不備があるため月次承認できません。" };
  }

  await upsertSnapshot(summary, approvedBy);
  return { ok: true };
};

export const reviewSettlementChangeRequest = async (
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  note: string | null
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const request = await reviewChangeRequest(requestId, status, reviewedBy, note);
  if (!request) {
    return { ok: false, message: "修正申請が見つかりません。" };
  }
  return { ok: true };
};
