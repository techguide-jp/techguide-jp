export const toJstMonth = (isoDate: string | Date): string => {
  const date = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new Error("Failed to format JST month");
  }
  return `${year}-${month}`;
};

export const minutesBetween = (startedAt: Date, endedAt: Date): number => {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
};
