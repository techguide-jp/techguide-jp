<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDate } from "$lib/format";
  import type { MonthlyPaymentView } from "$lib/server/payments/paymentTypes";

  type Props = {
    payment: MonthlyPaymentView;
    isAdmin: boolean;
    pendingAction: string | null;
    enhanceAction: (name: string) => SubmitFunction;
  };

  let { payment, isAdmin, pendingAction, enhanceAction }: Props = $props();

  const isPaid = $derived(payment.status === "paid");

  const jstToday = (): string =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
</script>

<section class="panel">
  <h2>支払い</h2>

  <div class="payment-summary">
    <span class="payment-badge {isPaid ? 'paid' : 'unpaid'}">
      {isPaid ? "支払い済み" : "未処理"}
    </span>
    <p class="payment-summary-text">
      {#if isPaid}
        {formatDate(payment.paidOn)} に支払い済みです。
      {:else}
        まだ支払われていません。支払い予定日は {formatDate(
          payment.scheduledDate,
        )} です。
      {/if}
    </p>
  </div>

  <dl class="profile-details profile-details-clean">
    <div>
      <dt>支払い予定日</dt>
      <dd>
        {formatDate(payment.scheduledDate)}
        {#if payment.scheduledDateIsDefault}
          <small class="muted">自動設定（対象月の翌月14日）</small>
        {:else}
          <small class="muted">個別設定</small>
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
          <p class="muted">誤って登録した場合は、未処理に戻せます。</p>
          <form
            method="POST"
            action="?/revertPayment"
            use:enhance={enhanceAction("revert-payment")}
          >
            <ActionSubmit
              actionName="revert-payment"
              {pendingAction}
              label="未処理に戻す"
              pendingLabel="取り消し中..."
              variant="danger"
            />
          </form>
        {:else}
          <p class="muted">支払いが完了したら、支払日を入力して登録します。</p>
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
