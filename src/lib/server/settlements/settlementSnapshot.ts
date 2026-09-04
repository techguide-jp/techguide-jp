import { createHash } from "node:crypto";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

export const SETTLEMENT_SNAPSHOT_SCHEMA_VERSION = 2;

type VersionedSettlementSnapshot = {
  schemaVersion: number;
  hash: string;
  totals: {
    fixedRewardYen: number;
    timedRewardYen: number;
    taxExcludedYen: number;
    taxYen: number;
    taxIncludedYen: number;
  };
  comparable: unknown;
  generatedAt: string;
};

type LegacySnapshotSummary = Partial<SettlementSummary> & {
  unclosedProjectIssues?: unknown[];
  unclosedIssueSessions?: unknown[];
};

const dateValue = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const issueKey = (
  issue: { repository?: unknown; number?: unknown } | undefined,
): string => {
  return `${String(issue?.repository ?? "")}#${String(issue?.number ?? "")}`;
};

const issueAssigneeKey = (
  issue: { repository?: unknown; number?: unknown } | undefined,
  assigneeLogin: unknown,
): string => `${issueKey(issue)}#${String(assigneeLogin ?? "")}`;

const normalizeIssue = (issue: unknown) => {
  const value =
    issue && typeof issue === "object"
      ? (issue as Record<string, unknown>)
      : {};
  const assignees = Array.isArray(value.assignees)
    ? value.assignees.map(String).sort()
    : [];

  return {
    repository: value.repository ?? null,
    number: value.number ?? null,
    state: value.state ?? null,
    closedAt: dateValue(value.closedAt),
    assignees,
    status: value.status ?? null,
    rewardMode: value.rewardMode ?? null,
    fixedRewardYen: value.fixedRewardYen ?? null,
    extraCapYen: value.extraCapYen ?? null,
    hourlyRateYen: value.hourlyRateYen ?? null,
  };
};

const normalizeSessions = (sessions: unknown) => {
  if (!Array.isArray(sessions)) return [];

  return sessions
    .map((session) => {
      const value =
        session && typeof session === "object"
          ? (session as Record<string, unknown>)
          : {};
      return {
        id: value.id ?? null,
        assigneeLogin: value.assigneeLogin ?? null,
        repository: value.repository ?? null,
        issueNumber: value.issueNumber ?? null,
        startedAt: dateValue(value.startedAt),
        endedAt: dateValue(value.endedAt),
        excludedAt: dateValue(value.excludedAt),
        excludeReason: value.excludeReason ?? null,
      };
    })
    .sort(
      (a, b) =>
        [
          String(a.repository).localeCompare(String(b.repository)),
          Number(a.issueNumber ?? 0) - Number(b.issueNumber ?? 0),
          String(a.startedAt).localeCompare(String(b.startedAt)),
          String(a.id).localeCompare(String(b.id)),
        ].find((result) => result !== 0) ?? 0,
    );
};

const normalizeRequests = (requests: unknown) => {
  if (!Array.isArray(requests)) return [];

  return requests
    .map((request) => {
      const value =
        request && typeof request === "object"
          ? (request as Record<string, unknown>)
          : {};
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
        reason: value.reason ?? null,
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
};

const normalizeCompletionReports = (reports: unknown) => {
  if (!Array.isArray(reports)) return [];

  return reports
    .map((report) => {
      const value =
        report && typeof report === "object"
          ? (report as Record<string, unknown>)
          : {};
      return {
        id: value.id ?? null,
        repository: value.repository ?? null,
        issueNumber: value.issueNumber ?? null,
        assigneeLogin: value.assigneeLogin ?? null,
        settlementMonth: value.settlementMonth ?? null,
        reportedAt: dateValue(value.reportedAt),
        rewardMode: value.rewardMode ?? null,
        fixedRewardYen: value.fixedRewardYen ?? null,
        source: value.source ?? null,
        evidenceUrl: value.evidenceUrl ?? null,
        evidenceNote: value.evidenceNote ?? null,
        invalidatedAt: dateValue(value.invalidatedAt),
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
};

const unwrapSnapshot = (snapshot: unknown): unknown => {
  if (snapshot && typeof snapshot === "object" && "comparable" in snapshot) {
    return (snapshot as { comparable: unknown }).comparable;
  }
  return snapshot;
};

export const normalizeSettlementSnapshot = (summary: unknown) => {
  const value =
    summary && typeof summary === "object"
      ? (summary as LegacySnapshotSummary)
      : {};
  const unsettledProjectIssues =
    value.unsettledProjectIssues ?? value.unclosedProjectIssues ?? [];
  const unsettledIssueSessions =
    value.unsettledIssueSessions ?? value.unclosedIssueSessions ?? [];

  return {
    month: value.month ?? null,
    assigneeLogin: value.assigneeLogin ?? null,
    fixedRewardYen: value.fixedRewardYen ?? null,
    timedRewardYen: value.timedRewardYen ?? null,
    taxExcludedYen: value.taxExcludedYen ?? null,
    taxYen: value.taxYen ?? null,
    taxIncludedYen: value.taxIncludedYen ?? null,
    approvalRequired: value.approvalRequired ?? null,
    lines: (Array.isArray(value.lines) ? value.lines : [])
      .map((line) => {
        const valueLine =
          line && typeof line === "object"
            ? (line as Record<string, unknown>)
            : {};
        const warnings = Array.isArray(valueLine.warnings)
          ? valueLine.warnings.map(String).sort()
          : [];
        return {
          issue: normalizeIssue(valueLine.issue),
          fixedRewardYen: valueLine.fixedRewardYen ?? null,
          workMinutes: valueLine.workMinutes ?? null,
          timedRewardYen: valueLine.timedRewardYen ?? null,
          taxExcludedYen: valueLine.taxExcludedYen ?? null,
          sessionMinutesById:
            valueLine.sessionMinutesById &&
            typeof valueLine.sessionMinutesById === "object"
              ? Object.fromEntries(
                  Object.entries(
                    valueLine.sessionMinutesById as Record<string, unknown>,
                  ).sort(([a], [b]) => a.localeCompare(b)),
                )
              : {},
          hourlyRateYenSnapshot: valueLine.hourlyRateYenSnapshot ?? null,
          completionReportId: valueLine.completionReportId ?? null,
          warnings,
          sessions: normalizeSessions(valueLine.sessions),
        };
      })
      .sort((a, b) => issueKey(a.issue).localeCompare(issueKey(b.issue))),
    pendingRequests: normalizeRequests(value.pendingRequests),
    unsettledProjectIssues: (Array.isArray(unsettledProjectIssues)
      ? unsettledProjectIssues
      : []
    )
      .map((line) => {
        const valueLine =
          line && typeof line === "object"
            ? (line as Record<string, unknown>)
            : {};
        return {
          issue: normalizeIssue(valueLine.issue),
          workMinutes: valueLine.workMinutes ?? null,
          reason: valueLine.reason ?? null,
          sessions: normalizeSessions(valueLine.sessions),
        };
      })
      .sort((a, b) => issueKey(a.issue).localeCompare(issueKey(b.issue))),
    unsettledIssueSessions: normalizeSessions(unsettledIssueSessions),
    blockingReasons: Array.isArray(value.blockingReasons)
      ? value.blockingReasons.map(String).sort()
      : [],
    completionReports: normalizeCompletionReports(value.completionReports),
  };
};

export const hashSettlementSummary = (summary: SettlementSummary): string => {
  const comparable = normalizeSettlementSnapshot(summary);
  return createHash("sha256").update(JSON.stringify(comparable)).digest("hex");
};

const isVersionedSettlementSnapshot = (
  snapshot: unknown,
): snapshot is VersionedSettlementSnapshot => {
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    typeof (snapshot as { schemaVersion?: unknown }).schemaVersion ===
      "number" &&
    typeof (snapshot as { hash?: unknown }).hash === "string"
  );
};

export const createSettlementSnapshotPayload = (
  summary: SettlementSummary,
): VersionedSettlementSnapshot => {
  const comparable = normalizeSettlementSnapshot(summary);
  const hash = createHash("sha256")
    .update(JSON.stringify(comparable))
    .digest("hex");

  return {
    schemaVersion: SETTLEMENT_SNAPSHOT_SCHEMA_VERSION,
    hash,
    totals: {
      fixedRewardYen: summary.fixedRewardYen,
      timedRewardYen: summary.timedRewardYen,
      taxExcludedYen: summary.taxExcludedYen,
      taxYen: summary.taxYen,
      taxIncludedYen: summary.taxIncludedYen,
    },
    comparable,
    generatedAt: new Date().toISOString(),
  };
};

export const hasSettlementSnapshotChanges = (
  snapshot: unknown,
  summary: SettlementSummary,
): boolean => {
  if (
    isVersionedSettlementSnapshot(snapshot) &&
    snapshot.schemaVersion === SETTLEMENT_SNAPSHOT_SCHEMA_VERSION
  ) {
    return snapshot.hash !== hashSettlementSummary(summary);
  }

  return (
    JSON.stringify(normalizeSettlementSnapshot(unwrapSnapshot(snapshot))) !==
    JSON.stringify(normalizeSettlementSnapshot(summary))
  );
};

const normalizeWorkSubmissionSnapshot = (snapshot: unknown) => {
  const normalized = normalizeSettlementSnapshot(unwrapSnapshot(snapshot));
  return {
    month: normalized.month,
    assigneeLogin: normalized.assigneeLogin,
    timedRewardYen: normalized.timedRewardYen,
    lines: normalized.lines
      .filter(
        (line) =>
          Number(line.workMinutes ?? 0) > 0 ||
          Number(line.timedRewardYen ?? 0) > 0,
      )
      .map((line) => ({
        issue: {
          repository: line.issue.repository,
          number: line.issue.number,
          assignees: line.issue.assignees,
          rewardMode: line.issue.rewardMode,
        },
        workMinutes: line.workMinutes,
        timedRewardYen: line.timedRewardYen,
        sessionMinutesById: line.sessionMinutesById,
        hourlyRateYenSnapshot:
          line.hourlyRateYenSnapshot ?? line.issue.hourlyRateYen,
        warnings: line.warnings.filter(
          (warning) => !warning.includes("固定報酬"),
        ),
        sessions: line.sessions,
      })),
    pendingRequests: normalized.pendingRequests,
    unsettledProjectIssues: normalized.unsettledProjectIssues.filter(
      (line) => line.reason !== "merge_waiting",
    ),
    unsettledIssueSessions: normalized.unsettledIssueSessions,
    completionReports: normalized.completionReports,
  };
};

/** PRマージ状態だけの変化では、作業者に月次の再申請を求めない。 */
export const hasWorkSubmissionChanges = (
  snapshot: unknown,
  summary: SettlementSummary,
): boolean =>
  JSON.stringify(normalizeWorkSubmissionSnapshot(snapshot)) !==
  JSON.stringify(normalizeWorkSubmissionSnapshot(summary));

export const settlementSnapshotHourlyRates = (
  snapshot: unknown,
): Map<string, number | null> => {
  const normalized = normalizeSettlementSnapshot(unwrapSnapshot(snapshot));
  return new Map(
    normalized.lines.map((line) => {
      const rate = line.hourlyRateYenSnapshot ?? line.issue.hourlyRateYen;
      return [
        issueAssigneeKey(line.issue, normalized.assigneeLogin),
        typeof rate === "number" ? rate : null,
      ];
    }),
  );
};

export const settlementSnapshotTimedRewards = (
  snapshot: unknown,
): Map<string, number> => {
  const normalized = normalizeSettlementSnapshot(unwrapSnapshot(snapshot));
  return new Map(
    normalized.lines.map((line) => [
      issueKey(line.issue),
      typeof line.timedRewardYen === "number" ? line.timedRewardYen : 0,
    ]),
  );
};

export const settlementSnapshotAmount = (
  snapshot: unknown,
  key: "taxExcludedYen" | "taxIncludedYen",
): number | null => {
  if (isVersionedSettlementSnapshot(snapshot)) {
    return snapshot.totals[key];
  }
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Partial<SettlementSummary>)[key];
  return typeof value === "number" ? value : null;
};
