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
  <dl class="profile-details profile-details-clean">
    <div>
      <dt>支払い状態</dt>
      <dd>
        {#if payment.status === "paid"}
          <span class="ok">支払い済み</span>
        {:else}
          <span class="bad">未処理</span>
        {/if}
      </dd>
    </div>
    <div>
      <dt>支払日</dt>
      <dd>{formatDate(payment.paidOn)}</dd>
    </div>
    <div>
      <dt>支払い予定日</dt>
      <dd>
        {formatDate(payment.scheduledDate)}
        {#if payment.scheduledDateIsDefault}
          <small class="muted">（翌月14日・デフォルト）</small>
        {/if}
      </dd>
    </div>
  </dl>

  {#if isAdmin}
    <div class="payment-admin">
      {#if payment.status === "paid"}
        <form
          method="POST"
          action="?/revertPayment"
          use:enhance={enhanceAction("revert-payment")}
        >
          <ActionSubmit
            actionName="revert-payment"
            {pendingAction}
            label="支払い済みを取り消す"
            pendingLabel="取り消し中..."
            variant="danger"
          />
        </form>
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

      <form
        method="POST"
        action="?/updatePaymentSchedule"
        use:enhance={enhanceAction("update-payment-schedule")}
        class="payment-form"
      >
        <label>
          支払い予定日
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
          label="支払い予定日を保存"
          pendingLabel="保存中..."
          variant="secondary"
        />
        <small class="muted"
          >空欄で保存すると翌月14日（デフォルト）に戻ります。</small
        >
      </form>
    </div>
  {/if}
</section>
