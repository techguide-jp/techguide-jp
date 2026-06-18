import { env } from "$lib/server/env";
import { graphQL } from "$lib/server/github/githubGraphqlClient";
import { e2eProjectIssues } from "$lib/server/github/projectFixtures";
import {
  buildProjectHealth,
  mapProjectIssues,
} from "$lib/server/github/projectMapper";
import {
  projectFieldsQuery,
  projectQuery,
  updateProjectItemFieldValueMutation,
} from "$lib/server/github/projectQueries";
import {
  PROJECT_NUMBER,
  PROJECT_OWNER,
  requiredProjectFields,
  type ProjectFieldHealth,
  type ProjectIssue,
} from "$lib/server/github/projectTypes";
import type {
  GraphQLFieldNode,
  GraphQLProjectFieldsResponse,
  GraphQLProjectItem,
  GraphQLProjectResponse,
  GraphQLUpdateProjectItemFieldValueResponse,
} from "$lib/server/github/projectGraphqlTypes";

type ProjectIssuesResult = {
  health: ProjectFieldHealth;
  issues: ProjectIssue[];
};

type ProjectIssuesPageResult = ProjectIssuesResult & {
  projectFetchError: string | null;
};

type ProjectClientRuntimeHealth = {
  cacheTtlMs: number;
  cacheExpiresAt: Date | null;
  inFlight: boolean;
  lastFetchSucceededAt: Date | null;
  lastFetchFailedAt: Date | null;
  lastFetchError: string | null;
  e2eFixtureMode: boolean;
};

const PROJECT_ISSUES_CACHE_TTL_MS = 60_000;
let projectIssuesCache: {
  expiresAt: number;
  value: ProjectIssuesResult;
} | null = null;
let projectIssuesInFlight: Promise<ProjectIssuesResult> | null = null;
let lastFetchSucceededAt: Date | null = null;
let lastFetchFailedAt: Date | null = null;
let lastFetchError: string | null = null;

export const unavailableProjectHealth = (): ProjectFieldHealth => ({
  title: "外注管理",
  missingFields: Object.values(requiredProjectFields),
  invalidFields: [],
  availableFields: [],
});

export const projectFetchErrorMessage = (error: unknown): string => {
  const message =
    error instanceof Error ? error.message : "Project取得に失敗しました。";
  if (message === "GITHUB_PROJECT_TOKEN is required") {
    return "GitHub Projectを取得できません。GITHUB_PROJECT_TOKEN が未設定です。";
  }
  if (message.includes("Resource not accessible by personal access token")) {
    return "GitHub Projectを取得できません。GITHUB_PROJECT_TOKEN にProject v2を読める権限がありません。";
  }
  return `GitHub Projectを取得できません。${message}`;
};

export const clearProjectIssuesCache = (): void => {
  projectIssuesCache = null;
  projectIssuesInFlight = null;
};

export const getProjectClientRuntimeHealth =
  (): ProjectClientRuntimeHealth => ({
    cacheTtlMs: PROJECT_ISSUES_CACHE_TTL_MS,
    cacheExpiresAt: projectIssuesCache
      ? new Date(projectIssuesCache.expiresAt)
      : null,
    inFlight: Boolean(projectIssuesInFlight),
    lastFetchSucceededAt,
    lastFetchFailedAt,
    lastFetchError,
    e2eFixtureMode: env.e2eTestMode,
  });

const fetchProjectFields = async (): Promise<{
  projectId: string;
  fields: GraphQLFieldNode[];
}> => {
  const payload = await graphQL<GraphQLProjectFieldsResponse>(
    projectFieldsQuery,
    {
      owner: PROJECT_OWNER,
      number: PROJECT_NUMBER,
    },
  );

  const project = payload.data?.organization?.projectV2;
  if (!project) {
    throw new Error(
      `GitHub Project ${PROJECT_OWNER}/${PROJECT_NUMBER} was not found`,
    );
  }

  return {
    projectId: project.id,
    fields: project.fields.nodes,
  };
};

const findStatusFieldOption = (
  fields: GraphQLFieldNode[],
  statusName: string,
): { fieldId: string; optionId: string } => {
  const field = fields.find(
    (candidate) => candidate.name === requiredProjectFields.status,
  );
  if (!field) {
    throw new Error(
      `Project field ${requiredProjectFields.status} was not found`,
    );
  }
  if (
    field.__typename !== "ProjectV2SingleSelectField" ||
    field.dataType !== "SINGLE_SELECT"
  ) {
    throw new Error(
      `Project field ${requiredProjectFields.status} must be SINGLE_SELECT`,
    );
  }

  const option = field.options.find(
    (candidate) => candidate.name === statusName,
  );
  if (!option) {
    throw new Error(`Project status option ${statusName} was not found`);
  }

  return {
    fieldId: field.id,
    optionId: option.id,
  };
};

export const setProjectItemStatus = async (
  projectItemId: string,
  statusName: string,
): Promise<void> => {
  if (!projectItemId) {
    throw new Error("Project item ID is required");
  }
  if (env.e2eTestMode) {
    clearProjectIssuesCache();
    return;
  }

  const project = await fetchProjectFields();
  const status = findStatusFieldOption(project.fields, statusName);

  await graphQL<GraphQLUpdateProjectItemFieldValueResponse>(
    updateProjectItemFieldValueMutation,
    {
      projectId: project.projectId,
      itemId: projectItemId,
      fieldId: status.fieldId,
      optionId: status.optionId,
    },
  );
  clearProjectIssuesCache();
};

const fetchProjectPage = async (
  after: string | null,
): Promise<{
  title: string;
  fields: GraphQLFieldNode[];
  items: GraphQLProjectItem[];
  hasNextPage: boolean;
  endCursor: string | null;
}> => {
  const payload = await graphQL<GraphQLProjectResponse>(projectQuery, {
    owner: PROJECT_OWNER,
    number: PROJECT_NUMBER,
    after,
  });

  const project = payload.data?.organization?.projectV2;
  if (!project) {
    throw new Error(
      `GitHub Project ${PROJECT_OWNER}/${PROJECT_NUMBER} was not found`,
    );
  }

  return {
    title: project.title,
    fields: project.fields.nodes,
    items: project.items.nodes,
    hasNextPage: project.items.pageInfo.hasNextPage,
    endCursor: project.items.pageInfo.endCursor,
  };
};

const fetchAllProjectItems = async (): Promise<{
  title: string;
  fields: GraphQLFieldNode[];
  items: GraphQLProjectItem[];
}> => {
  const firstPage = await fetchProjectPage(null);
  const items: GraphQLProjectItem[] = [...firstPage.items];
  let after = firstPage.hasNextPage ? firstPage.endCursor : null;

  while (after) {
    const page = await fetchProjectPage(after);
    items.push(...page.items);
    after = page.hasNextPage ? page.endCursor : null;
  }

  return { title: firstPage.title, fields: firstPage.fields, items };
};

const fetchProjectIssuesFresh = async (): Promise<ProjectIssuesResult> => {
  if (env.e2eTestMode) {
    return e2eProjectIssues();
  }

  const project = await fetchAllProjectItems();
  const health = buildProjectHealth(project.title, project.fields);
  const issues = mapProjectIssues(project.items);

  return { health, issues };
};

export const fetchProjectIssues = async (): Promise<ProjectIssuesResult> => {
  const now = Date.now();
  if (projectIssuesCache && projectIssuesCache.expiresAt > now) {
    return projectIssuesCache.value;
  }

  projectIssuesInFlight ??= fetchProjectIssuesFresh()
    .then((value) => {
      projectIssuesCache = {
        expiresAt: Date.now() + PROJECT_ISSUES_CACHE_TTL_MS,
        value,
      };
      lastFetchSucceededAt = new Date();
      lastFetchError = null;
      return value;
    })
    .catch((error: unknown) => {
      lastFetchFailedAt = new Date();
      lastFetchError =
        error instanceof Error ? error.message : "Project fetch failed";
      throw error;
    })
    .finally(() => {
      projectIssuesInFlight = null;
    });

  return projectIssuesInFlight;
};

export const fetchProjectIssuesForPage =
  async (): Promise<ProjectIssuesPageResult> => {
    try {
      return { ...(await fetchProjectIssues()), projectFetchError: null };
    } catch (error: unknown) {
      return {
        health: unavailableProjectHealth(),
        issues: [],
        projectFetchError: projectFetchErrorMessage(error),
      };
    }
  };

export { buildProjectHealth, mapProjectIssues };
