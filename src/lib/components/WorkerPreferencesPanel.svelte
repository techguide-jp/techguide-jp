<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import WorkerPreferencesFields from "$lib/components/WorkerPreferencesFields.svelte";
  import { formatDateTime } from "$lib/format";
  import {
    preferenceQuestions,
    partnerInterestOptions,
    type WorkerPreferencesInput,
    type WorkerPreferencesView,
  } from "$lib/workerPreferences";
  let {
    preferences,
    canEdit,
    result,
  }: {
    preferences: WorkerPreferencesView | null;
    canEdit: boolean;
    result?: {
      scope?: string;
      message?: string;
      preferencesInput?: WorkerPreferencesInput;
    } | null;
  } = $props();
  let pending = $state<string | null>(null);
  const saved = $derived(preferences);
  const feedback = $derived(result?.scope === "preferences" ? result : null);
  const input = $derived(feedback?.preferencesInput ?? saved);
  const submit: SubmitFunction = () => {
    pending = "save-preferences";
    return async ({ update }) => {
      try {
        await update({ reset: false });
      } finally {
        pending = null;
      }
    };
  };
</script>

{#if saved && input}
  <section
    class="panel preferences-panel"
    aria-labelledby="preferences-heading"
  >
    <h2 id="preferences-heading">現在の希望</h2>
    <p class="muted">
      プロフィールと共通の最新情報です。精算の有無にかかわらず、いつでも希望だけ保存できます。本人と運営が確認できます。
    </p>
    {#if saved.updatedAt}<p class="muted">
        更新 {formatDateTime(saved.updatedAt)}
      </p>{/if}
    {#if feedback?.message}<p class="notice" role="status">
        {feedback.message}
      </p>{/if}
    {#if canEdit}
      <form method="POST" action="?/savePreferences" use:enhance={submit}>
        {#key JSON.stringify(input)}<WorkerPreferencesFields
            initial={input}
          />{/key}
        <ActionSubmit
          actionName="save-preferences"
          pendingAction={pending}
          label="希望を保存"
          pendingLabel="保存中..."
        />
        <p class="muted">
          希望を変更した場合はこのボタンで保存してください。月次確定申請は別の操作です。
        </p>
      </form>
    {:else}
      <dl>
        <dt>{preferenceQuestions.availabilityNote}</dt>
        <dd>{saved.availabilityNote || "記載なし"}</dd>
        <dt>{preferenceQuestions.selfAssignmentNote}</dt>
        <dd>{saved.selfAssignmentNote || "記載なし"}</dd>
        <dt>{preferenceQuestions.partnerInterest}</dt>
        <dd>
          {partnerInterestOptions.find(
            (option) => option.value === saved.partnerInterest,
          )?.label ?? "回答はまだ登録されていません"}
        </dd>
        {#if saved.partnerInterest === "interested" || saved.partnerInterest === "conditional"}
          <dt>{preferenceQuestions.partnerConditions}</dt>
          <dd>{saved.partnerConditions || "記載なし"}</dd>
        {/if}
      </dl>
    {/if}
  </section>
{/if}

<style>
  form {
    display: grid;
    gap: 1rem;
  }
  .preferences-panel {
    min-width: 0;
  }
  dd {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0.4rem 0 1rem;
  }
</style>
