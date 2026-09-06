import { db } from "$lib/server/db/client";
import { issueHourlyRates } from "$lib/server/db/schema";

export const listFrozenHourlyRates = async (): Promise<
  Map<string, number | null>
> => {
  const rows = await db.select().from(issueHourlyRates);
  return new Map(
    rows.map((row) => [
      `${row.repository}#${row.issueNumber}#${row.assigneeLogin}`,
      row.hourlyRateYen,
    ]),
  );
};
