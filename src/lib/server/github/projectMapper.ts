import {
  requiredProjectFields,
  type ProjectFieldHealth,
  type ProjectIssue,
  type RewardMode,
} from "$lib/server/github/projectTypes";
import type {
  GraphQLFieldNode,
  GraphQLFieldValue,
  GraphQLProjectItem,
} from "$lib/server/github/projectGraphqlTypes";

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

export const buildProjectHealth = (
  title: string,
  fields: Pick<GraphQLFieldNode, "name" | "dataType">[],
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
