import { env } from "$lib/server/env";
import { graphQL } from "$lib/server/github/githubGraphqlClient";
import type { WorkIssueRef } from "$lib/workIssueRoute";

export type IssueDescription = { body: string; labels: string[] };

export const fetchIssueDescription = async (
  ref: WorkIssueRef,
): Promise<IssueDescription> => {
  if (env.e2eTestMode)
    return {
      body: "## 目的\n申込フォームの必須項目をわかりやすくし、入力漏れを減らします。\n\n## お願いする範囲\n- 必須項目の表示とエラーメッセージの調整\n- 入力内容を保ったまま再送信できることの確認\n\n## 完了条件\n- 入力漏れのある項目に案内が表示される\n- PC・スマートフォンで操作できる\n- 変更内容をPRで提出し、確認を受ける\n\n## 期限\n着手前にチャットで相談してください。\n\n## 参考資料\n[セットアップ・開発ルール](https://github.com/techguide-jp/akademy_fes#readme)",
      labels: ["画面改善", "作業依頼"],
    };
  const [owner, name] = ref.repository.split("/");
  const result = await graphQL<{
    data?: {
      repository: {
        issue: { body: string; labels: { nodes: { name: string }[] } } | null;
      } | null;
    };
  }>(
    `query IssueDescription($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) { body labels(first: 50) { nodes { name } } }
    }
  }`,
    { owner, name, number: ref.issueNumber },
  );
  const issue = result.data?.repository?.issue;
  if (!issue) throw new Error("Issue本文を取得できませんでした。");
  return {
    body: issue.body,
    labels: issue.labels.nodes.map((label) => label.name),
  };
};
