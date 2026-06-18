<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";

  export type WorkChangeDialogState =
    | {
        requestType: "add";
        issueKey: string;
        issueLabel: string;
        startedAt: string;
        endedAt: string;
      }
    | {
        requestType: "edit";
        issueKey: string;
        issueLabel: string;
        targetSessionId: string;
        startedAt: string;
        endedAt: string;
      }
    | {
        requestType: "exclude";
        issueKey: string;
        issueLabel: string;
        targetSessionId: string;
      };

  type Props = {
    dialog: WorkChangeDialogState;
    pendingAction: string | null;
    enhanceAction: (
      name: string,
      closeDialogOnSuccess?: boolean,
    ) => SubmitFunction;
    close: () => void;
  };

  let { dialog, pendingAction, enhanceAction, close }: Props = $props();

  const dialogTitle = $derived(
    {
      add: "稼働ログ追加申請",
      edit: "稼働ログ修正申請",
      exclude: "稼働ログ除外申請",
    }[dialog.requestType],
  );
</script>

<div class="modal-backdrop">
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="change-dialog-title"
  >
    <div class="modal-header">
      <div>
        <p class="eyebrow">{dialog.issueLabel}</p>
        <h2 id="change-dialog-title">{dialogTitle}</h2>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label="閉じる"
        onclick={close}
      >
        ×
      </button>
    </div>
    <form
      method="POST"
      action="?/requestChange"
      use:enhance={enhanceAction("request-change", true)}
      class="request-form"
    >
      <input type="hidden" name="requestType" value={dialog.requestType} />
      <input type="hidden" name="issueKey" value={dialog.issueKey} />
      {#if dialog.requestType !== "add"}
        <input
          type="hidden"
          name="targetSessionId"
          value={dialog.targetSessionId}
        />
      {/if}
      {#if dialog.requestType !== "exclude"}
        <label>
          開始
          <input
            name="requestedStartedAt"
            type="datetime-local"
            value={dialog.startedAt}
            required
          />
        </label>
        <label>
          終了
          <input
            name="requestedEndedAt"
            type="datetime-local"
            value={dialog.endedAt}
            required
          />
        </label>
      {/if}
      <label class="wide">
        理由
        <textarea name="reason" rows="4" required></textarea>
      </label>
      <div class="form-actions">
        <button class="button secondary ghost" type="button" onclick={close}>
          キャンセル
        </button>
        <ActionSubmit
          actionName="request-change"
          {pendingAction}
          label="申請"
          pendingLabel="申請中..."
          variant="secondary"
        />
      </div>
    </form>
  </div>
</div>
