<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import MonthlyFeedbackFields from "$lib/components/MonthlyFeedbackFields.svelte";
  import {
    feedbackQuestions,
    type MonthlyFeedbackInput,
    type MonthlyFeedbackView,
  } from "$lib/monthlyFeedback";
  import { formatDateTime } from "$lib/format";
  import { formatMonthLabel } from "$lib/month";
  let {
    month,
    feedback,
    canEdit,
    result,
  }: {
    month: string;
    feedback: MonthlyFeedbackView | null;
    canEdit: boolean;
    result?: {
      scope?: string;
      message?: string;
      feedbackInput?: MonthlyFeedbackInput;
    } | null;
  } = $props();
  let pending = $state<string | null>(null);
  const actionResult = $derived(result?.scope === "feedback" ? result : null);
  const input = $derived(
    actionResult?.feedbackInput ?? {
      operatorComment: feedback?.operatorComment ?? "",
      privateReflection: feedback?.privateReflection ?? "",
      version: feedback?.version ?? 0,
    },
  );
  const submit: SubmitFunction = () => {
    pending = "save-feedback";
    return async ({ update }) => {
      try {
        await update({ reset: false });
      } finally {
        pending = null;
      }
    };
  };
</script>

<section class="panel" aria-labelledby="feedback-heading">
  <h2 id="feedback-heading">{formatMonthLabel(month)}のコメント・振り返り</h2>
  {#if actionResult?.message}<p class="notice" role="status">
      {actionResult.message}
    </p>{/if}
  {#if canEdit}
    <p class="muted">
      月次承認前まで修正できます。コメントの保存で稼働・報酬は変更されません。
    </p>
    <form method="POST" action="?/saveFeedback" use:enhance={submit}>
      <MonthlyFeedbackFields {input} />
      <ActionSubmit
        actionName="save-feedback"
        pendingAction={pending}
        label="コメントを保存"
        pendingLabel="保存中..."
      />
    </form>
  {:else}
    <dl>
      <dt>{feedbackQuestions.operatorComment}</dt>
      <dd>{feedback?.operatorComment || "記載なし"}</dd>
      {#if feedback?.privateReflection !== undefined}
        <dt>{feedbackQuestions.privateReflection}（本人のみ）</dt>
        <dd>{feedback.privateReflection || "記載なし"}</dd>
      {/if}
    </dl>
  {/if}
  {#if feedback?.updatedAt}<p class="muted">
      更新 {formatDateTime(feedback.updatedAt)}
    </p>{/if}
</section>

<style>
  form {
    margin-top: 1.5rem;
  }
  dd {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0.4rem 0 1rem;
  }
</style>
