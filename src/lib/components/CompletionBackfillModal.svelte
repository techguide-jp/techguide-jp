<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import CompletionBackfillPicker from "$lib/components/CompletionBackfillPicker.svelte";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatMonthLabel } from "$lib/month";
  import { formatProjectName } from "$lib/format";
  import type { ProjectIssue } from "$lib/server/github/projectTypes";

  let {
    candidates,
    settlementRuleV2Enabled,
    projectFetchError,
  }: {
    candidates: ProjectIssue[];
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
  const settlementMonth = $derived(reportedAt.slice(0, 7));

  const submit: SubmitFunction = ({ cancel }) => {
    if (pendingAction || !selected) {
      cancel();
      return;
    }
    pendingAction = "backfill-completion";
    errorMessage = null;
    return async ({ result, update }) => {
      try {
        if (result.type === "success") {
          await update();
          dialog?.close();
          selectedRef = reportedAt = evidenceUrl = evidenceNote = "";
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
  onclick={() => dialog?.showModal()}>完了報告を移行登録</button
>

<dialog
  bind:this={dialog}
  class="backfill-dialog"
  aria-labelledby="backfill-title"
  oncancel={(event) => {
    if (pendingAction) event.preventDefault();
  }}
>
  <header class="modal-header">
    <div>
      <h2 id="backfill-title">完了報告の移行登録</h2>
      <p class="mt-1 text-sm text-slate-600">
        未払いの2026年8月分以降の完了報告を、証跡を添えて登録します。
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
      移行登録できるIssueはありません。精算済み・完了報告済みのIssueや、担当者・報酬が未設定のIssueは除外しています。
    </p>
  {:else}
    <form
      method="POST"
      action="?/backfillCompletion"
      use:enhance={submit}
      oninput={() => {
        errorMessage = null;
      }}
    >
      <div class="backfill-body">
        <fieldset disabled={pendingAction !== null} class="min-w-0">
          <div class="backfill-grid">
            <CompletionBackfillPicker {candidates} bind:selectedRef />

            <section class="min-w-0 space-y-4" aria-label="完了報告の登録内容">
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
              <label class="backfill-field">
                完了日時（JST）
                <input
                  type="datetime-local"
                  name="reportedAt"
                  bind:value={reportedAt}
                  min="2026-08-01T00:00"
                  required
                  aria-describedby="backfill-month-help"
                />
              </label>
              <div id="backfill-month-help" class="text-sm text-slate-600">
                <p>
                  固定報酬は、この日時が属する月の精算対象になります。時間報酬は実際に稼働した月に計上されます。
                </p>
                {#if settlementMonth}
                  <p class="mt-1 font-bold text-teal-800" role="status">
                    固定報酬の精算月：{formatMonthLabel(settlementMonth)}
                  </p>
                {/if}
                {#if !settlementRuleV2Enabled}
                  <p class="mt-1">
                    登録内容は、新精算ルールの有効化後に反映されます。
                  </p>
                {/if}
              </div>
              <label class="backfill-field">
                証跡URL
                <input
                  type="url"
                  name="evidenceUrl"
                  bind:value={evidenceUrl}
                  placeholder="https://github.com/.../pull/123#issuecomment-..."
                  maxlength="2000"
                  required
                  aria-describedby="backfill-evidence-help"
                />
              </label>
              <p id="backfill-evidence-help" class="text-sm text-slate-600">
                レビュー依頼や納品・作業完了の連絡を確認できるURLを入力してください。例：GitHubのPR・Issueコメント、Slackの該当メッセージへのリンク。入力した完了日時の根拠が分かる箇所を指定します。
              </p>
              <label class="backfill-field">
                登録理由
                <textarea
                  name="evidenceNote"
                  rows="3"
                  bind:value={evidenceNote}
                  maxlength="2000"
                  placeholder="例：完了報告機能の導入前に、8/20のPRコメントでレビューを依頼済みのため。"
                  required></textarea>
              </label>
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
          actionName="backfill-completion"
          {pendingAction}
          disabled={!selected}
          label="証跡付きで移行登録"
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
  .backfill-field input,
  .backfill-field textarea {
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
