<script lang="ts">
  import { enhance } from "$app/forms";
  import { isIssueCompleted } from "$lib/issueCompletion";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import StatusSyncPanel from "$lib/components/StatusSyncPanel.svelte";
  import WorkChangeDialog, {
    type WorkChangeDialogState,
  } from "$lib/components/WorkChangeDialog.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";

  type Issue = PageProps["data"]["issues"][number];
  type WorkSession = PageProps["data"]["sessions"][number];

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  let changeDialog = $state<WorkChangeDialogState | null>(null);

  const openKeySet = $derived(
    new Set(
      data.openSessions.map(
        (session) => `${session.repository}#${session.issueNumber}`,
      ),
    ),
  );
  const activeCompletionByIssue = $derived(
    new Map(
      data.completionReports
        .filter((report) => !report.invalidatedAt)
        .map((report) => [
          `${report.repository}#${report.issueNumber}`,
          report,
        ]),
    ),
  );

  const enhanceAction =
    (name: string, closeDialogOnSuccess = false): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ result, update }) => {
        await update();
        pendingAction = null;
        if (closeDialogOnSuccess && result.type === "success") {
          changeDialog = null;
        }
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);

  const issueKey = (issue: Issue): string =>
    `${issue.repository}#${issue.number}`;
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
  const issueLabel = (issue: Issue): string =>
    `${formatProjectName(issue.repository)} / ${formatIssueName(issue.number, issue.title)}`;
  const sessionIssueKey = (session: WorkSession): string =>
    `${session.repository}#${session.issueNumber}`;
  const sessionIssueLabel = (session: WorkSession): string =>
    `${formatProjectName(session.repository)} / ${formatIssueName(session.issueNumber, session.issueTitle)}`;
  const toDatetimeLocal = (date: Date | string | null): string => {
    if (!date) return "";
    const value = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(value.getTime())) return "";
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(value)
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };

  const openAddDialog = (issue: Issue) => {
    changeDialog = {
      requestType: "add",
      issueKey: issueKey(issue),
      issueLabel: issueLabel(issue),
      startedAt: "",
      endedAt: "",
    };
  };

  const openEditDialog = (session: WorkSession) => {
    changeDialog = {
      requestType: "edit",
      issueKey: sessionIssueKey(session),
      issueLabel: sessionIssueLabel(session),
      targetSessionId: session.id,
      startedAt: toDatetimeLocal(session.startedAt),
      endedAt: toDatetimeLocal(session.endedAt),
    };
  };

  const openExcludeDialog = (session: WorkSession) => {
    changeDialog = {
      requestType: "exclude",
      issueKey: sessionIssueKey(session),
      issueLabel: sessionIssueLabel(session),
      targetSessionId: session.id,
    };
  };
</script>

<section class="page-heading">
  <div>
    <p class="eyebrow">work log</p>
    <h1>稼働</h1>
  </div>
  {#if actionMessage}
    <p class="notice">{actionMessage}</p>
  {/if}
</section>

{#if data.projectFetchError}
  <section class="panel alert">
    <h2>GitHub Projectを取得できません</h2>
    <p>{data.projectFetchError}</p>
  </section>
{:else if data.health.missingFields.length || data.health.invalidFields.length}
  <section class="alert">
    Projectフィールドに不足があります。管理者に確認してください。
  </section>
{/if}

{#if data.statusSyncs.length}
  <StatusSyncPanel
    statusSyncs={data.statusSyncs}
    {pendingAction}
    {enhanceAction}
    alert
  />
{/if}

<section class="panel">
  <h2>稼働中</h2>
  {#if data.openSessions.length === 0}
    <p class="muted">稼働中のIssueはありません。</p>
  {:else}
    <div class="session-list">
      {#each data.openSessions as session (session.id)}
        <form
          method="POST"
          action="?/stop"
          use:enhance={enhanceAction(`stop-${session.id}`)}
          class="session-row"
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <div class="session-issue">
            <span>
              <small>Project</small>
              <strong>{formatProjectName(session.repository)}</strong>
            </span>
            <span>
              <small>Issue</small>
              <a
                href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                {formatIssueName(session.issueNumber, session.issueTitle)}
              </a>
            </span>
            <small>開始 {formatDateTime(session.startedAt)}</small>
          </div>
          <ActionSubmit
            actionName={`stop-${session.id}`}
            {pendingAction}
            label="終了"
            pendingLabel="終了中..."
            variant="danger"
          />
        </form>
      {/each}
    </div>
  {/if}
</section>

<section class="panel">
  <h2>Project内Issue</h2>
  {#if data.projectFetchError}
    <p class="muted">Issue一覧を表示できません。</p>
  {:else}
    <p class="muted reward-guide">
      現在のProject設定を表示しています。金額はすべて税抜です。追加精算上限は、同じIssueの全期間・全作業者の時間報酬の累計上限です（固定報酬は含みません）。
      未設定の項目は着手前に運営へ確認し、月次の精算額は「自分の精算」で確認してください。
    </p>
    {#if data.settlementRuleV2Enabled}
      <p class="muted">
        IssueがClosedかつStatusがDoneなら完了報告は不要です。未報告の固定報酬は、管理者が精算月を指定します。
      </p>
    {/if}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Issue</th>
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
          {#each data.issues as issue (`${issue.repository}#${issue.number}`)}
            {@const key = `${issue.repository}#${issue.number}`}
            {@const canStart = canStartIssue(issue)}
            <tr>
              <td>{formatProjectName(issue.repository)}</td>
              <td>
                <a href={issue.url} target="_blank" rel="noreferrer">
                  {formatIssueName(issue.number, issue.title)}
                </a>
              </td>
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
                  {#if data.settlementRuleV2Enabled && !isIssueCompleted(issue)}
                    {@const completion = activeCompletionByIssue.get(key)}
                    {#if completion && !completion.eligibilityConfirmedAt}
                      <form
                        method="POST"
                        action="?/withdrawCompletion"
                        use:enhance={enhanceAction(
                          `withdraw-completion-${key}`,
                        )}
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
  {/if}
</section>

<section class="panel">
  <h2>稼働ログ</h2>
  {#if data.sessions.length === 0}
    <p class="muted">修正・除外できる稼働ログはありません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Issue</th>
            <th>開始</th>
            <th>終了</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {#each data.sessions as session (session.id)}
            {@const isMeasuring = !session.endedAt}
            <tr>
              <td>{formatProjectName(session.repository)}</td>
              <td>
                <a
                  href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {formatIssueName(session.issueNumber, session.issueTitle)}
                </a>
              </td>
              <td>{formatDateTime(session.startedAt)}</td>
              <td>{isMeasuring ? "計測中" : formatDateTime(session.endedAt)}</td
              >
              <td>
                {#if isMeasuring}
                  <span class="muted">終了後に申請可</span>
                {:else}
                  <div class="row-actions compact">
                    <button
                      class="button secondary"
                      type="button"
                      disabled={Boolean(data.projectFetchError)}
                      onclick={() => openEditDialog(session)}
                    >
                      修正
                    </button>
                    <button
                      class="button danger ghost"
                      type="button"
                      disabled={Boolean(data.projectFetchError)}
                      onclick={() => openExcludeDialog(session)}
                    >
                      除外
                    </button>
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

{#if changeDialog}
  <WorkChangeDialog
    dialog={changeDialog}
    {pendingAction}
    {enhanceAction}
    close={() => (changeDialog = null)}
  />
{/if}

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
</style>
