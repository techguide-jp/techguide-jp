<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime } from "$lib/format";
  import {
    defaultMonthlyLetter,
    monthlyLetterMaxLength,
  } from "$lib/monthlyLetter";
  import { formatMonthLabel } from "$lib/month";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  const submittedMonth = $derived(form?.sendMonth ?? data.sendMonth);
  const submit: SubmitFunction = () => {
    pendingAction = "save-letter";
    return async ({ update }) => {
      try {
        await update({ reset: false });
      } finally {
        pendingAction = null;
      }
    };
  };
</script>

<nav class="breadcrumb" aria-label="パンくず">
  <ol>
    <li><a href="/admin/email-previews">メール通知</a></li>
    <li><span aria-current="page">月次のお手紙</span></li>
  </ol>
</nav>

<section class="page-heading">
  <div>
    <h1>月次のお手紙</h1>
    <p>{formatMonthLabel(data.sendMonth)}1日 9時台（日本時間）に配信</p>
  </div>
</section>

<section class="panel letter-panel">
  <h2>翌月配信の本文</h2>
  <p>
    登録者一覧の全員に同じお手紙を送ります。アンケートへのリンクと、{formatMonthLabel(
      data.settlementMonth,
    )}分の申請状況に応じた案内がメールに入ります。
  </p>
  {#if data.letter}
    <p class="muted">
      最終更新 {formatDateTime(data.letter.updatedAt)} ／ {data.letter
        .updatedBy}
    </p>
  {/if}
  {#if form?.message}
    <p class={form.body === undefined ? "notice" : "form-error"} role="status">
      {form.message}
    </p>
  {/if}
  <form method="POST" action="?/save" use:enhance={submit}>
    <input type="hidden" name="sendMonth" value={submittedMonth} />
    <input
      type="hidden"
      name="version"
      value={(form && "version" in form ? form.version : undefined) ??
        data.letter?.version ??
        0}
    />
    <label class="profile-field">
      本文
      <textarea
        name="body"
        rows="10"
        maxlength={monthlyLetterMaxLength}
        aria-describedby="letter-fallback"
        value={form?.body ?? data.letter?.body ?? ""}></textarea>
    </label>
    <p id="letter-fallback" class="muted">
      空欄のままの場合は、下の固定文で配信します。
    </p>
    <ActionSubmit
      actionName="save-letter"
      {pendingAction}
      label="お手紙を保存"
      pendingLabel="保存中..."
      disabled={submittedMonth !== data.sendMonth}
    />
  </form>
</section>

<section class="panel letter-panel">
  <h2>空欄時のお手紙</h2>
  <p>{defaultMonthlyLetter(data.settlementMonth)}</p>
</section>

<style>
  .letter-panel {
    max-width: 48rem;
  }
</style>
