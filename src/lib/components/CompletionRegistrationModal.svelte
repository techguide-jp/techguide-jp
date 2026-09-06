<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import CompletionBackfillPicker from "$lib/components/CompletionBackfillPicker.svelte";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { currentJstMonth } from "$lib/month";
  import CompletionBackfillFields from "$lib/components/CompletionBackfillFields.svelte";
  import { formatProjectName } from "$lib/format";
  import type { ProjectIssue } from "$lib/server/github/projectTypes";

  let {
    candidates,
    mode = "backfill",
    settlementRuleV2Enabled,
    projectFetchError,
  }: {
    candidates: ProjectIssue[];
    mode?: "backfill" | "admin_confirmation";
    settlementRuleV2Enabled: boolean;
    projectFetchError: string | null;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  let selectedRef = $state("");
  let reportedAt = $state("");
  let evidenceUrl = $state("");
  let evidenceNote = $state("");
  let pendingAction = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);

  const selected = $derived(
    candidates.find(
      (issue) => `${issue.repository}#${issue.number}` === selectedRef,
    ),
  );
  let assignedMonth = $state("");
  const title = $derived(
    mode === "admin_confirmation"
      ? "完了済みIssueの精算月を指定"
      : "完了報告の移行登録",
  );
  const triggerLabel = $derived(
    mode === "admin_confirmation"
      ? `精算月を指定（${candidates.length}件）`
      : "完了報告を移行登録",
  );
  const actionName = $derived(
    mode === "admin_confirmation"
      ? "assignCompletionMonth"
      : "backfillCompletion",
  );
  const titleId = $derived(`completion-registration-${mode}`);

  const submit: SubmitFunction = ({ cancel }) => {
    if (pendingAction || !selected) {
      cancel();
      return;
    }
    pendingAction = actionName;
    errorMessage = null;
    return async ({ result, update }) => {
      try {
        if (result.type === "success") {
          await update();
          dialog?.close();
          selectedRef =
            reportedAt =
            evidenceUrl =
            evidenceNote =
            assignedMonth =
              "";
        } else if (result.type === "redirect") {
          await update();
        } else {
          errorMessage =
            result.type === "failure" &&
            typeof result.data?.message === "string"
              ? result.data.message
              : "登録できませんでした。入力内容を確認して、もう一度お試しください。";
        }
      } catch {
        errorMessage =
          "結果を確認できませんでした。再読み込みして登録状況を確認してください。";
      } finally {
        pendingAction = null;
      }
    };
  };
</script>

<button
  type="button"
  class="button secondary ghost"
  aria-haspopup="dialog"
  disabled={!dialog}
  onclick={() => dialog?.showModal()}>{triggerLabel}</button
>

<dialog
  bind:this={dialog}
  class="backfill-dialog"
  aria-labelledby={titleId}
  oncancel={(event) => {
    if (pendingAction) event.preventDefault();
  }}
>
  <header class="modal-header">
    <div>
      <h2 id={titleId}>{title}</h2>
      <p class="mt-1 text-sm text-slate-600">
        {#if mode === "admin_confirmation"}
          管理者が完了を確認したIssueの固定報酬を、指定した月に計上します。作業者の完了報告は不要です。
        {:else}
          未払いの2026年8月分以降の完了報告を、証跡を添えて登録します。
        {/if}
      </p>
    </div>
    <button
      type="button"
      class="icon-button shrink-0"
      aria-label="閉じる"
      disabled={pendingAction !== null}
      onclick={() => dialog?.close()}>×</button
    >
  </header>

  {#if projectFetchError}
    <p class="notice" role="alert">
      候補を取得できませんでした。画面を再読み込みしてください。
    </p>
  {:else if candidates.length === 0}
    <p class="muted">
      登録できるIssueはありません。精算済み・完了報告済みのIssueや、担当者・報酬が未設定のIssueは除外しています。
    </p>
  {:else}
    <form
      method="POST"
      action={`?/${actionName}`}
      use:enhance={submit}
      oninput={() => {
        errorMessage = null;
      }}
    >
      <div class="backfill-body">
        <fieldset disabled={pendingAction !== null} class="min-w-0">
          <div class="backfill-grid">
            <CompletionBackfillPicker {candidates} bind:selectedRef />

            <section class="min-w-0 space-y-4" aria-label={title}>
              {#if selected}
                <div class="rounded-md bg-teal-50 p-3 text-sm">
                  <p class="font-bold">
                    選択中：{formatProjectName(selected.repository)} #{selected.number}
                  </p>
                  <p class="my-1 break-words">
                    {selected.title} / {selected.assignees[0]}
                  </p>
                  <a href={selected.url} target="_blank" rel="noreferrer"
                    >Issueを開く ↗</a
                  >
                </div>
              {:else}
                <p class="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                  対象Issueを選択してください。
                </p>
              {/if}
              <input
                type="hidden"
                name="repository"
                value={selected?.repository ?? ""}
              />
              <input
                type="hidden"
                name="issueNumber"
                value={selected?.number ?? ""}
              />
              <input
                type="hidden"
                name="assigneeLogin"
                value={selected?.assignees[0] ?? ""}
              />
              {#if mode === "admin_confirmation"}
                <label class="backfill-field">
                  精算月
                  <input
                    type="month"
                    name="settlementMonth"
                    bind:value={assignedMonth}
                    max={currentJstMonth()}
                    required
                    aria-describedby="assigned-month-help"
                  />
                </label>
                <p id="assigned-month-help" class="text-sm text-slate-600">
                  固定報酬を計上する月を指定してください。IssueのClosed日時とは別に設定できます。時間報酬は実際の稼働月に計上されます。
                </p>
                <p class="text-sm text-slate-600">
                  指定月が承認済みの場合は追加支払いになります。支払い済みの月には登録できません。
                </p>
              {:else}
                <CompletionBackfillFields
                  bind:reportedAt
                  bind:evidenceUrl
                  bind:evidenceNote
                  {settlementRuleV2Enabled}
                />
              {/if}
            </section>
          </div>
        </fieldset>
      </div>
      {#if errorMessage}<p
          class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {errorMessage}
        </p>{/if}
      <footer
        class="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white pt-4"
      >
        <button
          type="button"
          class="button secondary ghost"
          disabled={pendingAction !== null}
          onclick={() => dialog?.close()}>キャンセル</button
        >
        <ActionSubmit
          {actionName}
          {pendingAction}
          disabled={!selected}
          label={mode === "admin_confirmation"
            ? "指定した月に計上"
            : "証跡付きで移行登録"}
          pendingLabel="登録中..."
        />
      </footer>
    </form>
  {/if}
</dialog>

<style>
  .backfill-dialog {
    width: min(60rem, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto;
    padding: 1.25rem;
    overflow: hidden;
    border: 0;
    border-radius: 0.75rem;
    background: white;
    color: #0f172a;
    box-shadow: 0 25px 50px -12px #0004;
  }
  .backfill-dialog::backdrop {
    background: #0f172a66;
  }
  .backfill-dialog[open],
  .backfill-dialog form {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .backfill-dialog header,
  .backfill-dialog footer {
    flex-shrink: 0;
  }
  .backfill-body {
    min-height: 0;
    overflow-y: auto;
    padding: 3px;
  }
  .backfill-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.5rem;
  }
  .backfill-field {
    display: grid;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .backfill-field input {
    width: 100%;
    min-width: 0;
    padding: 0.625rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.375rem;
    background: white;
    font: inherit;
    font-weight: 400;
  }
  .backfill-field :focus-visible {
    outline: 2px solid #0f766e;
    outline-offset: 2px;
  }
  @media (max-width: 640px) {
    .backfill-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .backfill-dialog {
      padding: 1rem;
    }
  }
</style>
