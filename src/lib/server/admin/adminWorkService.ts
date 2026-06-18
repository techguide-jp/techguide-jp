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
import { listWorkerProfiles } from "$lib/server/workers/workerProfileRepository";
import {
  toWorkerProfileView,
  type WorkerProfileView,
} from "$lib/server/workers/workerProfileService";

export type AdminWorkerSummary = WorkerProfileView & {
  issues: ProjectIssue[];
  openSessions: WorkSession[];
  issueCount: number;
  todoIssueCount: number;
};

export type AdminWorkDashboard = {
  health: ProjectFieldHealth;
  projectFetchError: string | null;
  workers: AdminWorkerSummary[];
  activeWorkers: AdminWorkerSummary[];
  notStartedIssues: ProjectIssue[];
  unassignedIssues: ProjectIssue[];
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

const collectLogins = (
  issues: ProjectIssue[],
  openSessions: WorkSession[],
  pendingRequests: WorkLogChangeRequest[],
): string[] => {
  const logins = new Set<string>();
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
      issues,
      openSessions,
      issueCount: issues.length,
      todoIssueCount: issues.filter(
        (issue) => issue.state === "OPEN" && issue.status === "Todo",
      ).length,
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
    workers,
    activeWorkers: workers.filter((worker) => worker.openSessions.length > 0),
    notStartedIssues: input.issues
      .filter(
        (issue) =>
          issue.state === "OPEN" &&
          issue.status === "Todo" &&
          !openIssueKeys.has(issueKey(issue)),
      )
      .sort(compareIssues),
    unassignedIssues: input.issues
      .filter((issue) => issue.state === "OPEN" && issue.assignees.length === 0)
      .sort(compareIssues),
    pendingRequests: [...input.pendingRequests].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    ),
  };
};

export const loadAdminWorkDashboard = async (): Promise<AdminWorkDashboard> => {
  const [projectResult, openSessions, pendingRequests] = await Promise.all([
    fetchProjectIssuesForPage(),
    listOpenWorkSessions(),
    listPendingChangeRequests(),
  ]);
  const logins = collectLogins(
    projectResult.issues,
    openSessions,
    pendingRequests,
  );
  const profiles = await listWorkerProfiles(logins);

  return buildAdminWorkDashboard({
    health: projectResult.health,
    projectFetchError: projectResult.projectFetchError,
    issues: projectResult.issues,
    openSessions,
    pendingRequests,
    profiles,
  });
};
