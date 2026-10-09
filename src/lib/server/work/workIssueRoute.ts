import { z } from "zod";
import type { WorkIssueRef } from "$lib/workIssueRoute";

const issueRouteSchema = z.object({
  owner: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/)
    .max(100),
  repo: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .max(100),
  number: z.coerce.number().int().positive().max(2147483647),
});

export const parseWorkIssueRoute = (
  params: Record<string, string | undefined>,
): WorkIssueRef | null => {
  const parsed = issueRouteSchema.safeParse(params);
  if (!parsed.success || [".", ".."].includes(parsed.data.repo)) return null;
  return {
    repository: `${parsed.data.owner}/${parsed.data.repo}`,
    issueNumber: parsed.data.number,
  };
};
