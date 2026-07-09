<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
    formatYen,
  } from "$lib/format";
  import type {
    SettlementSummary,
    UnsettledProjectIssueReason,
  } from "$lib/server/settlements/settlementTypes";
  import type { MonthlyPaymentView } from "$lib/server/payments/paymentTypes";

  type SnapshotMeta = {
    approvedBy: string;
    approvedAt: Date | string;
    hasChanges: boolean;
  };

  type SubmissionMeta = {
    submittedBy: string;
    submittedAt: Date | string;
    hasChanges: boolean;
    blockingReasons: string[];
  };

  type Props = {
    month: string;
    summary: SettlementSummary;
    snapshot: SnapshotMeta | undefined;
    submission: SubmissionMeta | undefined;
    payment: MonthlyPaymentView | undefined;
    forceClosed: boolean;
    pendingAction: string | null;
    enhanceAction: (
      name: string,
      clearHashOnSuccess?: boolean,
    ) => SubmitFunction;
    formatProjectStatus: (status: string | null) => string;
    formatUnsettledReason: (reason: UnsettledProjectIssueReason) => string;
  };

  let {
    month,
    summary,
    snapshot,
    submission,
    payment,
    forceClosed,
    pendingAction,
    enhanceAction,
    formatProjectStatus,
    formatUnsettledReason,
  }: Props = $props();

  const scheduledDateValue = $derived(
    payment?.customScheduledDate ?? payment?.scheduledDate ?? "",
  );
</script>

<div
  id={`approve-${summary.assigneeLogin}`}
  class={`modal-backdrop modal-backdrop-hash${forceClosed ? " modal-backdrop-closed" : ""}`}
  role="dialog"
  aria-modal="true"
  aria-labelledby={`approval-dialog-${summary.assigneeLogin}`}
>
  <a class="modal-scrim" href="#settlement-top" aria-label="閉じる"></a>
  <div class="modal">
    <header class="modal-header">
      <div>
        <p class="eyebrow">monthly approval</p>
        <h2 id={`approval-dialog-${summary.assigneeLogin}`}>
          {summary.assigneeLogin} の月次{snapshot ? "再承認" : "承認"}
        </h2>
        {#if snapshot}
          <p class="approval-record">
            前回承認: {formatDateTime(snapshot.approvedAt)} / {snapshot.approvedBy}
            {#if snapshot.hasChanges}
              <span>現在の承認内容に変更があります</span>
            {/if}
          </p>
        {/if}
        {#if submission}
          <p class="approval-record">
            稼働者申請: {formatDateTime(submission.submittedAt)} / {submission.submittedBy}
            {#if submission.hasChanges}
              <span>申請後に承認内容が変更されています</span>
            {/if}
          </p>
        {/if}
      </div>
      <a class="icon-button" href="#settlement-top" aria-label="閉じる"> × </a>
    </header>

    <div class="approval-summary" aria-label="承認金額">
      <div>
        <span>固定</span>
        <strong>{formatYen(summary.fixedRewardYen)}</strong>
      </div>
      <div>
        <span>時間</span>
        <strong>{formatYen(summary.timedRewardYen)}</strong>
      </div>
      <div>
        <span>税抜</span>
        <strong>{formatYen(summary.taxExcludedYen)}</strong>
      </div>
      <div>
        <span>税込</span>
        <strong>{formatYen(summary.taxIncludedYen)}</strong>
      </div>
    </div>

    {#if summary.blockingReasons.length}
      <div class="modal-alert">
        <strong>承認不可</strong>
        <ul>
          {#each summary.blockingReasons as reason (reason)}
            <li>{reason}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if !submission || submission.hasChanges || submission.blockingReasons.length}
      <div class="modal-alert">
        <strong>稼働者申請の確認が必要です</strong>
        <ul>
          {#if !submission}
            <li>稼働者の月次確定申請がありません。</li>
          {:else if submission.hasChanges}
            <li>稼働者の月次確定申請後に内容が変更されています。</li>
          {/if}
          {#each submission?.blockingReasons ?? [] as reason (reason)}
            <li>{reason}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="modal-section">
      <div class="section-heading">
        <h3>精算対象明細</h3>
        <a href={`/settlements/${month}/${summary.assigneeLogin}`}
          >個人明細を開く</a
        >
      </div>
      <div class="detail-list">
        {#each summary.lines as line (`${line.issue.repository}#${line.issue.number}`)}
          <article class="detail-item">
            <div class="issue-heading">
              <span class="project-name"
                >{formatProjectName(line.issue.repository)}</span
              >
              <a href={line.issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(line.issue.number, line.issue.title)}
              </a>
            </div>
            <dl>
              <div>
                <dt>報酬</dt>
                <dd>{line.issue.rewardMode ?? "-"}</dd>
              </div>
              <div>
                <dt>固定</dt>
                <dd>{formatYen(line.fixedRewardYen)}</dd>
              </div>
              <div>
                <dt>稼働</dt>
                <dd>{line.workMinutes}分</dd>
              </div>
              <div>
                <dt>時間</dt>
                <dd>{formatYen(line.timedRewardYen)}</dd>
              </div>
              <div>
                <dt>小計</dt>
                <dd>{formatYen(line.taxExcludedYen)}</dd>
              </div>
            </dl>
          </article>
        {/each}
      </div>
    </div>

    <div class="modal-section">
      <h3>未精算予定</h3>
      {#if summary.unsettledProjectIssues.length === 0 && summary.unsettledIssueSessions.length === 0}
        <p class="muted">未精算予定のProject Issueや稼働ログはありません。</p>
      {:else}
        <ul class="planned-list">
          {#each summary.unsettledProjectIssues as line (`${line.issue.repository}#${line.issue.number}`)}
            <li>
              <div>
                <span class="project-name"
                  >{formatProjectName(line.issue.repository)}</span
                >
                <a href={line.issue.url} target="_blank" rel="noreferrer">
                  <strong
                    >{formatIssueName(
                      line.issue.number,
                      line.issue.title,
                    )}</strong
                  >
                </a>
              </div>
              <div class="planned-meta">
                <span>状態: {formatProjectStatus(line.issue.status)}</span>
                <span>理由: {formatUnsettledReason(line.reason)}</span>
                <span>ログ: {line.sessions.length}件</span>
                <span>稼働: {line.workMinutes}分</span>
              </div>
            </li>
          {/each}
          {#each summary.unsettledIssueSessions as session (session.id)}
            <li>
              <div>
                <span class="project-name"
                  >{formatProjectName(session.repository)}</span
                >
                <a
                  href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong
                    >{formatIssueName(
                      session.issueNumber,
                      session.issueTitle,
                    )}</strong
                  >
                </a>
              </div>
              <div class="planned-meta">
                <span>Project外/未検出ログ</span>
                <span
                  >{formatDateTime(session.startedAt)} - {formatDateTime(
                    session.endedAt,
                  )}</span
                >
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <footer class="modal-actions">
      <a class="button secondary" href="#settlement-top"> キャンセル </a>
      <form
        method="POST"
        action="?/approve"
        use:enhance={enhanceAction(`approve-${summary.assigneeLogin}`, true)}
        class="approval-action-form"
      >
        <input
          type="hidden"
          name="assigneeLogin"
          value={summary.assigneeLogin}
        />
        <label class="approval-date-field">
          支払い予定日
          <input
            type="date"
            name="scheduledDate"
            value={scheduledDateValue}
            required
          />
        </label>
        <ActionSubmit
          actionName={`approve-${summary.assigneeLogin}`}
          {pendingAction}
          label={snapshot ? "この内容で再承認" : "この内容で承認"}
          pendingLabel={snapshot ? "再承認中..." : "承認中..."}
          disabled={summary.blockingReasons.length > 0 ||
            !submission ||
            submission.hasChanges ||
            submission.blockingReasons.length > 0}
        />
      </form>
    </footer>
  </div>
</div>
