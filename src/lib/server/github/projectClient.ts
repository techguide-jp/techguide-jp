import { env, requireEnv } from "$lib/server/env";
import {
  PROJECT_NUMBER,
  PROJECT_OWNER,
  requiredProjectFields,
  type ProjectFieldHealth,
  type ProjectIssue,
  type RewardMode,
} from "$lib/server/github/projectTypes";

type GraphQLFieldNode =
  | { __typename: "ProjectV2Field"; id: string; name: string; dataType: string }
  | {
      __typename: "ProjectV2SingleSelectField";
      id: string;
      name: string;
      dataType: string;
      options: Array<{ id: string; name: string }>;
    };

type GraphQLFieldValue =
  | {
      __typename: "ProjectV2ItemFieldTextValue";
      text: string;
      field: { name: string };
    }
  | {
      __typename: "ProjectV2ItemFieldNumberValue";
      number: number;
      field: { name: string };
    }
  | {
      __typename: "ProjectV2ItemFieldSingleSelectValue";
      name: string;
      field: { name: string };
    }
  | { __typename: string };

type GraphQLProjectItem = {
  id: string;
  type: string;
  isArchived: boolean;
  content: {
    __typename: string;
    number?: number;
    title?: string;
    state?: "OPEN" | "CLOSED";
    url?: string;
    createdAt?: string;
    closedAt?: string | null;
    repository?: { nameWithOwner: string };
    assignees?: { nodes: Array<{ login: string }> };
  } | null;
  fieldValues: { nodes: GraphQLFieldValue[] };
};

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: Array<{ message: string }>;
};

type GraphQLProjectResponse = GraphQLResponse<{
  organization: {
    projectV2: {
      title: string;
      fields: { nodes: GraphQLFieldNode[] };
      items: {
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
        nodes: GraphQLProjectItem[];
      };
    } | null;
  } | null;
}>;

type GraphQLProjectFieldsResponse = GraphQLResponse<{
  organization: {
    projectV2: {
      id: string;
      fields: { nodes: GraphQLFieldNode[] };
    } | null;
  } | null;
}>;

type GraphQLUpdateProjectItemFieldValueResponse = GraphQLResponse<{
  updateProjectV2ItemFieldValue: {
    projectV2Item: {
      id: string;
    } | null;
  } | null;
}>;

type ProjectIssuesResult = {
  health: ProjectFieldHealth;
  issues: ProjectIssue[];
};

const PROJECT_ISSUES_CACHE_TTL_MS = 60_000;
let projectIssuesCache: {
  expiresAt: number;
  value: ProjectIssuesResult;
} | null = null;
let projectIssuesInFlight: Promise<ProjectIssuesResult> | null = null;

export const clearProjectIssuesCache = (): void => {
  projectIssuesCache = null;
  projectIssuesInFlight = null;
};

const projectQuery = `
query ProjectSettlementSource($owner: String!, $number: Int!, $after: String) {
  organization(login: $owner) {
    projectV2(number: $number) {
      title
      fields(first: 50) {
        nodes {
          __typename
          ... on ProjectV2FieldCommon {
            id
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            dataType
            options {
              id
              name
            }
          }
        }
      }
      items(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          type
          isArchived
          content {
            __typename
            ... on Issue {
              number
              title
              state
              url
              createdAt
              closedAt
              repository {
                nameWithOwner
              }
              assignees(first: 20) {
                nodes {
                  login
                }
              }
            }
          }
          fieldValues(first: 50) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldTextValue {
                text
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

const projectFieldsQuery = `
query ProjectFields($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 50) {
        nodes {
          __typename
          ... on ProjectV2FieldCommon {
            id
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            dataType
            options {
              id
              name
            }
          }
        }
      }
    }
  }
}`;

const updateProjectItemFieldValueMutation = `
mutation UpdateProjectItemStatus(
  $projectId: ID!
  $itemId: ID!
  $fieldId: ID!
  $optionId: String!
) {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $optionId }
    }
  ) {
    projectV2Item {
      id
    }
  }
}`;

const graphQL = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${requireEnv(env.githubProjectToken, "GITHUB_PROJECT_TOKEN")}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLResponse<unknown>;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload as T;
};

const fieldValueMap = (
  values: GraphQLFieldValue[],
): Map<string, GraphQLFieldValue> => {
  const map = new Map<string, GraphQLFieldValue>();
  for (const value of values) {
    if ("field" in value && value.field?.name) {
      map.set(value.field.name, value);
    }
  }
  return map;
};

const numberValue = (
  map: Map<string, GraphQLFieldValue>,
  fieldName: string,
): number | null => {
  const value = map.get(fieldName);
  return value?.__typename === "ProjectV2ItemFieldNumberValue" &&
    "number" in value
    ? value.number
    : null;
};

const selectValue = (
  map: Map<string, GraphQLFieldValue>,
  fieldName: string,
): string | null => {
  const value = map.get(fieldName);
  return value?.__typename === "ProjectV2ItemFieldSingleSelectValue" &&
    "name" in value
    ? value.name
    : null;
};

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

export const mapProjectIssues = (
  items: GraphQLProjectItem[],
): ProjectIssue[] => {
  return items
    .filter(
      (item) =>
        item.type === "ISSUE" &&
        !item.isArchived &&
        item.content?.__typename === "Issue",
    )
    .map((item): ProjectIssue => {
      const content = item.content;
      if (
        !content?.repository ||
        !content.number ||
        !content.title ||
        !content.state ||
        !content.url
      ) {
        throw new Error(
          "Project issue payload is missing required content fields",
        );
      }
      const values = fieldValueMap(item.fieldValues.nodes);
      const rewardMode = selectValue(values, requiredProjectFields.rewardMode);

      return {
        projectItemId: item.id,
        repository: content.repository.nameWithOwner,
        number: content.number,
        title: content.title,
        state: content.state,
        url: content.url,
        createdAt: content.createdAt ?? "",
        closedAt: content.closedAt ?? null,
        assignees:
          content.assignees?.nodes.map((assignee) => assignee.login) ?? [],
        status: selectValue(values, requiredProjectFields.status),
        rewardMode:
          rewardMode === "固定" || rewardMode === "ハイブリッド"
            ? (rewardMode as RewardMode)
            : null,
        fixedRewardYen: numberValue(values, requiredProjectFields.fixedReward),
        extraCapYen: numberValue(values, requiredProjectFields.extraCap),
        hourlyRateYen: numberValue(values, requiredProjectFields.hourlyRate),
      };
    });
};

const fetchProjectIssuesFresh = async (): Promise<ProjectIssuesResult> => {
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
      return value;
    })
    .finally(() => {
      projectIssuesInFlight = null;
    });

  return projectIssuesInFlight;
};

export const buildProjectHealth = (
  title: string,
  fields: Array<{ name: string; dataType: string }>,
): ProjectFieldHealth => {
  const byName = new Map(fields.map((field) => [field.name, field.dataType]));
  const expected = [
    [requiredProjectFields.status, "SINGLE_SELECT"],
    [requiredProjectFields.rewardMode, "SINGLE_SELECT"],
    [requiredProjectFields.fixedReward, "NUMBER"],
    [requiredProjectFields.extraCap, "NUMBER"],
    [requiredProjectFields.hourlyRate, "NUMBER"],
  ] as const;

  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  for (const [fieldName, dataType] of expected) {
    const actual = byName.get(fieldName);
    if (!actual) {
      missingFields.push(fieldName);
    } else if (actual !== dataType) {
      invalidFields.push(`${fieldName}: expected ${dataType}, got ${actual}`);
    }
  }

  return {
    title,
    missingFields,
    invalidFields,
    availableFields: fields.map((field) => ({
      name: field.name,
      dataType: field.dataType,
    })),
  };
};
