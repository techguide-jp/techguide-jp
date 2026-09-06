<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDate } from "$lib/format";
  import { PAYMENT_COMMENT_MAX_LENGTH } from "$lib/paymentComment";
  import type { MonthlyPaymentView } from "$lib/server/payments/paymentTypes";

  type Props = {
    payment: MonthlyPaymentView;
    paymentEditable: boolean;
    isAdmin: boolean;
    message?: string;
    paymentInput?: { paidOn: string; paymentComment: string };
    pendingAction: string | null;
    enhanceAction: (name: string) => SubmitFunction;
  };

  let {
    payment,
    paymentEditable,
    isAdmin,
    message,
    paymentInput,
    pendingAction,
    enhanceAction,
  }: Props = $props();

  const isPaid = $derived(payment.status === "paid");

  let showRevertConfirm = $state(false);

  const enhanceRevert: SubmitFunction = (input) => {
    const handleResult = enhanceAction("revert-payment")(input);
    return async (opts) => {
      if (typeof handleResult === "function") await handleResult(opts);
      if (opts.result.type === "success") showRevertConfirm = false;
    };
  };

  const jstToday = (): string =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  // bind:valueでhydration前の入力を引き継ぎ、失敗時はサーバーが返した入力を復元する。
  let paidOnInput = $derived(paymentInput?.paidOn ?? jstToday());
  let paymentCommentInput = $derived(paymentInput?.paymentComment ?? "");
</script>

<section class="panel">
  {#if message}
    <p class="notice" role="status">{message}</p>
  {/if}

  <div class="payment-heading">
    <h2>支払い</h2>
    <span class="payment-badge {isPaid ? 'paid' : 'unpaid'}">
      {isPaid ? "支払い済み" : "未処理"}
    </span>
  </div>

  <dl class="profile-details profile-details-clean">
    <div>
      <dt>支払い予定日</dt>
      <dd>
        {formatDate(payment.scheduledDate)}
        {#if payment.scheduledDateIsDefault}
          <small class="muted">自動設定（対象月の翌月14日）</small>
        {/if}
      </dd>
    </div>
    {#if isPaid}
      <div>
        <dt>支払日</dt>
        <dd>{formatDate(payment.paidOn)}</dd>
      </div>
      {#if payment.paymentComment}
        <div>
          <dt>作業者へのコメント</dt>
          <dd class="payment-comment">{payment.paymentComment}</dd>
        </div>
      {/if}
    {/if}
  </dl>

  {#if isAdmin}
    <div class="payment-admin">
      <div class="payment-action-group">
        <h3>支払い状態</h3>
        {#if isPaid}
          <button
            type="button"
            class="button danger"
            onclick={() => (showRevertConfirm = true)}
          >
            未処理に戻す
          </button>
          {#if showRevertConfirm}
            <div class="modal-backdrop">
              <div
                class="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="revert-confirm-title"
                style="width: min(28rem, 100%);"
              >
                <div class="modal-header">
                  <h2 id="revert-confirm-title">未処理に戻す</h2>
                  <button
                    class="icon-button"
                    type="button"
                    aria-label="閉じる"
                    onclick={() => (showRevertConfirm = false)}
                  >
                    ×
                  </button>
                </div>
                <p>
                  {formatDate(payment.paidOn)} の支払い済み登録を取り消し、未処理に戻します。記録済みの支払日と作業者へのコメントは削除されます。よろしいですか？
                </p>
                <form
                  method="POST"
                  action="?/revertPayment"
                  use:enhance={enhanceRevert}
                >
                  <div class="modal-actions">
                    <button
                      class="button secondary ghost"
                      type="button"
                      onclick={() => (showRevertConfirm = false)}
                    >
                      キャンセル
                    </button>
                    <ActionSubmit
                      actionName="revert-payment"
                      {pendingAction}
                      label="未処理に戻す"
                      pendingLabel="取り消し中..."
                      variant="danger"
                    />
                  </div>
                </form>
              </div>
            </div>
          {/if}
        {:else if paymentEditable}
          <form
            method="POST"
            action="?/markPaid"
            use:enhance={enhanceAction("mark-paid")}
            class="payment-form"
          >
            <label>
              支払日
              <input
                type="date"
                name="paidOn"
                bind:value={paidOnInput}
                required
              />
            </label>
            <label class="payment-comment-input">
              作業者へのコメント（任意）
              <textarea
                name="paymentComment"
                rows="4"
                maxlength={PAYMENT_COMMENT_MAX_LENGTH}
                bind:value={paymentCommentInput}
                aria-describedby="payment-comment-help"></textarea>
              <small id="payment-comment-help">
                このコメントは対象の作業者本人に表示されます。最大2,000文字。
              </small>
            </label>
            <ActionSubmit
              actionName="mark-paid"
              {pendingAction}
              label="支払い済みにする"
              pendingLabel="登録中..."
            />
          </form>
        {:else}
          <p class="muted">
            承認後に内容が変更されています。再承認後に支払い状態を更新できます。
          </p>
        {/if}
      </div>

      {#if paymentEditable}
        <div class="payment-action-group">
          <h3>支払い予定日</h3>
          <form
            method="POST"
            action="?/updatePaymentSchedule"
            use:enhance={enhanceAction("update-payment-schedule")}
            class="payment-form"
          >
            <label>
              予定日
              <input
                type="date"
                name="scheduledDate"
                value={payment.customScheduledDate ?? ""}
                placeholder={payment.scheduledDate}
              />
            </label>
            <ActionSubmit
              actionName="update-payment-schedule"
              {pendingAction}
              label="予定日を保存"
              pendingLabel="保存中..."
              variant="secondary"
            />
            <small class="muted"
              >空欄で保存すると、自動設定（翌月14日）に戻ります。</small
            >
          </form>
        </div>
      {/if}
    </div>
  {/if}
</section>
