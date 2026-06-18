export type GraphQLFieldNode =
  | { __typename: "ProjectV2Field"; id: string; name: string; dataType: string }
  | {
      __typename: "ProjectV2SingleSelectField";
      id: string;
      name: string;
      dataType: string;
      options: Array<{ id: string; name: string }>;
    };

export type GraphQLFieldValue =
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

export type GraphQLProjectItem = {
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

export type GraphQLResponse<TData> = {
  data?: TData;
  errors?: Array<{ message: string }>;
};

export type GraphQLProjectResponse = GraphQLResponse<{
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

export type GraphQLProjectFieldsResponse = GraphQLResponse<{
  organization: {
    projectV2: {
      id: string;
      fields: { nodes: GraphQLFieldNode[] };
    } | null;
  } | null;
}>;

export type GraphQLUpdateProjectItemFieldValueResponse = GraphQLResponse<{
  updateProjectV2ItemFieldValue: {
    projectV2Item: {
      id: string;
    } | null;
  } | null;
}>;
