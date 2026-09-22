<script lang="ts">
  import { enhance } from "$app/forms";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import MonthlyFeedbackFields from "$lib/components/MonthlyFeedbackFields.svelte";
  import type { MonthlyFeedbackInput } from "$lib/monthlyFeedback";
  import { formatMonthLabel } from "$lib/month";

  let {
    month,
    assignee,
    input,
    result,
    amountLabel,
    resubmission = false,
    includeFeedback = true,
    mode = "submission",
    initiallyOpen = false,
  }: {
    month: string;
    assignee: string;
    input: MonthlyFeedbackInput;
    amountLabel?: string;
    resubmission?: boolean;
    includeFeedback?: boolean;
    mode?: "submission" | "feedback";
    initiallyOpen?: boolean;
    result?: {
      scope?: string;
      message?: string;
      feedbackInput?: MonthlyFeedbackInput;
    } | null;
  } = $props();
  let opened = $state(false);
  let defaultDismissed = $state(false);
  let dismissedResult = $state.raw<typeof result>(null);
  let dialog = $state<HTMLDialogElement>();
  let heading = $state<HTMLElement>();
  let trigger = $state<HTMLElement>();
  let pending = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  const failure = $derived(
    result?.scope === mode && "feedbackInput" in result ? result : null,
  );
  const visible = $derived(
    opened ||
      (initiallyOpen && !defaultDismissed) ||
      (failure && failure !== dismissedResult),
  );
  const title = $derived(
    mode === "feedback"
      ? "月次コメントを編集"
      : resubmission
        ? "月次確定申請の再申請"
        : "月次確定申請",
  );
  const triggerLabel = $derived(
    mode === "feedback"
      ? "コメントを編集"
      : resubmission
        ? "変更内容で再申請"
        : "月次確定申請をする",
  );
  const action = $derived(mode === "feedback" ? "saveFeedback" : "submitWork");
  const titleId = $derived(`monthly-${mode}-heading`);
  const detailHref = $derived(`/settlements/${month}/${assignee}`);

  $effect(() => {
    if (!dialog || !visible) return;
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
    dialog?.close();
    opened = false;
    defaultDismissed = true;
    dismissedResult = failure;
    // JS初期化前にリンクで開いた場合も、完了後の再読み込みで再表示しない。
    if (page.url.searchParams.get("form") === mode) {
      replaceState(detailHref, page.state);
    }
    trigger?.focus();
  };
  const submit: SubmitFunction = ({ cancel }) => {
    if (pending) {
      cancel();
      return;
    }
    pending = action;
    errorMessage = null;
    return async ({ result: actionResult, update }) => {
      try {
        if (actionResult.type === "success") {
          // 申請モーダルを閉じてから、成功後の希望確認モーダルへ進む。
          dismiss();
          await update({ reset: false });
        } else if (actionResult.type === "failure") {
          await update({ reset: false });
        } else {
          errorMessage =
            "保存できませんでした。入力内容はそのままで、もう一度お試しください。";
        }
      } catch {
        errorMessage =
          "保存結果を確認できませんでした。入力内容を控えて再読み込みしてください。";
      } finally {
        pending = null;
      }
    };
  };
</script>

<a
  bind:this={trigger}
  class="button primary"
  href={`?form=${mode}`}
  aria-haspopup="dialog"
  onclick={(event) => {
    event.preventDefault();
    opened = true;
    errorMessage = null;
  }}>{triggerLabel}</a
>

{#if visible}
  <dialog
    bind:this={dialog}
    open
    aria-labelledby={titleId}
    oncancel={(event) => {
      event.preventDefault();
      if (!pending) dismiss();
    }}
    onkeydown={(event) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = [
        ...dialog.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), textarea:not(:disabled)",
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
    <h2 id={titleId} bind:this={heading} tabindex="-1">{title}</h2>
    <p>{assignee} / {formatMonthLabel(month)}</p>
    {#if mode === "submission"}
      <p class="amount">申請額（税込） <strong>{amountLabel}</strong></p>
      <p>この月の稼働内容を確定し、管理者に精算の承認を依頼します。</p>
    {:else}
      <p>
        コメントだけを保存します。稼働・報酬や月次の申請状態は変わりません。
      </p>
    {/if}
    <form method="POST" action={`?/${action}`} use:enhance={submit}>
      {#if includeFeedback}
        <fieldset disabled={pending !== null}>
          <MonthlyFeedbackFields input={failure?.feedbackInput ?? input} />
        </fieldset>
      {/if}
      {#if errorMessage || failure?.message}<p class="notice" role="alert">
          {errorMessage ?? failure?.message}
        </p>{/if}
      <footer>
        {#if pending}<span class="button secondary" aria-disabled="true"
            >閉じる</span
          >
        {:else}<a
            class="button secondary"
            href={detailHref}
            onclick={(event) => {
              event.preventDefault();
              dismiss();
            }}>閉じる</a
          >{/if}
        <ActionSubmit
          actionName={action}
          pendingAction={pending}
          label={mode === "feedback"
            ? "コメントを保存"
            : resubmission
              ? "この内容で再申請"
              : "この内容で月次確定申請"}
          pendingLabel={mode === "feedback" ? "保存中..." : "申請中..."}
        />
      </footer>
    </form>
  </dialog>
{/if}

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
  .amount {
    padding: 1rem;
    background: #f0fdfa;
    border-radius: 0.5rem;
  }
  @media (max-width: 640px) {
    dialog {
      padding: 1rem;
    }
  }
</style>
