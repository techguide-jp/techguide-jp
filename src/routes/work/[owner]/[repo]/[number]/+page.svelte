<script lang="ts">
  import type { PageProps } from "./$types";
  import CopyIssueRequestButton from "$lib/components/CopyIssueRequestButton.svelte";
  import WorkIssueActions from "$lib/components/WorkIssueActions.svelte";
  import IssueDescription from "$lib/components/IssueDescription.svelte";
  import {
    formatDateTime,
    formatProjectName,
    formatWorkMinutes,
    requestedWorkMinutes,
  } from "$lib/format";
  import { isIssueCompleted } from "$lib/issueCompletion";
  import "$lib/styles/workIssueDetail.css";

  let { data, form }: PageProps = $props();
  const issue = $derived(data.issue);
  const complete = $derived(isIssueCompleted(issue));
  const reward = (amount: number | null): string =>
    amount === null ? "未設定" : `${amount.toLocaleString("ja-JP")}円`;
</script>

<svelte:head><title>{issue.title} | TechGuideの稼働精算</title></svelte:head>

<nav class="breadcrumb" aria-label="パンくず">
  <ol>
    <li>
      <a href={data.user?.isAdmin ? "/admin/work" : "/work"}
        >{data.user?.isAdmin ? "稼働管理" : "稼働"}</a
      >
    </li>
    <li><span>案件詳細</span></li>
  </ol>
</nav>

<section class="issue-detail-heading">
  <div>
    <p class="eyebrow">
      作業依頼 / {formatProjectName(issue.repository)} / #{issue.number}
    </p>
    <h1>{issue.title}</h1>
    <div class="issue-detail-meta">
      <span class={`status-badge ${complete ? "complete" : "neutral"}`}
        >{complete ? "完了確認済み" : (issue.status ?? "Status未設定")}</span
      ><span>担当：{issue.assignees.join("、") || "未設定"}</span><span
        >更新 {formatDateTime(issue.updatedAt ?? null)}</span
      >
    </div>
  </div>
  <CopyIssueRequestButton
    repository={issue.repository}
    number={issue.number}
    title={issue.title}
  />
</section>

<div class="issue-detail-grid">
  <div class="issue-detail-main">
    <section class="panel issue-content-panel">
      <div class="issue-section-heading">
        <h2>依頼内容</h2>
        <a href={issue.url} target="_blank" rel="noreferrer">GitHubで開く ↗</a>
      </div>
      {#if data.labels.length}<div class="issue-labels">
          {#each data.labels as label (label)}<span>{label}</span>{/each}
        </div>{/if}
      {#if data.descriptionError}<p class="alert" role="alert">
          {data.descriptionError}
        </p>
      {:else if data.body.trim()}<IssueDescription
          body={data.body}
          issueUrl={issue.url}
        />
      {:else}<p class="muted">
          依頼内容がまだ記載されていません。作業範囲・完了条件・期限を依頼者に確認してください。
        </p>{/if}
    </section>

    {#if data.isAssignee}<section class="panel issue-history-panel">
        <h2>あなたの稼働履歴</h2>
        {#if data.sessions.length}<div class="table-wrap">
            <table>
              <thead><tr><th>開始</th><th>終了</th><th>稼働時間</th></tr></thead
              ><tbody>
                {#each [...data.sessions]
                  .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                  .slice(0, 5) as session (session.id)}
                  {@const minutes = requestedWorkMinutes(
                    session.startedAt,
                    session.endedAt,
                  )}
                  <tr
                    ><td>{formatDateTime(session.startedAt)}</td><td
                      >{session.endedAt
                        ? formatDateTime(session.endedAt)
                        : "稼働中"}</td
                    ><td
                      >{session.excludedAt
                        ? "精算対象外"
                        : minutes === null
                          ? "計測中"
                          : formatWorkMinutes(minutes)}</td
                    ></tr
                  >
                {/each}
              </tbody>
            </table>
          </div>{:else}<p class="muted">まだ稼働記録はありません。</p>{/if}
        <a href="/work">すべての稼働ログ・追加／修正申請を見る →</a>
      </section>{/if}
  </div>

  <aside class="issue-detail-sidebar">
    <section class="panel issue-reward-panel">
      <p class="eyebrow">着手前に確認</p>
      <h2>報酬条件</h2>
      <dl>
        <div>
          <dt>報酬方式</dt>
          <dd>{issue.rewardMode ?? "未設定"}</dd>
        </div>
        <div class="issue-fixed-reward">
          <dt>固定報酬（税抜）</dt>
          <dd>{reward(issue.fixedRewardYen)}</dd>
        </div>
        {#if issue.rewardMode !== "固定"}<div>
            <dt>時間単価（税抜）</dt>
            <dd>{reward(issue.hourlyRateYen)}</dd>
          </div>
          <div>
            <dt>追加精算上限（税抜）</dt>
            <dd>{reward(issue.extraCapYen)}</dd>
          </div>{/if}
      </dl>
      <p class="issue-hint">
        {issue.rewardMode === "固定"
          ? "固定報酬の案件も、作業状況の確認のため稼働を記録してください。"
          : "追加精算上限は、このIssueの全期間・全担当者で共有する時間報酬の上限です。"}
      </p>
      {#if issue.rewardMode === null || issue.fixedRewardYen === null}<p
          class="alert"
        >
          報酬条件が未設定です。着手前に依頼者へ確認してください。
        </p>{/if}
    </section>

    <WorkIssueActions {data} message={form?.message} />
    <section class="panel issue-consult-panel">
      <h2>相談・変更があるとき</h2>
      <p class="issue-hint">
        作業範囲・期限・報酬の不明点は着手前に相談してください。決まった内容はIssueに残します。
      </p>
      <a href={issue.url} target="_blank" rel="noreferrer"
        >GitHubで質問・成果物を共有 ↗</a
      >
    </section>
  </aside>
</div>
