<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import WorkIssueList from "$lib/components/WorkIssueList.svelte";
  import WorkLogList from "$lib/components/WorkLogList.svelte";
  import SubmissionNextStep from "$lib/components/SubmissionNextStep.svelte";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import StatusSyncPanel from "$lib/components/StatusSyncPanel.svelte";
  import WorkChangeDialog, {
    type WorkChangeDialogState,
  } from "$lib/components/WorkChangeDialog.svelte";
  import {
    formatDateTime,
    formatWorkMinutes,
    requestedWorkMinutes,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";

  type Issue = PageProps["data"]["issues"][number];
  type WorkSession = PageProps["data"]["sessions"][number];

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  let changeDialog = $state<WorkChangeDialogState | null>(null);
  let changeDialogError = $state<string | null>(null);

  const openKeySet = $derived(
    new Set(
      data.openSessions.map(
        (session) => `${session.repository}#${session.issueNumber}`,
      ),
    ),
  );
  const enhanceAction =
    (name: string, closeDialogOnSuccess = false): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ result, update }) => {
        try {
          await update();
          if (closeDialogOnSuccess && result.type === "success")
            changeDialog = null;
          if (closeDialogOnSuccess && result.type === "failure") {
            changeDialogError = String(
              result.data?.message ??
                "申請できませんでした。内容を確認してください。",
            );
            // 別画面で申請された場合も、入力を保ったまま編集制限・申請履歴を最新にする。
            await invalidateAll();
          }
        } finally {
          pendingAction = null;
        }
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);

  const issueKey = (issue: Issue): string =>
    `${issue.repository}#${issue.number}`;
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
    changeDialogError = null;
    changeDialog = {
      requestType: "add",
      issueKey: issueKey(issue),
      issueLabel: issueLabel(issue),
      startedAt: "",
      endedAt: "",
    };
  };

  const openEditDialog = (session: WorkSession) => {
    changeDialogError = null;
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
    changeDialogError = null;
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

<SubmissionNextStep notice={data.submissionNotice} />

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

<WorkIssueList
  issues={data.issues}
  projectFetchError={data.projectFetchError}
  settlementRuleV2Enabled={data.settlementRuleV2Enabled}
  completionReports={data.completionReports}
  {openKeySet}
  {pendingAction}
  {enhanceAction}
  {openAddDialog}
/>

<WorkLogList
  sessions={data.sessions}
  requests={data.requests}
  locks={data.sessionLocks}
  projectFetchError={data.projectFetchError}
  {openEditDialog}
  {openExcludeDialog}
/>

<section class="panel" aria-labelledby="change-requests-heading">
  <h2 id="change-requests-heading">稼働ログの申請履歴</h2>
  <p class="muted">
    未処理の追加・修正・除外申請は取り消せます。取り消しても元の稼働ログは変わりません。
  </p>
  {#if form?.scope === "changeRequests"}<p class="notice" role="status">
      {form.message}
    </p>{/if}
  {#if data.requests.length === 0}
    <p class="muted">申請はありません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Issue</th><th>種別</th><th>希望時刻・稼働時間</th><th>理由</th
            ><th>状態</th><th>操作</th></tr
          ></thead
        >
        <tbody>
          {#each [...data.requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as request (request.id)}
            {@const minutes = requestedWorkMinutes(
              request.requestedStartedAt,
              request.requestedEndedAt,
            )}
            <tr>
              <td
                >{formatProjectName(request.repository)} / {formatIssueName(
                  request.issueNumber,
                  request.issueTitle,
                )}<small>{formatDateTime(request.createdAt)}</small></td
              >
              <td
                >{{ add: "追加", edit: "修正", exclude: "除外" }[
                  request.requestType
                ]}</td
              >
              <td
                >{#if minutes !== null}{formatDateTime(
                    request.requestedStartedAt,
                  )} ～ {formatDateTime(request.requestedEndedAt)}<strong
                    class="duration">{formatWorkMinutes(minutes)}</strong
                  >{:else}対象ログを精算から除外{/if}</td
              >
              <td>{request.reason}</td>
              <td>
                <span
                  class={`status-badge ${{ pending: "measuring", approved: "complete", rejected: "rejected", cancelled: "neutral" }[request.status]}`}
                >
                  {{
                    pending: "確認待ち",
                    approved: "承認済み",
                    rejected: "却下",
                    cancelled: "取り消し済み",
                  }[request.status]}
                </span>
              </td>
              <td
                >{#if request.status === "pending"}<form
                    method="POST"
                    action="?/cancelChange"
                    use:enhance={enhanceAction(`cancel-change-${request.id}`)}
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <ActionSubmit
                      actionName={`cancel-change-${request.id}`}
                      {pendingAction}
                      label="申請を取り消す"
                      pendingLabel="取り消し中..."
                      variant="secondary"
                    />
                  </form>{/if}</td
              >
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
    errorMessage={changeDialogError}
    {pendingAction}
    {enhanceAction}
    close={() => (changeDialog = null)}
  />
{/if}

<style>
  .duration {
    display: block;
    white-space: nowrap;
  }
</style>
