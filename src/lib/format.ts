export const formatYen = (amount: number): string => {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDateTime = (date: Date | string | null): string => {
  if (!date) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof date === "string" ? new Date(date) : date);
};

export const formatProjectName = (repository: string): string => {
  const parts = repository.split("/");
  return parts[parts.length - 1] || repository;
};

export const formatIssueName = (
  issueNumber: number,
  issueTitle: string,
): string => {
  return `#${issueNumber} ${issueTitle}`;
};
