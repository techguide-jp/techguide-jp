<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import WorkerPreferencesPanel from "$lib/components/WorkerPreferencesPanel.svelte";
  import MonthlyFeedbackPanel from "$lib/components/MonthlyFeedbackPanel.svelte";
  import MonthlyFeedbackFields from "$lib/components/MonthlyFeedbackFields.svelte";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import SettlementPaymentPanel from "$lib/components/SettlementPaymentPanel.svelte";
  import SettlementWorkLogTable from "$lib/components/SettlementWorkLogTable.svelte";
  import UnsettledSettlementPanel from "$lib/components/UnsettledSettlementPanel.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
    formatYen,
  } from "$lib/format";
  import { workerPayoutAccountHref } from "$lib/workerProfileRoute";
  import {
    settlementAmountLabel,
    settlementSourceLabel,
  } from "$lib/settlementDisplay";
  import { addMonths, currentJstMonth, formatMonthLabel } from "$lib/month";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);

  const snapshotTaxExcludedYen = (snapshot: unknown): number | null => {
    if (!snapshot || typeof snapshot !== "object") return null;
    const value = snapshot as {
      taxExcludedYen?: unknown;
      totals?: { taxExcludedYen?: unknown };
    };
    if (typeof value.totals?.taxExcludedYen === "number")
      return value.totals.taxExcludedYen;
    if (typeof value.taxExcludedYen === "number") return value.taxExcludedYen;
    return null;
  };

  const enhanceAction =
    (name: string): SubmitFunction =>
    ({ submitter }) => {
      pendingAction =
        submitter?.getAttribute("formaction") === "?/saveFeedback"
          ? "save-feedback"
          : name;
      return async ({ update }) => {
        try {
          await update({ reset: false });
        } finally {
          pendingAction = null;
        }
      };
    };

  const summary = $derived(data.summary);
  const approvedTaxExcludedYen = $derived(
    snapshotTaxExcludedYen(data.snapshot?.snapshot),
  );
  const formResult = $derived(
    form as (ActionData & { scope?: string }) | undefined,
  );
  const paymentMessage = $derived(
    formResult?.scope === "payment" ? formResult.message : undefined,
  );
  const paymentInput = $derived(
    formResult?.scope === "payment" && "paymentInput" in formResult
      ? formResult.paymentInput
      : undefined,
  );
  const feedbackInput = $derived(
    (formResult?.scope === "submission" || formResult?.scope === "feedback") &&
      "feedbackInput" in formResult &&
      formResult.feedbackInput
      ? formResult.feedbackInput
      : {
          operatorComment: data.feedback?.operatorComment ?? "",
          privateReflection: data.feedback?.privateReflection ?? "",
          version: data.feedback?.version ?? 0,
        },
  );
  const submission = $derived(data.submission);
  const canSubmitWork = $derived(data.user?.login === data.assignee);
  const resubmissionFormVisible = $derived(
    canSubmitWork &&
      Boolean(summary?.approvalRequired) &&
      Boolean(submission?.hasChanges) &&
      !data.projectFetchError &&
      !data.snapshot,
  );
  const actionMessage = $derived(
    formResult?.scope === "submission" ||
      (resubmissionFormVisible && formResult?.scope === "feedback")
      ? formResult.message
      : undefined,
  );
  const diff = $derived(
    data.projectFetchError || approvedTaxExcludedYen === null || !summary
      ? null
      : summary.taxExcludedYen - approvedTaxExcludedYen,
  );
  const currentMonth = $derived(currentJstMonth());
  const previousMonth = $derived(addMonths(data.month, -1));
  const nextMonth = $derived(addMonths(data.month, 1));
  const canGoNext = $derived(data.month < currentMonth);
</script>

<section class="page-heading">
  <div>
    <p class="eyebrow">settlement detail</p>
    <h1>{data.assignee} / {formatMonthLabel(data.month)}</h1>
  </div>
  <nav class="month-nav" aria-label="月移動">
    <a href={`/settlements/${previousMonth}/${data.assignee}`}>前月</a>
    <a href={`/settlements/${currentMonth}/${data.assignee}`}>今月</a>
    {#if canGoNext}
      <a href={`/settlements/${nextMonth}/${data.assignee}`}>翌月</a>
    {:else}
      <span>翌月</span>
    {/if}
  </nav>
</section>

{#if !data.payoutAccountStatus.registered}
  <section class="panel alert">
    <h2>振込先情報が未登録です</h2>
    <p>
      支払い前に振込先の登録が必要です。<a
        href={workerPayoutAccountHref(data.assignee)}>振込先情報</a
      >から登録してください。
    </p>
  </section>
{/if}

<section class="panel">
  <h2>振込先</h2>
  <dl class="profile-details profile-details-clean">
    <div>
      <dt>状態</dt>
      <dd>
        {#if data.payoutAccountStatus.registered}
          <span class="ok">登録済み</span>
        {:else}
          <span class="bad">未登録</span>
        {/if}
      </dd>
    </div>
    <div>
      <dt>最終更新</dt>
      <dd>
        {#if data.payoutAccountStatus.updatedAt}
          {formatDateTime(data.payoutAccountStatus.updatedAt)}
        {:else}
          -
        {/if}
      </dd>
    </div>
    <div>
      <dt>確認</dt>
      <dd>
        <a href={workerPayoutAccountHref(data.assignee)}>振込先を確認・登録</a>
      </dd>
    </div>
  </dl>
</section>

{#if data.payment && data.snapshot}
  <SettlementPaymentPanel
    {paymentInput}
    payment={data.payment}
    paymentEditable={data.paymentEditable}
    isAdmin={Boolean(data.user?.isAdmin)}
    message={paymentMessage}
    {pendingAction}
    {enhanceAction}
  />
{/if}

{#if data.snapshot}
  <section class="panel">
    <h2>支払い通知書</h2>
    <p>
      承認済みの月次精算内容を確認できます。表示後に印刷やPDF保存もできます。
    </p>
    <p>
      <a
        class="button primary"
        href={`/settlements/${data.month}/${data.assignee}/notice`}
      >
        支払い通知書を確認する
      </a>
    </p>
  </section>
{/if}

<WorkerPreferencesPanel
  preferences={data.preferences}
  canEdit={canSubmitWork}
  result={form}
/>
{#if (submission || data.feedback) && !resubmissionFormVisible}
  {#key `${data.month}:${data.assignee}`}
    <MonthlyFeedbackPanel
      month={data.month}
      feedback={data.feedback}
      canEdit={canSubmitWork && Boolean(submission) && !data.snapshot}
      result={form}
    />
  {/key}
{/if}

{#if !summary}
  {#if data.projectFetchError}
    <section class="panel alert">
      <h2>GitHub Projectを取得できません</h2>
      <p>{data.projectFetchError}</p>
      <p class="muted">
        Issue由来の報酬情報が取得できないため、月次確定申請はできません。
      </p>
    </section>
  {/if}
  <section class="panel">
    {data.projectFetchError
      ? "金額を確認できません。GitHubの取得が復旧してから再読み込みしてください。"
      : "対象データがありません。"}
  </section>
{:else}
  {#if actionMessage}
    <p class="notice" role="status">{actionMessage}</p>
  {/if}

  {#if data.projectFetchError}
    <section class="panel alert">
      <h2>GitHub Projectを取得できません</h2>
      <p>{data.projectFetchError}</p>
      <p class="muted">
        Issue由来の報酬情報が取得できないため、月次確定申請はできません。
      </p>
    </section>
  {/if}

  <section class="summary-grid">
    <div>
      <span>固定報酬</span>
      <strong>{settlementAmountLabel(summary, "fixedRewardYen")}</strong>
    </div>
    <div>
      <span>時間精算</span>
      <strong>{settlementAmountLabel(summary, "timedRewardYen")}</strong>
    </div>
    <div>
      <span>税込合計</span>
      <strong>{settlementAmountLabel(summary, "taxIncludedYen")}</strong>
    </div>
    <div>
      <span>確定差分</span>
      <strong>{diff === null ? "-" : formatYen(diff)}</strong>
    </div>
  </section>

  {#if settlementSourceLabel(summary)}
    <p class="notice" role="status">{settlementSourceLabel(summary)}</p>
  {/if}

  {#if data.settlementRuleV2Enabled}
    <section class="panel">
      <h2>成果の帰属月と支払い区分</h2>
      <p class="muted">
        固定報酬は有効な完了報告の月、報告なしで完了確認したIssueは管理者の指定月に計上します。時間報酬は実際の稼働月に計上します。
      </p>
      {#if summary.completionReports?.length}
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>報告・登録日時</th>
              <th>成果の帰属月</th>
              <th>固定報酬</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {#each summary.completionReports as report (report.id)}
              <tr>
                <td>
                  <a href={report.issueUrl} target="_blank" rel="noreferrer">
                    {formatIssueName(report.issueNumber, report.issueTitle)}
                  </a>
                </td>
                <td>
                  {formatDateTime(report.reportedAt)}
                  {#if report.source === "admin_confirmation"}
                    <small class="block text-slate-600"
                      >管理者が精算月を指定</small
                    >
                  {/if}
                </td>
                <td>{formatMonthLabel(report.settlementMonth)}</td>
                <td>{formatYen(report.fixedRewardYen)}</td>
                <td>
                  {report.eligibilityConfirmedAt
                    ? "Issue完了確認済み"
                    : "Issue完了待ち"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="muted">この月に帰属する完了報告はありません。</p>
      {/if}
    </section>

    <section class="panel">
      <h2>追加支払い</h2>
      {#if data.supplementalPayments.length === 0}
        <p class="muted">この月に帰属する追加支払いはありません。</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>税込</th>
              <th>支払い予定日</th>
              <th>支払日</th>
              <th>状態</th>
              <th>通知書</th>
            </tr>
          </thead>
          <tbody>
            {#each data.supplementalPayments as entry (entry.payment.id)}
              <tr>
                <td>
                  <a
                    href={entry.report.issueUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatIssueName(
                      entry.report.issueNumber,
                      entry.report.issueTitle,
                    )}
                  </a>
                </td>
                <td>{formatYen(entry.payment.taxIncludedYen)}</td>
                <td>{entry.payment.scheduledDate ?? "未設定"}</td>
                <td>{entry.payment.paidOn ?? "-"}</td>
                <td
                  >{entry.payment.status === "paid"
                    ? "支払い済み"
                    : "未払い"}</td
                >
                <td>
                  {#if entry.payment.scheduledDate}
                    <a
                      href={`/settlements/${data.month}/${data.assignee}/notice?supplemental=${entry.payment.id}`}
                    >
                      追加支払い通知書
                    </a>
                  {:else}
                    <span class="bad">支払予定日未設定</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

  <section class="panel">
    <h2>月次確定申請</h2>
    {#if data.projectFetchError}
      <p class="muted">
        {submission
          ? "申請済みです。最新の変更有無は確認できません。"
          : "GitHubの取得が復旧するまで申請できません。"}
      </p>
    {:else if !summary.approvalRequired}
      <p class="muted">この月は精算対象がないため、月次確定申請は不要です。</p>
    {:else}
      <div class="submission-status">
        {#if submission}
          <div>
            <span>申請状態</span>
            {#if submission.hasChanges}
              <strong class="bad">申請後変更あり</strong>
            {:else}
              <strong class="ok">申請済み</strong>
            {/if}
          </div>
          <div>
            <span>申請日時</span>
            <strong>{formatDateTime(submission.submittedAt)}</strong>
          </div>
        {:else}
          <div>
            <span>申請状態</span>
            <strong class="bad">未申請</strong>
          </div>
        {/if}
      </div>

      {#if data.submissionBlockingReasons.length}
        <div class="inline-alert">
          <strong>申請前に確認が必要です</strong>
          <ul>
            {#each data.submissionBlockingReasons as reason (reason)}
              <li>{reason}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if !canSubmitWork}
        <p class="muted">月次確定申請はassignee本人だけが実行できます。</p>
      {:else if submission && !submission.hasChanges}
        <p class="ok">
          この月の稼働は確定申請済みです。申請後に内容が変わった場合は再申請が必要です。
        </p>
      {:else}
        <form
          method="POST"
          action="?/submitWork"
          use:enhance={enhanceAction("submit-work")}
        >
          {#if !data.snapshot}
            {#key `${data.month}:${data.assignee}`}
              <MonthlyFeedbackFields input={feedbackInput} />
            {/key}
          {/if}
          <ActionSubmit
            actionName="submit-work"
            {pendingAction}
            label={submission
              ? "変更内容で再申請"
              : "この月の稼働を確定して申請"}
            pendingLabel={submission ? "再申請中..." : "申請中..."}
            disabled={data.submissionBlockingReasons.length > 0}
          />
          {#if submission && !data.snapshot}
            <button
              class="button secondary"
              type="submit"
              formaction="?/saveFeedback"
              disabled={pendingAction !== null}
              aria-busy={pendingAction === "save-feedback"}
            >
              {pendingAction === "save-feedback"
                ? "保存中..."
                : "コメントを保存"}
            </button>
          {/if}
        </form>
      {/if}
    {/if}
  </section>

  {#if summary.blockingReasons.length}
    <section class="panel alert">
      <h2>要確認</h2>
      <ul>
        {#each summary.blockingReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="panel">
    <h2>明細</h2>
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Issue</th>
          <th>報酬方式</th>
          <th>固定</th>
          <th>稼働分</th>
          <th>時間精算</th>
          <th>小計</th>
        </tr>
      </thead>
      <tbody>
        {#each summary.lines as line (`${line.issue.repository}#${line.issue.number}`)}
          <tr>
            <td>{formatProjectName(line.issue.repository)}</td>
            <td>
              <a href={line.issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(line.issue.number, line.issue.title)}
              </a>
            </td>
            <td>{line.issue.rewardMode ?? "-"}</td>
            <td>{formatYen(line.fixedRewardYen)}</td>
            <td>{line.workMinutes}分</td>
            <td>{formatYen(line.timedRewardYen)}</td>
            <td>{formatYen(line.taxExcludedYen)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <SettlementWorkLogTable {summary} />

  <UnsettledSettlementPanel {summary} />
{/if}
