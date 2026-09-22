<script lang="ts">
  import { applyAction, enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";

  let { adminLogin, targetLogin }: { adminLogin: string; targetLogin: string } =
    $props();
  let pendingAction = $state<string | null>(null);
  let message = $state<string | null>(null);
  const stop: SubmitFunction = () => {
    pendingAction = "stop";
    message = null;
    return async ({ result }) => {
      try {
        if (result.type === "redirect") await applyAction(result);
        else
          message = "管理者へ戻れませんでした。再読み込みしてお試しください。";
      } finally {
        pendingAction = null;
      }
    };
  };
</script>

<aside class="local-banner" aria-label="ローカルの擬似ログイン">
  <div>
    <strong>ローカル · {targetLogin} として擬似ログイン中</strong>
    <p>
      申請・編集はローカルDBに保存されます。メール送信・GitHub更新は行いません。
    </p>
    <small>元の管理者：{adminLogin}</small>
  </div>
  <form method="POST" action="/dev/impersonation?/stop" use:enhance={stop}>
    <ActionSubmit
      actionName="stop"
      {pendingAction}
      label="管理者に戻る"
      pendingLabel="復帰中..."
      variant="secondary"
    />
    <a href="/dev/impersonation">別のユーザーへ切替</a>
    {#if message}<p class="bad" role="alert">{message}</p>{/if}
  </form>
</aside>

<style>
  .local-banner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.5rem;
    background: #fff8e1;
    border-bottom: 1px solid #e8ce80;
    color: #49370a;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0.4rem 0;
  }
  form {
    display: grid;
    gap: 0.5rem;
    align-content: center;
  }
</style>
