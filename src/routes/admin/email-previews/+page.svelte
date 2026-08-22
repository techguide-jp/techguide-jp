<script lang="ts">
  import type { ActionData, PageProps } from "./$types";
  import { formatDateTime } from "$lib/format";
  let { data, form }: PageProps = $props();
  const actionMessage = $derived((form as ActionData | undefined)?.message);
</script>

<section class="page-heading">
  <p class="eyebrow">email notifications</p>
  <h1>メール通知</h1>
</section>

{#if actionMessage}<p class="notice" role="status">{actionMessage}</p>{/if}

<section class="panel">
  <h2>運用状態</h2>
  <p>配送モード: <code>{data.deliveryMode}</code></p>
</section>

<section class="panel">
  <h2>ローカルプレビュー</h2>
  {#if data.deliveryMode === "preview"}
    <div class="test-preview-actions">
      <div>
        <h3>動作確認用プレビュー</h3>
        <p class="muted">
          業務データを変更せず、管理者本人を対象にPreviewファイルだけを生成します。
        </p>
      </div>
      <div class="button-row">
        <form method="POST" action="?/createTestPreview">
          <input type="hidden" name="type" value="settlement_submitted" />
          <button type="submit" class="secondary">申請通知を生成</button>
        </form>
        <form method="POST" action="?/createTestPreview">
          <input type="hidden" name="type" value="settlement_approved" />
          <button type="submit" class="secondary">承認通知を生成</button>
        </form>
        <form method="POST" action="?/createTestPreview">
          <input type="hidden" name="type" value="settlement_paid" />
          <button type="submit" class="secondary">支払い通知を生成</button>
        </form>
      </div>
    </div>
  {/if}
  <form method="POST" action="?/cleanup">
    <button type="submit" class="secondary">古いプレビューを削除</button>
  </form>
  {#if data.previews.length === 0}
    <p class="muted">保存済みプレビューはありません。</p>
  {:else}
    <table>
      <thead
        ><tr><th>生成日時</th><th>種別</th><th>宛先</th><th>件名</th></tr
        ></thead
      >
      <tbody>
        {#each data.previews as preview (preview.id)}
          <tr>
            <td>{formatDateTime(preview.createdAt)}</td>
            <td>{preview.type}</td>
            <td
              >{preview.recipientEmail ??
                `${preview.recipientLogin}（未同期）`}</td
            >
            <td
              ><a href={`/admin/email-previews/${preview.id}`}
                >{preview.subject}</a
              ></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

{#if data.deliveries.length > 0}
  <section class="panel">
    <h2>配送履歴</h2>
    <table>
      <thead
        ><tr
          ><th>日時</th><th>宛先</th><th>状態</th><th>試行</th><th>エラー</th
          ><th>操作</th></tr
        ></thead
      >
      <tbody>
        {#each data.deliveries as delivery (delivery.id)}
          <tr>
            <td>{formatDateTime(delivery.createdAt)}</td>
            <td
              >{delivery.recipientEmail ??
                `${delivery.recipientLogin}（未同期）`}</td
            >
            <td>{delivery.status}</td><td>{delivery.attemptCount}</td>
            <td>{delivery.errorCode ?? "-"}</td>
            <td
              >{#if delivery.status === "failed"}<form
                  method="POST"
                  action="?/retry"
                >
                  <input
                    type="hidden"
                    name="deliveryId"
                    value={delivery.id}
                  /><button type="submit" class="secondary">再試行</button>
                </form>{:else}-{/if}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}
