import { env, requireEnv } from "$lib/server/env";
import {
  PROJECT_NUMBER,
  PROJECT_OWNER,
  requiredProjectFields,
  type ProjectFieldHealth,
  type ProjectIssue,
  type RewardMode
} from "$lib/server/github/projectTypes";

type GraphQLFieldNode =
  | { __typename: "ProjectV2Field"; name: string; dataType: string }
  | {
      __typename: "ProjectV2SingleSelectField";
      name: string;
      dataType: string;
      options: Array<{ name: string }>;
    };

type GraphQLFieldValue =
  | { __typename: "ProjectV2ItemFieldTextValue"; text: string; field: { name: string } }
  | { __typename: "ProjectV2ItemFieldNumberValue"; number: number; field: { name: string } }
  | { __typename: "ProjectV2ItemFieldSingleSelectValue"; name: string; field: { name: string } }
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

type GraphQLProjectResponse = {
  data?: {
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
  };
  errors?: Array<{ message: string }>;
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
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            name
            dataType
            options {
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

const graphQL = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${requireEnv(env.githubProjectToken, "GITHUB_PROJECT_TOKEN")}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLProjectResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload as T;
};

const fieldValueMap = (values: GraphQLFieldValue[]): Map<string, GraphQLFieldValue> => {
  const map = new Map<string, GraphQLFieldValue>();
  for (const value of values) {
    if ("field" in value && value.field?.name) {
      map.set(value.field.name, value);
    }
  }
  return map;
};

const numberValue = (map: Map<string, GraphQLFieldValue>, fieldName: string): number | null => {
  const value = map.get(fieldName);
  return value?.__typename === "ProjectV2ItemFieldNumberValue" && "number" in value
    ? value.number
    : null;
};

const selectValue = (map: Map<string, GraphQLFieldValue>, fieldName: string): string | null => {
  const value = map.get(fieldName);
  return value?.__typename === "ProjectV2ItemFieldSingleSelectValue" && "name" in value
    ? value.name
    : null;
};

const fetchProjectPage = async (after: string | null): Promise<{
  title: string;
  fields: GraphQLFieldNode[];
  items: GraphQLProjectItem[];
  hasNextPage: boolean;
  endCursor: string | null;
}> => {
  const payload = await graphQL<GraphQLProjectResponse>(projectQuery, {
    owner: PROJECT_OWNER,
    number: PROJECT_NUMBER,
    after
  });

  const project = payload.data?.organization?.projectV2;
  if (!project) {
    throw new Error(`GitHub Project ${PROJECT_OWNER}/${PROJECT_NUMBER} was not found`);
  }

  return {
    title: project.title,
    fields: project.fields.nodes,
    items: project.items.nodes,
    hasNextPage: project.items.pageInfo.hasNextPage,
    endCursor: project.items.pageInfo.endCursor
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

export const mapProjectIssues = (items: GraphQLProjectItem[]): ProjectIssue[] => {
  return items
    .filter((item) => item.type === "ISSUE" && !item.isArchived && item.content?.__typename === "Issue")
    .map((item): ProjectIssue => {
      const content = item.content;
      if (!content?.repository || !content.number || !content.title || !content.state || !content.url) {
        throw new Error("Project issue payload is missing required content fields");
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
        assignees: content.assignees?.nodes.map((assignee) => assignee.login) ?? [],
        status: selectValue(values, requiredProjectFields.status),
        rewardMode: rewardMode === "固定" || rewardMode === "ハイブリッド" ? (rewardMode as RewardMode) : null,
        fixedRewardYen: numberValue(values, requiredProjectFields.fixedReward),
        extraCapYen: numberValue(values, requiredProjectFields.extraCap),
        hourlyRateYen: numberValue(values, requiredProjectFields.hourlyRate)
      };
    });
};

export const fetchProjectIssues = async (): Promise<{
  health: ProjectFieldHealth;
  issues: ProjectIssue[];
}> => {
  const project = await fetchAllProjectItems();
  const health = buildProjectHealth(project.title, project.fields);
  const issues = mapProjectIssues(project.items);

  return { health, issues };
};

export const buildProjectHealth = (
  title: string,
  fields: Array<{ name: string; dataType: string }>
): ProjectFieldHealth => {
  const byName = new Map(fields.map((field) => [field.name, field.dataType]));
  const expected = [
    [requiredProjectFields.status, "SINGLE_SELECT"],
    [requiredProjectFields.rewardMode, "SINGLE_SELECT"],
    [requiredProjectFields.fixedReward, "NUMBER"],
    [requiredProjectFields.extraCap, "NUMBER"],
    [requiredProjectFields.hourlyRate, "NUMBER"]
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
    availableFields: fields.map((field) => ({ name: field.name, dataType: field.dataType }))
  };
};
