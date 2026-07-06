<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDate } from "$lib/format";
  import type { MonthlyPaymentView } from "$lib/server/payments/paymentTypes";

  type Props = {
    payment: MonthlyPaymentView;
    isAdmin: boolean;
    message?: string;
    pendingAction: string | null;
    enhanceAction: (name: string) => SubmitFunction;
  };

  let { payment, isAdmin, message, pendingAction, enhanceAction }: Props =
    $props();

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
</script>

<section class="panel">
  <div class="payment-heading">
    <h2>支払い</h2>
    <span class="payment-badge {isPaid ? 'paid' : 'unpaid'}">
      {isPaid ? "支払い済み" : "未処理"}
    </span>
  </div>

  {#if message}
    <p class="notice" role="status">{message}</p>
  {/if}

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
                  {formatDate(payment.paidOn)} の支払い済み登録を取り消し、未処理に戻します。記録済みの支払日は削除されます。よろしいですか？
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
        {:else}
          <form
            method="POST"
            action="?/markPaid"
            use:enhance={enhanceAction("mark-paid")}
            class="payment-form"
          >
            <label>
              支払日
              <input type="date" name="paidOn" value={jstToday()} required />
            </label>
            <ActionSubmit
              actionName="mark-paid"
              {pendingAction}
              label="支払い済みにする"
              pendingLabel="登録中..."
            />
          </form>
        {/if}
      </div>

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
    </div>
  {/if}
</section>
