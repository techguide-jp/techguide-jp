<script lang="ts">
  import MonthlySubmissionModal from "$lib/components/MonthlySubmissionModal.svelte";
  import {
    feedbackQuestions,
    type MonthlyFeedbackInput,
    type MonthlyFeedbackView,
  } from "$lib/monthlyFeedback";
  import { formatDateTime } from "$lib/format";
  import { formatMonthLabel } from "$lib/month";
  let {
    month,
    assignee,
    initiallyOpen,
    feedback,
    canEdit,
    result,
  }: {
    month: string;
    assignee: string;
    initiallyOpen: boolean;
    feedback: MonthlyFeedbackView | null;
    canEdit: boolean;
    result?: {
      scope?: string;
      message?: string;
      feedbackInput?: MonthlyFeedbackInput;
    } | null;
  } = $props();
  const actionResult = $derived(result?.scope === "feedback" ? result : null);
  const input = $derived(
    actionResult?.feedbackInput ?? {
      operatorComment: feedback?.operatorComment ?? "",
      privateReflection: feedback?.privateReflection ?? "",
      version: feedback?.version ?? 0,
    },
  );
</script>

<section class="panel" aria-labelledby="feedback-heading">
  <h2 id="feedback-heading">{formatMonthLabel(month)}のコメント・振り返り</h2>
  {#if actionResult?.message && !actionResult.feedbackInput}<p
      class="notice"
      role="status"
    >
      {actionResult.message}
    </p>{/if}
  {#if canEdit}
    <p class="muted">
      月次承認前まで修正できます。コメントの保存で稼働・報酬は変更されません。
    </p>
    <MonthlySubmissionModal
      {month}
      {assignee}
      {input}
      {result}
      {initiallyOpen}
      mode="feedback"
    />
  {/if}
  <dl>
    <dt>{feedbackQuestions.operatorComment}</dt>
    <dd>{feedback?.operatorComment || "記載なし"}</dd>
    {#if feedback?.privateReflection !== undefined}
      <dt>{feedbackQuestions.privateReflection}（本人のみ）</dt>
      <dd>{feedback.privateReflection || "記載なし"}</dd>
    {/if}
  </dl>
  {#if feedback?.updatedAt}<p class="muted">
      更新 {formatDateTime(feedback.updatedAt)}
    </p>{/if}
</section>

<style>
  dd {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0.4rem 0 1rem;
  }
</style>
