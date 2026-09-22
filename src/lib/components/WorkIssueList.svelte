<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { isIssueCompleted } from "$lib/issueCompletion";
  import { splitWorkIssues } from "$lib/workListDisplay";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";
  import type { ProjectIssue as Issue } from "$lib/server/github/projectTypes";
  import type { IssueCompletionReport } from "$lib/server/db/schema";
  let {
    issues,
    projectFetchError,
    settlementRuleV2Enabled,
    openKeySet,
    completionReports,
    pendingAction,
    enhanceAction,
    openAddDialog,
  }: {
    issues: Issue[];
    projectFetchError: string | null;
    settlementRuleV2Enabled: boolean;
    openKeySet: Set<string>;
    completionReports: IssueCompletionReport[];
    pendingAction: string | null;
    enhanceAction: (name: string) => SubmitFunction;
    openAddDialog: (issue: Issue) => void;
  } = $props();
  const grouped = $derived(splitWorkIssues(issues));
  const activeCompletionByIssue = $derived(
    new Map(
      completionReports
        .filter((report) => !report.invalidatedAt)
        .map((report) => [
          `${report.repository}#${report.issueNumber}`,
          report,
        ]),
    ),
  );
  const configuredRewardLabel = (amount: number | null): string =>
    amount === null ? "未設定" : `${amount.toLocaleString("ja-JP")}円`;
  const canStartIssue = (issue: Issue): boolean =>
    issue.state !== "CLOSED" && issue.status !== "Done";
  const issueWorkState = (issue: Issue, key: string): string => {
    if (isIssueCompleted(issue)) return "完了済み";
    if (openKeySet.has(key)) return "稼働中";
    const report = activeCompletionByIssue.get(key);
    if (report?.eligibilityConfirmedAt) return "Issue完了確認済み";
    if (report) return "完了報告済み・Issue完了待ち";
    return canStartIssue(issue) ? "待機" : "完了確認待ち";
  };
</script>

{#snippet issueTable(rows: Issue[])}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Issue</th>
          <th>更新日時</th>
          <th>Status</th>
          <th class="reward-mode">報酬方式</th>
          <th class="reward-amount">固定報酬（税抜）</th>
          <th class="reward-amount">時給（税抜）</th>
          <th class="reward-amount">追加精算上限（税抜）</th>
          <th class="work-state">状態</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as issue (`${issue.repository}#${issue.number}`)}
          {@const key = `${issue.repository}#${issue.number}`}
          {@const canStart = canStartIssue(issue)}
          <tr>
            <td>{formatProjectName(issue.repository)}</td>
            <td>
              <a href={issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(issue.number, issue.title)}
              </a>
            </td>
            <td>{formatDateTime(issue.updatedAt ?? null)}</td>
            <td>{issue.status ?? "-"}</td>
            <td class="reward-mode">{issue.rewardMode ?? "未設定"}</td>
            <td class="reward-amount">
              {configuredRewardLabel(issue.fixedRewardYen)}
            </td>
            <td class="reward-amount">
              {issue.rewardMode === "固定"
                ? "対象外"
                : configuredRewardLabel(issue.hourlyRateYen)}
            </td>
            <td class="reward-amount">
              {issue.rewardMode === "固定"
                ? "対象外"
                : configuredRewardLabel(issue.extraCapYen)}
            </td>
            <td class="work-state">{issueWorkState(issue, key)}</td>
            <td>
              <div class="row-actions">
                <form
                  method="POST"
                  action="?/start"
                  use:enhance={enhanceAction(`start-${key}`)}
                >
                  <input
                    type="hidden"
                    name="repository"
                    value={issue.repository}
                  />
                  <input
                    type="hidden"
                    name="issueNumber"
                    value={issue.number}
                  />
                  <ActionSubmit
                    actionName={`start-${key}`}
                    {pendingAction}
                    label="開始"
                    pendingLabel="開始中..."
                    disabled={openKeySet.has(key) || !canStart}
                  />
                </form>
                {#if settlementRuleV2Enabled && !isIssueCompleted(issue)}
                  {@const completion = activeCompletionByIssue.get(key)}
                  {#if completion && !completion.eligibilityConfirmedAt}
                    <form
                      method="POST"
                      action="?/withdrawCompletion"
                      use:enhance={enhanceAction(`withdraw-completion-${key}`)}
                    >
                      <input
                        type="hidden"
                        name="repository"
                        value={issue.repository}
                      />
                      <input
                        type="hidden"
                        name="issueNumber"
                        value={issue.number}
                      />
                      <ActionSubmit
                        actionName={`withdraw-completion-${key}`}
                        {pendingAction}
                        label="完了報告を取り下げ"
                        pendingLabel="取り下げ中..."
                        variant="danger"
                      />
                    </form>
                  {:else if !completion?.eligibilityConfirmedAt}
                    <form
                      method="POST"
                      action="?/reportCompletion"
                      use:enhance={enhanceAction(`report-completion-${key}`)}
                    >
                      <input
                        type="hidden"
                        name="repository"
                        value={issue.repository}
                      />
                      <input
                        type="hidden"
                        name="issueNumber"
                        value={issue.number}
                      />
                      <ActionSubmit
                        actionName={`report-completion-${key}`}
                        {pendingAction}
                        label="完了報告"
                        pendingLabel="報告中..."
                        disabled={openKeySet.has(key) ||
                          (issue.rewardMode !== "固定" &&
                            issue.rewardMode !== "ハイブリッド") ||
                          issue.fixedRewardYen === null}
                      />
                    </form>
                  {/if}
                {/if}
                <button
                  class="button secondary"
                  type="button"
                  onclick={() => openAddDialog(issue)}
                >
                  追加申請
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<section class="panel" aria-labelledby="work-issues-heading">
  <h2 id="work-issues-heading">Project内Issue</h2>
  <p class="muted">
    更新日時が新しい順です。完了済みIssueは最新1件を表示しています。
  </p>
  {#if projectFetchError}
    <p class="muted">Issue一覧を表示できません。</p>
  {:else}
    <p class="muted reward-guide">
      現在のProject設定を表示しています。金額はすべて税抜です。追加精算上限は、同じIssueの全期間・全作業者の時間報酬の累計上限です（固定報酬は含みません）。
      上限を超えた時間報酬は、上限残額までの金額で精算します。
      未設定の項目は着手前に運営へ確認し、月次の精算額は「自分の精算」で確認してください。
    </p>
    {#if settlementRuleV2Enabled}
      <p class="muted">
        IssueがClosedかつStatusがDoneなら完了報告は不要です。未報告の固定報酬は、管理者が精算月を指定します。
      </p>
    {/if}
    {@render issueTable(grouped.visible)}
    {#if grouped.olderCompleted.length}
      <details>
        <summary
          >過去の完了済みIssueを表示（{grouped.olderCompleted
            .length}件）</summary
        >
        {@render issueTable(grouped.olderCompleted)}
      </details>
    {/if}
  {/if}
</section>

<style>
  .reward-guide {
    margin-bottom: 1rem;
  }
  .reward-amount,
  .reward-mode {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .work-state {
    min-width: 4rem;
  }
  details {
    margin-top: 1rem;
  }
  summary {
    cursor: pointer;
    padding: 0.75rem 0;
    font-weight: 600;
  }
</style>
