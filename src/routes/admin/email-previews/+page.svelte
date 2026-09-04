<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime } from "$lib/format";
  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  const formResult = $derived(
    form as (ActionData & { scope?: string }) | undefined,
  );
  const previewMessage = $derived(
    formResult?.scope === "preview" ? formResult.message : undefined,
  );
  const deliveryMessage = $derived(
    formResult?.scope === "delivery" ? formResult.message : undefined,
  );

  const enhanceAction =
    (name: string): SubmitFunction =>
    () => {
      pendingAction = name;
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
  <p class="eyebrow">email notifications</p>
  <h1>メール通知</h1>
</section>

<section class="panel">
  <h2>運用状態</h2>
  <p>配送モード: <code>{data.deliveryMode}</code></p>
</section>

<section class="panel">
  <h2>ローカルプレビュー</h2>
  {#if previewMessage}<p class="notice" role="status">{previewMessage}</p>{/if}
  {#if data.deliveryMode === "preview"}
    <div class="test-preview-actions">
      <div>
        <h3>動作確認用プレビュー</h3>
        <p class="muted">
          業務データを変更せず、管理者本人を対象にPreviewファイルだけを生成します。
        </p>
      </div>
      <div class="button-row">
        <form
          method="POST"
          action="?/createTestPreview"
          use:enhance={enhanceAction("preview-settlement-submitted")}
        >
          <input type="hidden" name="type" value="settlement_submitted" />
          <ActionSubmit
            actionName="preview-settlement-submitted"
            {pendingAction}
            label="申請通知を生成"
            pendingLabel="生成中..."
            variant="secondary"
          />
        </form>
        <form
          method="POST"
          action="?/createTestPreview"
          use:enhance={enhanceAction("preview-settlement-approved")}
        >
          <input type="hidden" name="type" value="settlement_approved" />
          <ActionSubmit
            actionName="preview-settlement-approved"
            {pendingAction}
            label="承認通知を生成"
            pendingLabel="生成中..."
            variant="secondary"
          />
        </form>
        <form
          method="POST"
          action="?/createTestPreview"
          use:enhance={enhanceAction("preview-settlement-paid")}
        >
          <input type="hidden" name="type" value="settlement_paid" />
          <ActionSubmit
            actionName="preview-settlement-paid"
            {pendingAction}
            label="支払い通知を生成"
            pendingLabel="生成中..."
            variant="secondary"
          />
        </form>
      </div>
    </div>
  {/if}
  <form
    method="POST"
    action="?/cleanup"
    use:enhance={enhanceAction("cleanup-previews")}
  >
    <ActionSubmit
      actionName="cleanup-previews"
      {pendingAction}
      label="古いプレビューを削除"
      pendingLabel="削除中..."
      variant="secondary"
    />
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
    {#if deliveryMessage}<p class="notice" role="status">
        {deliveryMessage}
      </p>{/if}
    <form
      method="POST"
      action="?/reconcile"
      use:enhance={enhanceAction("reconcile-deliveries")}
    >
      <ActionSubmit
        actionName="reconcile-deliveries"
        {pendingAction}
        label="長時間送信中の配送を確認対象にする"
        pendingLabel="確認中..."
        variant="secondary"
      />
    </form>
    <p class="muted">
      15分以上「sending」の配送は、重複送信を避けるため再送せず「unknown」に変更します。
    </p>
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
              >{#if delivery.status === "pending" || delivery.status === "failed"}<form
                  method="POST"
                  action="?/retry"
                  use:enhance={enhanceAction(`retry-${delivery.id}`)}
                >
                  <input type="hidden" name="deliveryId" value={delivery.id} />
                  <ActionSubmit
                    actionName={`retry-${delivery.id}`}
                    {pendingAction}
                    label={delivery.status === "pending" ? "送信" : "再試行"}
                    pendingLabel="送信中..."
                    variant="secondary"
                  />
                </form>{:else}-{/if}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}
