const monthPattern = /^\d{4}-\d{2}$/;

export const isMonthString = (month: string): boolean => {
  if (!monthPattern.test(month)) return false;
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber >= 1 && monthNumber <= 12;
};

export const addMonths = (month: string, offset: number): string => {
  if (!isMonthString(month)) return month;
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const date = new Date(Date.UTC(year, monthIndex + offset, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
};

export const currentJstMonth = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : now.toISOString().slice(0, 7);
};

export const formatMonthLabel = (month: string): string => {
  if (!isMonthString(month)) return month;
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
};
