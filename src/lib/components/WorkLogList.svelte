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
  import type { WorkSession } from "$lib/server/db/schema";
  import type { WorkSessionLock } from "$lib/server/work/workSessionLockRepository";
  let {
    sessions,
    locks,
    projectFetchError,
    openEditDialog,
    openExcludeDialog,
  }: {
    sessions: WorkSession[];
    locks: Record<string, WorkSessionLock>;
    projectFetchError: string | null;
    openEditDialog: (session: WorkSession) => void;
    openExcludeDialog: (session: WorkSession) => void;
  } = $props();
  const sorted = $derived([...sessions].sort(byUpdatedAtDescending));
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
          <th>操作</th>
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
            <td>{isMeasuring ? "計測中" : formatDateTime(session.endedAt)}</td>
            <td>
              {#if locks[session.id] === "submitted"}
                <span>月次確定申請済み・編集不可</span>
              {:else if locks[session.id] === "pending"}
                <span>稼働時刻の管理者の確認待ち</span>
                <a href="#change-requests-heading">申請を確認・取り消す</a>
              {:else if isMeasuring}
                <span class="muted">終了後に申請可</span>
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
  details {
    margin-top: 1rem;
  }
  summary {
    cursor: pointer;
    padding: 0.75rem 0;
    font-weight: 600;
  }
</style>
