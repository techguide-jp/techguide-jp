import { expect, it } from "vitest";
import {
  byUpdatedAtDescending,
  splitWorkIssues,
} from "../src/lib/workListDisplay";

it("更新日時の降順で、日時不明を末尾に置き元の配列は変更しない", () => {
  const items = [
    { id: "old", updatedAt: new Date("2026-08-01") },
    { id: "unknown" },
    { id: "new", updatedAt: "2026-09-01" },
  ];
  expect([...items].sort(byUpdatedAtDescending).map((item) => item.id)).toEqual(
    ["new", "old", "unknown"],
  );
  expect(items[0].id).toBe("old");
});

it("未完了Issueを残し、完了済みは最新1件だけを通常表示する", () => {
  const issues = [
    { id: 1, state: "CLOSED", status: "Done", updatedAt: "2026-09-01" },
    { id: 2, state: "OPEN", status: "Done", updatedAt: "2026-09-02" },
    { id: 3, state: "CLOSED", status: "Done", updatedAt: "2026-09-03" },
    { id: 4, state: "CLOSED", status: "Todo", updatedAt: "2026-09-04" },
  ];
  const result = splitWorkIssues(issues);
  expect(result.visible.map((issue) => issue.id)).toEqual([4, 3, 2]);
  expect(result.olderCompleted.map((issue) => issue.id)).toEqual([1]);
});
