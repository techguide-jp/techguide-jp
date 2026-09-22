import { isIssueCompleted } from "$lib/issueCompletion";

export const RECENT_WORK_LOG_COUNT = 5;

type UpdatedItem = { updatedAt?: Date | string | null };

export const byUpdatedAtDescending = (
  left: UpdatedItem,
  right: UpdatedItem,
): number => {
  const time = (value: UpdatedItem): number => {
    const timestamp = value.updatedAt
      ? new Date(value.updatedAt).getTime()
      : NaN;
    return Number.isFinite(timestamp) ? timestamp : -Infinity;
  };
  const a = time(left);
  const b = time(right);
  return a === b ? 0 : a > b ? -1 : 1;
};

export const splitWorkIssues = <
  T extends UpdatedItem & { state: string; status: string | null },
>(
  issues: T[],
): { visible: T[]; olderCompleted: T[] } => {
  const sorted = [...issues].sort(byUpdatedAtDescending);
  let foundCompleted = false;
  const visible: T[] = [];
  const olderCompleted: T[] = [];
  for (const issue of sorted) {
    if (isIssueCompleted(issue)) {
      if (foundCompleted) {
        olderCompleted.push(issue);
        continue;
      }
      foundCompleted = true;
    }
    visible.push(issue);
  }
  return { visible, olderCompleted };
};
