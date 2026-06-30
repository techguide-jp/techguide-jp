import type {
  WorkLogChangeRequest,
  WorkerProfile,
  WorkSession,
} from "$lib/server/db/schema";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import type {
  ProjectFieldHealth,
  ProjectIssue,
} from "$lib/server/github/projectTypes";
import {
  listOpenWorkSessions,
  listPendingChangeRequests,
} from "$lib/server/work/workRepository";
import { listAllWorkerProfiles } from "$lib/server/workers/workerProfileRepository";
import {
  toWorkerProfileView,
  type WorkerProfileView,
} from "$lib/server/workers/workerProfileService";

export type AdminWorkerSummary = WorkerProfileView & {
  openSessions: WorkSession[];
  issueSummary: AdminIssueSummary;
};

export type CountBreakdown = {
  label: string;
  count: number;
};

export type AdminIssueSummary = {
  total: number;
  open: number;
  closed: number;
  todo: number;
  byStatus: CountBreakdown[];
  byRepository: CountBreakdown[];
  byAssignee: CountBreakdown[];
};

export type AdminWorkDashboard = {
  health: ProjectFieldHealth;
  projectFetchError: string | null;
  issueSummary: AdminIssueSummary;
  workers: AdminWorkerSummary[];
  activeWorkers: AdminWorkerSummary[];
  notStartedIssueSummary: AdminIssueSummary;
  unassignedIssueSummary: AdminIssueSummary;
  pendingRequests: WorkLogChangeRequest[];
};

type BuildAdminWorkDashboardInput = {
  health: ProjectFieldHealth;
  projectFetchError: string | null;
  issues: ProjectIssue[];
  openSessions: WorkSession[];
  pendingRequests: WorkLogChangeRequest[];
  profiles: WorkerProfile[];
};

const issueKey = (issue: {
  repository: string;
  number?: number;
  issueNumber?: number;
}): string => `${issue.repository}#${issue.number ?? issue.issueNumber}`;

const compareByLogin = (a: string, b: string): number =>
  a.localeCompare(b, "ja");

const compareIssues = (a: ProjectIssue, b: ProjectIssue): number =>
  a.repository.localeCompare(b.repository, "ja") || a.number - b.number;

const compareSessions = (a: WorkSession, b: WorkSession): number =>
  b.startedAt.getTime() - a.startedAt.getTime();

const compareBreakdowns = (a: CountBreakdown, b: CountBreakdown): number =>
  b.count - a.count || a.label.localeCompare(b.label, "ja");

const increment = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const toBreakdown = (counts: Map<string, number>): CountBreakdown[] =>
  [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(compareBreakdowns);

const summarizeIssues = (issues: ProjectIssue[]): AdminIssueSummary => {
  const byStatus = new Map<string, number>();
  const byRepository = new Map<string, number>();
  const byAssignee = new Map<string, number>();

  for (const issue of issues) {
    increment(byStatus, issue.status ?? "Status未設定");
    increment(byRepository, issue.repository);
    if (issue.assignees.length === 0) {
      increment(byAssignee, "未担当");
    } else {
      for (const login of issue.assignees) increment(byAssignee, login);
    }
  }

  return {
    total: issues.length,
    open: issues.filter((issue) => issue.state === "OPEN").length,
    closed: issues.filter((issue) => issue.state === "CLOSED").length,
    todo: issues.filter(
      (issue) => issue.state === "OPEN" && issue.status === "Todo",
    ).length,
    byStatus: toBreakdown(byStatus),
    byRepository: toBreakdown(byRepository),
    byAssignee: toBreakdown(byAssignee),
  };
};

const collectLogins = (
  issues: ProjectIssue[],
  openSessions: WorkSession[],
  pendingRequests: WorkLogChangeRequest[],
  profiles: WorkerProfile[],
): string[] => {
  const logins = new Set<string>();
  for (const profile of profiles) logins.add(profile.login);
  for (const issue of issues) {
    for (const login of issue.assignees) logins.add(login);
  }
  for (const session of openSessions) logins.add(session.assigneeLogin);
  for (const request of pendingRequests) logins.add(request.assigneeLogin);
  return [...logins].sort(compareByLogin);
};

export const buildAdminWorkDashboard = (
  input: BuildAdminWorkDashboardInput,
): AdminWorkDashboard => {
  const profileByLogin = new Map(
    input.profiles.map((profile) => [profile.login, profile]),
  );
  const issuesByLogin = new Map<string, ProjectIssue[]>();
  const sessionsByLogin = new Map<string, WorkSession[]>();
  const openIssueKeys = new Set(input.openSessions.map(issueKey));
  const logins = collectLogins(
    input.issues,
    input.openSessions,
    input.pendingRequests,
    input.profiles,
  );

  for (const issue of input.issues) {
    for (const login of issue.assignees) {
      const issues = issuesByLogin.get(login) ?? [];
      issues.push(issue);
      issuesByLogin.set(login, issues);
    }
  }
  for (const session of input.openSessions) {
    const sessions = sessionsByLogin.get(session.assigneeLogin) ?? [];
    sessions.push(session);
    sessionsByLogin.set(session.assigneeLogin, sessions);
  }

  const workers = logins.map((login): AdminWorkerSummary => {
    const profile = toWorkerProfileView(
      login,
      profileByLogin.get(login) ?? null,
    );
    const issues = [...(issuesByLogin.get(login) ?? [])].sort(compareIssues);
    const openSessions = [...(sessionsByLogin.get(login) ?? [])].sort(
      compareSessions,
    );

    return {
      ...profile,
      openSessions,
      issueSummary: summarizeIssues(issues),
    };
  });

  workers.sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName, "ja") ||
      compareByLogin(a.login, b.login),
  );

  return {
    health: input.health,
    projectFetchError: input.projectFetchError,
    issueSummary: summarizeIssues(input.issues),
    workers,
    activeWorkers: workers.filter((worker) => worker.openSessions.length > 0),
    notStartedIssueSummary: summarizeIssues(
      input.issues
        .filter(
          (issue) =>
            issue.state === "OPEN" &&
            issue.status === "Todo" &&
            !openIssueKeys.has(issueKey(issue)),
        )
        .sort(compareIssues),
    ),
    unassignedIssueSummary: summarizeIssues(
      input.issues
        .filter(
          (issue) => issue.state === "OPEN" && issue.assignees.length === 0,
        )
        .sort(compareIssues),
    ),
    pendingRequests: [...input.pendingRequests].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    ),
  };
};

export const loadAdminWorkDashboard = async (): Promise<AdminWorkDashboard> => {
  const [projectResult, openSessions, pendingRequests, profiles] =
    await Promise.all([
      fetchProjectIssuesForPage(),
      listOpenWorkSessions(),
      listPendingChangeRequests(),
      listAllWorkerProfiles(),
    ]);

  return buildAdminWorkDashboard({
    health: projectResult.health,
    projectFetchError: projectResult.projectFetchError,
    issues: projectResult.issues,
    openSessions,
    pendingRequests,
    profiles,
  });
};
