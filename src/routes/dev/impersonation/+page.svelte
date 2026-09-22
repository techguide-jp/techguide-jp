<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  let login = $state("");
  const submit: SubmitFunction = () => {
    pendingAction = "start";
    return async ({ update }) => {
      try {
        await update();
      } finally {
        pendingAction = null;
      }
    };
  };
</script>

<section class="page-heading">
  <p class="eyebrow">local testing</p>
  <h1>ユーザー切替</h1>
  <p class="muted">
    管理者 {data.adminLogin} として、登録ユーザーの画面や操作を確認できます。
  </p>
</section>

<section class="panel">
  <h2>ローカルで擬似ログインする</h2>
  <p>
    選んだユーザーの権限で「稼働」「自分の精算」「プロフィール」を表示し、申請・編集できます。変更はローカルDBに保存されます。
  </p>
  <p class="muted">
    メールはプレビューに保存し、GitHub
    Projectは更新しません。切り替えはこのブラウザーの全タブに適用され、1時間で終了します。
  </p>
  {#if data.targets.length === 0}
    <p>切り替えられる登録ユーザーがいません。</p>
  {:else}
    <form method="POST" action="?/start" use:enhance={submit}>
      <label>
        対象ユーザー
        <select
          name="login"
          bind:value={login}
          required
          disabled={pendingAction !== null}
        >
          <option value="" disabled>ユーザーを選択</option>
          {#each data.targets as target (target.login)}
            <option value={target.login}
              >{target.displayName}（{target.login}）</option
            >
          {/each}
        </select>
      </label>
      <ActionSubmit
        actionName="start"
        {pendingAction}
        label="このユーザーで確認する"
        pendingLabel="切替中..."
        disabled={!login}
      />
      {#if form?.message}<p class="bad" role="alert">{form.message}</p>{/if}
    </form>
  {/if}
</section>

<style>
  form {
    display: grid;
    gap: 1rem;
    max-width: 36rem;
  }
  label {
    display: grid;
    gap: 0.5rem;
  }
  select {
    width: 100%;
    min-width: 0;
  }
</style>
