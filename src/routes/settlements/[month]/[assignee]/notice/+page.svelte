<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageProps } from "./$types";
  import {
    formatDate,
    formatDateTime,
    formatIssueName,
    formatProjectName,
    formatYen,
  } from "$lib/format";
  import { formatMonthLabel } from "$lib/month";
  import { workerPayoutAccountHref } from "$lib/workerProfileRoute";

  let { data, form }: PageProps = $props();

  const notice = $derived(data.notice);
  const isAdmin = $derived(Boolean(data.user?.isAdmin));
  const isSelf = $derived(data.user?.login === data.assignee);
  const lineWarnings = $derived(
    (notice?.document.lines ?? []).filter((line) => line.warnings.length > 0),
  );

  let pdfPending = $state(false);

  const printNotice = () => globalThis.print();

  // ブラウザには「PDF直接保存」APIがないため、通知書本文をキャプチャして
  // クライアント側でPDF化しダウンロードする。
  const savePdf = async () => {
    if (!notice || pdfPending) return;
    const target = globalThis.document.querySelector(".notice-document");
    if (!(target instanceof HTMLElement)) return;
    pdfPending = true;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/png");
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`支払い通知書_${notice.month}_${notice.assigneeLogin}.pdf`);
    } finally {
      pdfPending = false;
    }
  };
</script>

<svelte:head>
  <title>支払い通知書 / {data.assignee} / {formatMonthLabel(data.month)}</title>
</svelte:head>

<section class="page-heading no-print">
  <div>
    <p class="eyebrow">payment notice</p>
    <h1>支払い通知書</h1>
  </div>
  <div class="notice-toolbar">
    {#if notice}
      <button type="button" class="button primary" onclick={printNotice}>
        印刷する
      </button>
      <button
        type="button"
        class="button secondary"
        onclick={savePdf}
        disabled={pdfPending}
      >
        {pdfPending ? "PDF生成中..." : "PDFで保存"}
      </button>
    {/if}
    <a
      class="button ghost"
      href={`/settlements/${data.month}/${data.assignee}`}
    >
      月次精算に戻る
    </a>
    {#if isAdmin && data.approved}
      <form method="POST" action="?/recreate" use:enhance>
        <button type="submit" class="button ghost">通知書を再作成</button>
      </form>
    {/if}
  </div>
</section>

{#if notice}
  <p class="muted notice-hint no-print">
    「印刷する」はブラウザの印刷ダイアログを開きます。「PDFで保存」はこの通知書をPDFファイルとしてダウンロードします。
  </p>
{/if}

{#if form?.message}
  <p class="notice no-print" role="status">{form.message}</p>
{/if}

{#if !notice}
  <section class="panel no-print">
    {#if !data.approved}
      <h2>支払い通知書はまだ表示できません</h2>
      <p class="muted">
        この月はまだ管理者に承認されていません。管理者の月次承認後に支払い通知書が表示されます。
      </p>
    {:else if !data.payoutRegistered}
      <h2>支払い通知書を作成できません</h2>
      <div class="alert">
        振込先情報が未登録のため、支払い通知書を作成できません。
      </div>
      {#if isSelf}
        <p>
          <a href={workerPayoutAccountHref(data.assignee)}>振込先情報</a
          >から登録してください。
        </p>
      {:else}
        <p class="muted">作業者に振込先情報の登録を依頼してください。</p>
      {/if}
    {:else}
      <h2>支払い通知書のスナップショットがありません</h2>
      <p class="muted">
        承認時点の通知書スナップショットがないため、確定した支払い通知書を表示できません。再承認または再作成が必要です。
      </p>
      {#if isAdmin}
        <p class="muted">上部の「通知書を再作成」から作成できます。</p>
      {/if}
    {/if}
  </section>
{:else}
  <article class="notice-document">
    <header class="notice-head">
      <p class="notice-eyebrow">techguide-jp settlement</p>
      <h1>支払い通知書</h1>
    </header>

    <dl class="notice-meta">
      <div>
        <dt>通知書番号</dt>
        <dd>{notice.noticeNumber}</dd>
      </div>
      <div>
        <dt>対象月</dt>
        <dd>{formatMonthLabel(notice.month)}</dd>
      </div>
      <div>
        <dt>発行日</dt>
        <dd>{formatDate(notice.issuedOn)}</dd>
      </div>
      <div>
        <dt>作成日時</dt>
        <dd>{formatDateTime(notice.createdAt)}</dd>
      </div>
      <div>
        <dt>管理者承認日時</dt>
        <dd>{formatDateTime(notice.approvedAt)}</dd>
      </div>
      <div>
        <dt>承認者</dt>
        <dd>{notice.approvedBy}</dd>
      </div>
      <div>
        <dt>支払い予定日</dt>
        <dd>{formatDate(notice.scheduledDate)}</dd>
      </div>
    </dl>

    <section class="notice-section">
      <h2>支払先</h2>
      {#if notice.recipientLoadError}
        <div class="alert">
          宛先情報を復号できませんでした。通知書を再作成してください。
        </div>
      {:else}
        <dl class="notice-fields">
          <div>
            <dt>宛名</dt>
            <dd>{notice.recipient.recipientName}</dd>
          </div>
          <div>
            <dt>郵便番号</dt>
            <dd>〒{notice.recipient.postalCode}</dd>
          </div>
          <div>
            <dt>住所</dt>
            <dd>{notice.recipient.address}</dd>
          </div>
          <div>
            <dt>作業者</dt>
            <dd>{notice.workerDisplayName}（{notice.assigneeLogin}）</dd>
          </div>
          <div>
            <dt>精算ページ</dt>
            <dd class="break">{notice.settlementUrl}</dd>
          </div>
        </dl>
      {/if}
    </section>

    <section class="notice-section">
      <h2>支払い金額</h2>
      <table class="notice-amounts">
        <tbody>
          <tr>
            <th>固定報酬合計</th>
            <td>{formatYen(notice.document.totals.fixedRewardYen)}</td>
          </tr>
          <tr>
            <th>時間精算合計</th>
            <td>{formatYen(notice.document.totals.timedRewardYen)}</td>
          </tr>
          <tr>
            <th>税抜合計</th>
            <td>{formatYen(notice.document.totals.taxExcludedYen)}</td>
          </tr>
          <tr>
            <th>消費税額</th>
            <td>{formatYen(notice.document.totals.taxYen)}</td>
          </tr>
          <tr class="notice-total">
            <th>税込合計</th>
            <td>{formatYen(notice.document.totals.taxIncludedYen)}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="notice-section">
      <h2>明細</h2>
      <div class="table-wrap">
        <table class="notice-table">
          <thead>
            <tr>
              <th>Project / Repository</th>
              <th>Issue</th>
              <th>報酬方式</th>
              <th class="num">固定報酬</th>
              <th class="num">稼働</th>
              <th class="num">時間単価</th>
              <th class="num">時間精算</th>
              <th class="num">税抜小計</th>
            </tr>
          </thead>
          <tbody>
            {#each notice.document.lines as line (`${line.repository}#${line.issueNumber}`)}
              <tr>
                <td>
                  {formatProjectName(line.repository)}
                  <div class="issue-sub">{line.repository}</div>
                </td>
                <td>
                  <a href={line.issueUrl} target="_blank" rel="noreferrer">
                    {formatIssueName(line.issueNumber, line.issueTitle)}
                  </a>
                  <div class="issue-sub">{line.issueUrl}</div>
                </td>
                <td>{line.rewardMode ?? "-"}</td>
                <td class="num">{formatYen(line.fixedRewardYen)}</td>
                <td class="num">{line.workMinutes}分</td>
                <td class="num">
                  {line.hourlyRateYen === null
                    ? "-"
                    : formatYen(line.hourlyRateYen)}
                </td>
                <td class="num">{formatYen(line.timedRewardYen)}</td>
                <td class="num">{formatYen(line.taxExcludedYen)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if lineWarnings.length}
        <div class="inline-alert">
          <strong>確認事項</strong>
          <ul>
            {#each lineWarnings as line (`${line.repository}#${line.issueNumber}`)}
              <li>
                {formatProjectName(line.repository)} #{line.issueNumber}:
                {line.warnings.join(" / ")}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>

    <section class="notice-section">
      <h2>稼働ログ</h2>
      {#if notice.document.workLogs.length === 0}
        <p class="muted">対象の稼働ログはありません。</p>
      {:else}
        <div class="table-wrap">
          <table class="notice-table">
            <thead>
              <tr>
                <th>対象Issue</th>
                <th>開始日時</th>
                <th>終了日時</th>
                <th class="num">稼働</th>
              </tr>
            </thead>
            <tbody>
              {#each notice.document.workLogs as log, index (`${log.repository}#${log.issueNumber}-${log.startedAt}-${index}`)}
                <tr>
                  <td>
                    {formatProjectName(log.repository)}
                    {formatIssueName(log.issueNumber, log.issueTitle)}
                  </td>
                  <td>{formatDateTime(log.startedAt)}</td>
                  <td>{log.endedAt ? formatDateTime(log.endedAt) : "-"}</td>
                  <td class="num">{log.workMinutes}分</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="notice-section notice-notes">
      <h2>注意書き</h2>
      <ul>
        <li>
          この通知書は管理者承認済みの月次精算スナップショットを元に作成したものです。
        </li>
        <li>
          通知書作成後に振込先情報や支払い予定日が変更されても、この通知書の表示内容は変更されません。
        </li>
        <li>
          この通知書には、銀行名・支店名・口座種別・口座番号・口座名義は表示しません。
        </li>
        <li>この通知書には、支払い済み状態や支払日は表示しません。</li>
      </ul>
    </section>
  </article>
{/if}

<style>
  .notice-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .notice-toolbar form {
    margin: 0;
  }
  .notice-hint {
    margin: -0.5rem 0 1rem;
    font-size: 0.8rem;
  }

  /* 1枚の書類として見せる。色はアプリのパレット(stone/slate)に合わせる。 */
  .notice-document {
    max-width: 48rem;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #d6d3d1;
    border-radius: 0.5rem;
    padding: 2.5rem;
  }
  .notice-head {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .notice-eyebrow {
    margin: 0 0 0.35rem;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .notice-head h1 {
    font-size: 1.7rem;
    letter-spacing: 0.2em;
  }
  .notice-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem 1.5rem;
    margin: 0 0 0.5rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid #e7e5e4;
  }
  .notice-meta > div,
  .notice-fields > div {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 0.5rem;
    align-items: baseline;
  }
  .notice-meta dt,
  .notice-fields dt {
    color: #64748b;
    font-size: 0.85rem;
  }
  .notice-meta dd,
  .notice-fields dd {
    margin: 0;
    font-weight: 600;
  }
  .notice-fields {
    display: grid;
    gap: 0.4rem;
    margin: 0;
  }
  .notice-fields .break {
    font-weight: 500;
    word-break: break-all;
  }
  .notice-section {
    margin-top: 1.75rem;
  }
  .notice-section h2 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
    padding-bottom: 0.3rem;
    border-bottom: 2px solid #334155;
  }

  /* 金額サマリー: コンパクトな枠付きテーブル + 税込を強調 */
  .notice-amounts {
    max-width: 26rem;
  }
  .notice-amounts th,
  .notice-amounts td {
    border: 1px solid #e7e5e4;
    padding: 0.5rem 0.75rem;
  }
  .notice-amounts th {
    width: 12rem;
    background: #fafaf9;
    font-weight: 600;
    color: #475569;
  }
  .notice-amounts td {
    text-align: right;
    font-weight: 600;
  }
  .notice-total th {
    color: #0f172a;
  }
  .notice-total th,
  .notice-total td {
    background: #f0fdf9;
    font-size: 1.05rem;
    font-weight: 700;
  }

  /* 明細・稼働ログ: 枠付きで読みやすく */
  .notice-table th,
  .notice-table td {
    border: 1px solid #e7e5e4;
    padding: 0.4rem 0.6rem;
    font-size: 0.82rem;
    vertical-align: top;
  }
  .notice-table thead th {
    background: #fafaf9;
    white-space: nowrap;
  }
  .num {
    text-align: right;
    white-space: nowrap;
  }
  .issue-sub {
    margin-top: 0.15rem;
    font-size: 0.72rem;
    color: #94a3b8;
    word-break: break-all;
  }
  .notice-notes ul {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.25rem;
    color: #475569;
    font-size: 0.85rem;
  }

  @media (max-width: 640px) {
    .notice-document {
      padding: 1.5rem;
    }
    .notice-meta {
      grid-template-columns: 1fr;
    }
    .notice-meta > div,
    .notice-fields > div {
      grid-template-columns: 6rem 1fr;
    }
  }

  @media print {
    :global(.topbar),
    :global(.breadcrumb) {
      display: none !important;
    }
    :global(.page-main) {
      width: auto !important;
      padding: 0 !important;
    }
    :global(body) {
      background: #fff !important;
    }
    .no-print {
      display: none !important;
    }
    .notice-document {
      border: none;
      border-radius: 0;
      padding: 0;
      max-width: none;
    }
    .notice-section {
      break-inside: avoid;
    }
  }
</style>
