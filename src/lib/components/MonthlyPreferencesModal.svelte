<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import WorkerPreferencesFields from "$lib/components/WorkerPreferencesFields.svelte";
  import { dismissOnBackdrop } from "$lib/dialogBackdrop";
  import type {
    WorkerPreferencesInput,
    WorkerPreferencesView,
  } from "$lib/workerPreferences";

  let {
    preferences,
    result,
    close,
  }: {
    preferences: WorkerPreferencesView;
    result?: {
      scope?: string;
      message?: string;
      preferencesInput?: WorkerPreferencesInput;
    } | null;
    close: () => void;
  } = $props();
  let dialog = $state<HTMLDialogElement>();
  let heading = $state<HTMLElement>();
  let pendingAction = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  const feedback = $derived(result?.scope === "preferences" ? result : null);
  const input = $derived(feedback?.preferencesInput ?? preferences);

  $effect(() => {
    if (!dialog) return;
    // JSなしでも確認・保存できるopen表示を、初期化後は背景を操作できないモーダルへ切り替える。
    dialog.close();
    dialog.showModal();
    heading?.focus();
    const body = dialog.ownerDocument.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  });

  const dismiss = () => {
    if (pendingAction) return;
    dialog?.close();
    close();
  };
  const submit: SubmitFunction = ({ cancel }) => {
    if (pendingAction) {
      cancel();
      return;
    }
    pendingAction = "save-preferences";
    errorMessage = null;
    return async ({ result: actionResult, update }) => {
      try {
        if (actionResult.type === "success") {
          dialog?.close();
          await update({ reset: false });
        } else if (actionResult.type === "failure") {
          await update({ reset: false });
        } else {
          errorMessage =
            "希望を保存できませんでした。時間をおいて再度お試しください。";
        }
      } catch {
        errorMessage =
          "保存結果を確認できませんでした。入力内容を控えて再読み込みしてください。";
      } finally {
        pendingAction = null;
      }
    };
  };
</script>

<dialog
  bind:this={dialog}
  use:dismissOnBackdrop={dismiss}
  open
  aria-labelledby="monthly-preferences-heading"
  aria-describedby="monthly-preferences-description"
  oncancel={(event) => {
    event.preventDefault();
    dismiss();
  }}
  onkeydown={(event) => {
    if (event.key !== "Tab" || !dialog) return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), input:not(:disabled):not([type="hidden"]), summary',
      ),
    ].filter((element) => element.checkVisibility());
    const first = controls[0];
    const last = controls.at(-1);
    const active = dialog.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || active === heading)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }}
>
  <header>
    <h2 id="monthly-preferences-heading" bind:this={heading} tabindex="-1">
      今後の希望を確認
    </h2>
    <p class="ok">月次確定申請は完了しています。</p>
    <p id="monthly-preferences-description" class="muted">
      プロフィールに登録されている希望を表示しています。変更があれば書き換えて保存してください。保存内容はプロフィールにも反映されます。
    </p>
  </header>
  <form method="POST" action="?/savePreferences" use:enhance={submit}>
    <fieldset disabled={pendingAction !== null}>
      {#key JSON.stringify(input)}
        <WorkerPreferencesFields initial={input} />
      {/key}
    </fieldset>
    {#if errorMessage || feedback?.message}
      <p class="notice" role="alert">{errorMessage ?? feedback?.message}</p>
    {/if}
    <footer>
      <button
        type="submit"
        formmethod="dialog"
        formnovalidate
        class="button secondary"
        disabled={pendingAction !== null}
        onclick={(event) => {
          event.preventDefault();
          dismiss();
        }}>変更なしで閉じる</button
      >
      <ActionSubmit
        actionName="save-preferences"
        {pendingAction}
        label="変更を保存"
        pendingLabel="保存中..."
      />
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(42rem, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto;
    padding: 1.5rem;
    overflow-y: auto;
    border: 0;
    border-radius: 0.75rem;
    background: white;
    color: #0f172a;
    box-shadow: 0 25px 50px -12px #0004;
  }
  dialog::backdrop {
    background: #0f172a66;
  }
  h2 {
    margin-top: 0;
  }
  fieldset {
    display: grid;
    gap: 1.5rem;
    min-width: 0;
    margin: 1.5rem 0;
    padding: 0;
    border: 0;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.75rem;
  }
  @media (max-width: 640px) {
    dialog {
      padding: 1rem;
    }
  }
</style>
