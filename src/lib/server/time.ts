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

export const parseJstDatetimeLocal = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute
  ) {
    return null;
  }

  return date;
};

export const jstMonthRangeUtc = (month: string): { start: Date; end: Date } => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error("Invalid month format");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, -9, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, -9, 0, 0));
  return { start, end };
};

export const minutesBetween = (startedAt: Date, endedAt: Date): number => {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
};
