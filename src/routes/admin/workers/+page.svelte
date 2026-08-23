<script lang="ts">
  import type { PageProps } from "./$types";
  import { formatDateTime } from "$lib/format";

  let { data }: PageProps = $props();
</script>

<section class="page-heading admin-work-heading">
  <div>
    <p class="eyebrow">registered workers</p>
    <h1>登録者一覧</h1>
    <p class="muted">
      登録者 {data.workers.length}名のプロフィールと連絡先を確認できます。
    </p>
  </div>
</section>

<section class="panel admin-work-section" data-tone="workers">
  {#if data.workers.length === 0}
    <p class="muted">登録者はいません。</p>
  {:else}
    <div class="table-wrap">
      <table class="worker-directory-table">
        <thead>
          <tr>
            <th scope="col">表示名</th>
            <th scope="col">GitHub ID</th>
            <th scope="col">Slack ID</th>
            <th scope="col">スキル</th>
            <th scope="col">更新日時</th>
            <th scope="col">詳細</th>
          </tr>
        </thead>
        <tbody>
          {#each data.workers as worker (worker.login)}
            <tr>
              <td>
                <a
                  class="worker-directory-name"
                  href={`/workers/${worker.login}`}
                >
                  {worker.displayName}
                </a>
              </td>
              <td><code>{worker.login}</code></td>
              <td>
                {#if worker.slackMemberId}
                  <code>{worker.slackMemberId}</code>
                {:else}
                  <span class="muted">未登録</span>
                {/if}
              </td>
              <td>
                {#if worker.skills.length}
                  <div class="chip-list">
                    {#each worker.skills as skill (skill)}
                      <span class="chip">{skill}</span>
                    {/each}
                  </div>
                {:else}
                  <span class="muted">未登録</span>
                {/if}
              </td>
              <td>{formatDateTime(worker.updatedAt)}</td>
              <td>
                <a
                  class="button secondary compact-button"
                  href={`/workers/${worker.login}`}>プロフィール</a
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
