<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime } from "$lib/format";
  import {
    monthlyLetterMaxLength,
    monthlyLetterSubmissionStatuses,
    type MonthlyLetterSubmissionStatus,
  } from "$lib/monthlyLetter";
  import { formatMonthLabel } from "$lib/month";
  import { buildSettlementNotification } from "$lib/notifications/templates";
  import {
    partnerInterestOptions,
    preferenceQuestions,
  } from "$lib/workerPreferences";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  let body = $derived(form?.body ?? data.letter?.body ?? "");
  let submissionStatus = $state<MonthlyLetterSubmissionStatus>("required");
  const preview = $derived(
    buildSettlementNotification(
      {
        type: "monthly_submission_reminder",
        operationId: "preview",
        month: data.settlementMonth,
        assigneeLogin: "sample-worker",
        workerDisplayName: "サンプル作業者",
        occurredAt: new Date(`${data.sendMonth}-01T00:00:00Z`),
        taxExcludedYen: 0,
        taxIncludedYen: 0,
        monthlyLetterBody: body,
        monthlySubmissionStatus: submissionStatus,
      },
      data.previewOrigin,
      data.previewHasReplyTo,
    ),
  );
  const previewHtml = $derived(
    preview.html.replace(/<a href="[^"]*"/g, '<a aria-disabled="true"'),
  );
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

<div class="letter-layout">
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
      <p
        class={form.body === undefined ? "notice" : "form-error"}
        role="status"
      >
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
          bind:value={body}></textarea>
      </label>
      <p id="letter-fallback" class="muted">
        空欄で保存すると、プレビューに表示される固定文で配信します。
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

  <section class="panel letter-panel" aria-labelledby="letter-preview-heading">
    <h2 id="letter-preview-heading">メールプレビュー</h2>
    <div class="preview-controls">
      <label for="letter-preview-status">申請状況</label>
      <select id="letter-preview-status" bind:value={submissionStatus}>
        {#each monthlyLetterSubmissionStatuses as status (status.value)}
          <option value={status.value}>{status.label}</option>
        {/each}
      </select>
      <a href="#survey-preview">希望アンケートの設問を見る</a>
    </div>
    <p class="preview-subject"><strong>件名</strong> {preview.subject}</p>
    <iframe
      title="月次メールの本文プレビュー"
      sandbox=""
      srcdoc={`<meta charset="utf-8"><style>body{overflow-wrap:anywhere}</style>${previewHtml}`}
    ></iframe>
    <p class="form-hint">本文の入力はプレビューにすぐ反映されます。</p>
  </section>
</div>

<section
  class="panel letter-panel survey-preview"
  aria-labelledby="survey-preview"
>
  <h2 id="survey-preview">希望アンケートの設問</h2>
  <p>作業者はプロフィールの「現在の希望」で回答します。</p>
  <ol>
    <li>
      {preferenceQuestions.availabilityNote}
      <small class="form-optional">任意</small>
    </li>
    <li>
      {preferenceQuestions.selfAssignmentNote}
      <small class="form-optional">任意</small>
    </li>
    <li>
      {preferenceQuestions.partnerInterest}
      <small class="form-required">必須</small>
      <ul>
        {#each partnerInterestOptions as option (option.value)}
          <li>{option.label}</li>
        {/each}
      </ul>
    </li>
    <li>
      {preferenceQuestions.partnerConditions}
      <small class="form-optional">任意</small>
      <p class="form-hint">
        「希望する」「条件次第で検討したい」を選んだ場合に表示されます。
      </p>
    </li>
  </ol>
</section>

<style>
  .letter-layout {
    display: grid;
    gap: 1rem;
    align-items: start;
  }
  .letter-panel {
    min-width: 0;
  }
  .letter-layout > .letter-panel {
    margin-bottom: 0;
  }
  .preview-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-block: 0.75rem;
  }
  .preview-controls select {
    max-width: 100%;
  }
  .preview-controls a {
    color: #0f766e;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .preview-subject {
    margin-block: 0.75rem;
    overflow-wrap: anywhere;
  }
  iframe {
    width: 100%;
    height: 31rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.5rem;
    background: white;
  }
  .survey-preview {
    margin-top: 1rem;
    max-width: 48rem;
  }
  .survey-preview ol,
  .survey-preview ul {
    padding-inline-start: 1.5rem;
  }
  .survey-preview ol {
    list-style: decimal;
  }
  .survey-preview ul {
    list-style: disc;
    font-weight: normal;
    margin-block: 0.5rem;
  }
  .survey-preview ol > li {
    margin-top: 0.75rem;
  }
  @media (min-width: 960px) {
    .letter-layout {
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
    }
  }
</style>
