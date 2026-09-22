<script lang="ts">
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";
  import {
    byUpdatedAtDescending,
    RECENT_WORK_LOG_COUNT,
  } from "$lib/workListDisplay";
  import type {
    WorkLogChangeRequest,
    WorkSession,
  } from "$lib/server/db/schema";
  import type { WorkSessionLock } from "$lib/server/work/workSessionLockRepository";
  let {
    sessions,
    requests,
    locks,
    projectFetchError,
    openEditDialog,
    openExcludeDialog,
  }: {
    sessions: WorkSession[];
    requests: WorkLogChangeRequest[];
    locks: Record<string, WorkSessionLock>;
    projectFetchError: string | null;
    openEditDialog: (session: WorkSession) => void;
    openExcludeDialog: (session: WorkSession) => void;
  } = $props();
  const sorted = $derived([...sessions].sort(byUpdatedAtDescending));
  // 時刻修正の承認と月次の確定は別段階。再申請が取り消されても、反映済みの承認は残る。
  const approvedSessionIds = $derived(
    new Set(
      requests
        .filter(
          (request) =>
            request.status === "approved" && request.requestType === "edit",
        )
        .map((request) => request.targetSessionId),
    ),
  );
</script>

{#snippet logTable(rows: WorkSession[])}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Issue</th>
          <th>更新日時</th>
          <th>開始</th>
          <th>終了</th>
          <th>状態</th>
          <th class="log-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as session (session.id)}
          {@const isMeasuring = !session.endedAt}
          <tr>
            <td>{formatProjectName(session.repository)}</td>
            <td>
              <a
                href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                {formatIssueName(session.issueNumber, session.issueTitle)}
              </a>
            </td>
            <td>{formatDateTime(session.updatedAt)}</td>
            <td>{formatDateTime(session.startedAt)}</td>
            <td>{isMeasuring ? "-" : formatDateTime(session.endedAt)}</td>
            <td>
              {#if locks[session.id] === "submitted"}
                <span class="status-badge complete">確定済み</span>
              {:else if locks[session.id] === "pending"}
                <span class="status-badge measuring">確認待ち</span>
              {:else if isMeasuring}
                <span class="status-badge reference">計測中</span>
              {:else if session.excludedAt}
                <span class="status-badge neutral">除外済み</span>
              {:else if approvedSessionIds.has(session.id)}
                <span class="status-badge complete">承認済み</span>
              {:else}
                <span class="status-badge neutral">記録済み</span>
              {/if}
            </td>
            <td class="log-actions">
              {#if locks[session.id] === "submitted" || isMeasuring}
                <span class="muted">-</span>
              {:else if locks[session.id] === "pending"}
                <a href="#change-requests-heading">申請を確認・取り消す</a>
              {:else}
                <div class="row-actions compact">
                  <button
                    class="button secondary"
                    type="button"
                    disabled={Boolean(projectFetchError)}
                    onclick={() => openEditDialog(session)}
                  >
                    修正
                  </button>
                  <button
                    class="button danger ghost"
                    type="button"
                    disabled={Boolean(projectFetchError)}
                    onclick={() => openExcludeDialog(session)}
                  >
                    除外
                  </button>
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<section class="panel" aria-labelledby="work-logs-heading">
  <h2 id="work-logs-heading">稼働ログ</h2>
  <p class="muted">
    更新日時が新しい順に最新{RECENT_WORK_LOG_COUNT}件を表示します。修正申請の確認待ち中と月次確定申請済みのログは編集できません。
  </p>
  {#if sessions.length === 0}
    <p class="muted">稼働ログはありません。</p>
  {:else}
    {@render logTable(sorted.slice(0, RECENT_WORK_LOG_COUNT))}
    {#if sorted.length > RECENT_WORK_LOG_COUNT}
      <details>
        <summary
          >過去の稼働ログを表示（{sorted.length -
            RECENT_WORK_LOG_COUNT}件）</summary
        >
        {@render logTable(sorted.slice(RECENT_WORK_LOG_COUNT))}
      </details>
    {/if}
  {/if}
</section>

<style>
  .log-actions {
    min-width: 10rem;
  }
  details {
    margin-top: 1rem;
  }
  summary {
    cursor: pointer;
    padding: 0.75rem 0;
    font-weight: 600;
  }
</style>
