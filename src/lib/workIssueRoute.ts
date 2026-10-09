export type WorkIssueRef = { repository: string; issueNumber: number };

export const workIssueHref = (repository: string, number: number): string =>
  `/work/${repository.split("/").map(encodeURIComponent).join("/")}/${number}`;

export const buildIssueRequestText = (title: string, url: string): string =>
  `「${title}」の案件をお願いします。\n内容・報酬・完了条件はこちらです。\n${url}\n確認できたら返信をお願いします。難しい点があれば着手前にご相談ください。`;
