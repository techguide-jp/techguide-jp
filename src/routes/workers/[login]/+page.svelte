<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import WorkerPreferencesPanel from "$lib/components/WorkerPreferencesPanel.svelte";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import CopyLoginButton from "$lib/components/CopyLoginButton.svelte";
  import FormFeedback from "$lib/components/FormFeedback.svelte";
  import { formatDateTime } from "$lib/format";
  import { WORKER_PAYOUT_ACCOUNT_ANCHOR } from "$lib/workerProfileRoute";

  let { data, form }: PageProps = $props();
  type Profile = PageProps["data"]["profile"];

  const initialProfile = () => data.profile;
  const dateKey = (value: Date | string | null): string => {
    if (!value) return "";
    return typeof value === "string" ? value : value.toISOString();
  };
  // 希望だけの更新で、編集中の基本プロフィールを再初期化しない。
  const profileKey = (profile: Profile): string =>
    JSON.stringify([
      profile.login,
      profile.displayName,
      profile.slackMemberId,
      profile.skills,
      profile.specialtyNote,
      profile.adminNote,
      dateKey(profile.adminNoteUpdatedAt),
    ]);

  let pendingAction = $state<string | null>(null);
  let displayName = $state(initialProfile().displayName);
  let slackMemberId = $state(initialProfile().slackMemberId);
  let skills = $state<string[]>(initialProfile().skills);
  let skillDraft = $state("");
  let specialtyNote = $state(initialProfile().specialtyNote);
  let adminNote = $state(initialProfile().adminNote);
  let syncedProfileKey = $state(profileKey(initialProfile()));

  type PayoutAccount = NonNullable<PageProps["data"]["payoutAccount"]>;
  const initialPayoutAccount = (): PayoutAccount =>
    data.payoutAccount ?? {
      registered: false,
      loadError: false,
      recipientName: "",
      postalCode: "",
      address: "",
      bankName: "",
      branchName: "",
      accountType: "ordinary",
      accountTypeLabel: "普通",
      accountNumber: "",
      accountHolderName: "",
      note: "",
      updatedBy: null,
      updatedAt: null,
      version: 0,
    };
  const payoutAccountKey = (account: PayoutAccount): string =>
    [
      account.registered ? "1" : "0",
      account.loadError ? "1" : "0",
      account.version,
      dateKey(account.updatedAt),
      account.recipientName,
      account.postalCode,
      account.address,
      account.bankName,
      account.branchName,
      account.accountType,
      account.accountNumber,
      account.accountHolderName,
      account.note,
    ].join(":");
  let recipientName = $state(initialPayoutAccount().recipientName);
  let postalCode = $state(initialPayoutAccount().postalCode);
  let address = $state(initialPayoutAccount().address);
  let bankName = $state(initialPayoutAccount().bankName);
  let branchName = $state(initialPayoutAccount().branchName);
  let accountType = $state(initialPayoutAccount().accountType);
  let accountNumber = $state(initialPayoutAccount().accountNumber);
  let accountHolderName = $state(initialPayoutAccount().accountHolderName);
  let payoutNote = $state(initialPayoutAccount().note);
  let payoutVersion = $state(initialPayoutAccount().version);
  let syncedPayoutAccountKey = $state(payoutAccountKey(initialPayoutAccount()));

  const payoutAccountSyncKey = $derived(
    data.payoutAccount ? payoutAccountKey(data.payoutAccount) : "",
  );

  const profileSyncKey = $derived(profileKey(data.profile));
  const skillsFieldValue = $derived(skills.join("\n"));
  const headingDisplayName = $derived(
    data.canEditSelf
      ? displayName || data.profile.login
      : data.profile.displayName,
  );

  $effect(() => {
    if (syncedProfileKey === profileSyncKey) return;
    syncedProfileKey = profileSyncKey;
    displayName = data.profile.displayName;
    slackMemberId = data.profile.slackMemberId;
    skills = data.profile.skills;
    skillDraft = "";
    specialtyNote = data.profile.specialtyNote;
    adminNote = data.profile.adminNote;
  });

  $effect(() => {
    if (
      !data.payoutAccount ||
      syncedPayoutAccountKey === payoutAccountSyncKey
    ) {
      return;
    }
    syncedPayoutAccountKey = payoutAccountSyncKey;
    recipientName = data.payoutAccount.recipientName;
    postalCode = data.payoutAccount.postalCode;
    address = data.payoutAccount.address;
    bankName = data.payoutAccount.bankName;
    branchName = data.payoutAccount.branchName;
    accountType = data.payoutAccount.accountType;
    accountNumber = data.payoutAccount.accountNumber;
    accountHolderName = data.payoutAccount.accountHolderName;
    payoutNote = data.payoutAccount.note;
    payoutVersion = data.payoutAccount.version;
  });

  const mergeSkills = (currentSkills: string[], value: string): string[] => {
    const next = [...currentSkills];
    for (const rawSkill of value.split(/[\n,]/)) {
      const skill = rawSkill.trim();
      const key = skill.toLocaleLowerCase();
      if (
        !skill ||
        next.some((currentSkill) => currentSkill.toLocaleLowerCase() === key)
      ) {
        continue;
      }
      next.push(skill.slice(0, 60));
      if (next.length >= 30) break;
    }
    return next;
  };

  const addSkillDraft = () => {
    const next = mergeSkills(skills, skillDraft);
    if (next.length === skills.length) return;
    skills = next;
    skillDraft = "";
  };

  const removeSkill = (targetSkill: string) => {
    skills = skills.filter((skill) => skill !== targetSkill);
  };

  const handleSkillKeydown = (event: {
    key: string;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    event.stopPropagation();
    addSkillDraft();
  };

  const sanitizeAccountNumberInput = (value: string): string =>
    value.normalize("NFKC").replace(/\D/g, "").slice(0, 7);

  const sanitizePostalCodeInput = (value: string): string =>
    value.normalize("NFKC").replace(/\D/g, "").slice(0, 7);

  const enhanceAction =
    (name: string): SubmitFunction =>
    ({ formData }) => {
      if (name === "save-self-profile") {
        const nextSkills = mergeSkills(skills, skillDraft);
        skills = nextSkills;
        skillDraft = "";
        formData.set("skills", nextSkills.join("\n"));
      }
      if (name === "save-payout-account") {
        const normalizedPostalCode = sanitizePostalCodeInput(postalCode);
        postalCode = normalizedPostalCode;
        formData.set("postalCode", normalizedPostalCode);
        const normalizedAccountNumber =
          sanitizeAccountNumberInput(accountNumber);
        accountNumber = normalizedAccountNumber;
        formData.set("accountNumber", normalizedAccountNumber);
      }
      pendingAction = name;
      return async ({ update }) => {
        await update();
        pendingAction = null;
      };
    };

  const feedbackFor = (
    actionName: "saveSelfProfile" | "saveAdminNote" | "savePayoutAccount",
  ): { messages: string[]; isError: boolean } | null => {
    const data = form as ActionData | undefined;
    if (!data || !("actionName" in data) || data.actionName !== actionName)
      return null;
    const messages =
      data.messages ??
      ("message" in data && data.message ? [data.message] : []);
    if (messages.length === 0) return null;
    return { messages, isError: data.outcome === "error" };
  };

  const profileFeedback = $derived(feedbackFor("saveSelfProfile"));
  const adminFeedback = $derived(feedbackFor("saveAdminNote"));
  const payoutFeedback = $derived(feedbackFor("savePayoutAccount"));

  let profileFeedbackEl = $state<HTMLElement | null>(null);
  let adminFeedbackEl = $state<HTMLElement | null>(null);
  let payoutFeedbackEl = $state<HTMLElement | null>(null);

  const scrollFeedbackIntoView = (element: HTMLElement | null) => {
    element?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  $effect(() => {
    if (profileFeedback) scrollFeedbackIntoView(profileFeedbackEl);
  });
  $effect(() => {
    if (adminFeedback) scrollFeedbackIntoView(adminFeedbackEl);
  });
  $effect(() => {
    if (payoutFeedback) scrollFeedbackIntoView(payoutFeedbackEl);
  });
</script>

<section class="page-heading profile-heading">
  <div>
    <p class="eyebrow">worker profile</p>
    <h1>{headingDisplayName}</h1>
    <div class="profile-identity">
      <code>{data.profile.login}</code>
      <CopyLoginButton login={data.profile.login} />
    </div>
  </div>
  <div class="profile-status">
    {#if data.canEditSelf}
      本人編集
    {:else if data.canEditAdminNote}
      管理者閲覧
    {:else}
      閲覧
    {/if}
  </div>
</section>

{#if data.canEditSelf}
  <section class="panel">
    <h2>メール通知先</h2>
    {#if data.notificationContact}
      <p><strong>{data.notificationContact.email}</strong></p>
      <p class="muted">
        GitHub の認証済みプライマリメールから同期・ 最終同期: {formatDateTime(
          data.notificationContact.syncedAt,
        )}
      </p>
    {:else}
      <p class="notice">通知先はまだ同期されていません。</p>
    {/if}
    <p class="muted">
      GitHub
      側でメールアドレスを変更した場合は、一度ログアウトして再ログインすると更新されます。
    </p>
  </section>
{/if}

<WorkerPreferencesPanel
  preferences={data.preferences}
  canEdit={data.canEditSelf}
  result={form}
/>

<div class="profile-layout">
  <section class="profile-panel">
    <div class="profile-panel-heading">
      <div>
        <p class="eyebrow">profile</p>
        <h2>プロフィール</h2>
      </div>
      {#if data.profile.updatedAt}
        <p class="muted">更新 {formatDateTime(data.profile.updatedAt)}</p>
      {/if}
    </div>

    <FormFeedback feedback={profileFeedback} bind:element={profileFeedbackEl} />

    {#if data.canEditSelf}
      <form
        method="POST"
        action="?/saveSelfProfile"
        use:enhance={enhanceAction("save-self-profile")}
        class="profile-editor"
      >
        <label class="profile-field">
          <span>表示名</span>
          <input
            name="displayName"
            bind:value={displayName}
            maxlength="100"
            required
            autocomplete="name"
          />
        </label>

        <label class="profile-field">
          <span>SlackメンバーID（任意）</span>
          <input
            name="slackMemberId"
            bind:value={slackMemberId}
            maxlength="64"
            placeholder="U0123456789"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            aria-describedby="slack-member-id-hint"
          />
          <small id="slack-member-id-hint" class="field-hint">
            Slackのプロフィールで「メンバーIDをコピー」して貼り付けてください。
          </small>
        </label>

        <div class="profile-field profile-field-wide">
          <div class="profile-field-label" id="skills-label">スキル</div>
          <input type="hidden" name="skills" value={skillsFieldValue} />
          <div class="skill-entry">
            <input
              aria-labelledby="skills-label"
              bind:value={skillDraft}
              maxlength="120"
              onkeydown={(event) => handleSkillKeydown(event)}
              placeholder="SvelteKit, TypeScript"
            />
            <button
              class="button secondary compact-button"
              type="button"
              onclick={addSkillDraft}
              disabled={!skillDraft.trim()}>追加</button
            >
          </div>
          <div class="skill-chip-list" aria-live="polite">
            {#if skills.length}
              {#each skills as skill (skill)}
                <button
                  class="skill-chip"
                  type="button"
                  onclick={() => removeSkill(skill)}
                  aria-label={`${skill} を削除`}
                >
                  <span>{skill}</span>
                  <span aria-hidden="true">×</span>
                </button>
              {/each}
            {:else}
              <span class="muted">未登録</span>
            {/if}
          </div>
        </div>

        <div class="profile-note-grid">
          <label class="profile-field">
            <span>得意領域</span>
            <textarea
              name="specialtyNote"
              rows="5"
              maxlength="2000"
              bind:value={specialtyNote}
              placeholder="管理画面、SvelteKit、DB設計"></textarea>
          </label>
        </div>

        <div class="form-actions profile-actions">
          <ActionSubmit
            actionName="save-self-profile"
            {pendingAction}
            label="プロフィールを保存"
            pendingLabel="保存中..."
          />
        </div>
      </form>
    {:else}
      <dl class="profile-details profile-details-clean">
        <div>
          <dt>表示名</dt>
          <dd>{data.profile.displayName}</dd>
        </div>
        <div>
          <dt>SlackメンバーID</dt>
          <dd>{data.profile.slackMemberId || "未登録"}</dd>
        </div>
        <div>
          <dt>スキル</dt>
          <dd>
            {#if data.profile.skills.length}
              <div class="chip-list">
                {#each data.profile.skills as skill (skill)}
                  <span class="chip">{skill}</span>
                {/each}
              </div>
            {:else}
              <span class="muted">未登録</span>
            {/if}
          </dd>
        </div>
        <div>
          <dt>得意領域</dt>
          <dd>{data.profile.specialtyNote || "-"}</dd>
        </div>
      </dl>
    {/if}
  </section>

  {#if data.canEditAdminNote}
    <aside class="profile-panel profile-side-panel">
      <div class="profile-panel-heading">
        <div>
          <p class="eyebrow">admin</p>
          <h2>管理者メモ</h2>
        </div>
      </div>
      <FormFeedback feedback={adminFeedback} bind:element={adminFeedbackEl} />
      <form
        method="POST"
        action="?/saveAdminNote"
        use:enhance={enhanceAction("save-admin-note")}
        class="profile-admin-form"
      >
        <label class="profile-field">
          <span>メモ</span>
          <textarea
            name="adminNote"
            rows="8"
            maxlength="2000"
            bind:value={adminNote}
            placeholder="割り振り時に見たい補足"></textarea>
        </label>
        {#if data.profile.adminNoteUpdatedBy && data.profile.adminNoteUpdatedAt}
          <p class="muted">
            最終更新: {formatDateTime(data.profile.adminNoteUpdatedAt)} / {data
              .profile.adminNoteUpdatedBy}
          </p>
        {/if}
        <div class="form-actions profile-actions">
          <ActionSubmit
            actionName="save-admin-note"
            {pendingAction}
            label="管理者メモを保存"
            pendingLabel="保存中..."
            variant="secondary"
          />
        </div>
      </form>
    </aside>
  {/if}
</div>

{#if data.payoutAccount}
  <section class="profile-panel payout-panel" id={WORKER_PAYOUT_ACCOUNT_ANCHOR}>
    <div class="profile-panel-heading">
      <div>
        <p class="eyebrow">payout account</p>
        <h2>振込先情報</h2>
        <p class="payout-panel-lead">
          支払い振込に使用する宛先と口座です。通帳またはネットバンキングの表示どおりに入力してください。
        </p>
      </div>
      <div class="payout-panel-meta">
        <span
          class="payout-status-badge"
          data-registered={data.payoutAccount.registered}
          data-load-error={data.payoutAccount.loadError}
        >
          {data.payoutAccount.loadError
            ? "読込エラー"
            : data.payoutAccount.registered
              ? "登録済み"
              : "未登録"}
        </span>
        {#if data.payoutAccount.updatedAt}
          <p class="muted">
            最終更新 {formatDateTime(data.payoutAccount.updatedAt)}
            {#if data.payoutAccount.updatedBy}
              / {data.payoutAccount.updatedBy}
            {/if}
          </p>
        {/if}
      </div>
    </div>

    <FormFeedback feedback={payoutFeedback} bind:element={payoutFeedbackEl} />

    {#if data.payoutAccount.loadError}
      <p class="form-error" role="alert">
        振込先情報を読み込めませんでした。管理者にお問い合わせください。
      </p>
    {:else if data.canEditPayoutAccount}
      <form
        method="POST"
        action="?/savePayoutAccount"
        use:enhance={enhanceAction("save-payout-account")}
        class="payout-form"
      >
        <input type="hidden" name="version" value={payoutVersion} />

        <section
          class="payout-section"
          aria-labelledby="payout-recipient-heading"
        >
          <h3 id="payout-recipient-heading" class="payout-section-title">
            1. 振込先の宛先
          </h3>
          <label class="profile-field">
            <span>宛名（名前・屋号・会社名）</span>
            <input
              name="recipientName"
              bind:value={recipientName}
              maxlength="100"
              required
              autocomplete="name"
              placeholder="例: 山田 太郎 / 株式会社テックガイド"
            />
          </label>
          <label class="profile-field payout-postal-field">
            <span>郵便番号</span>
            <input
              name="postalCode"
              bind:value={postalCode}
              maxlength="8"
              inputmode="numeric"
              required
              autocomplete="postal-code"
              placeholder="1234567"
              oninput={(event) => {
                postalCode = sanitizePostalCodeInput(event.currentTarget.value);
              }}
            />
          </label>
          <span class="field-hint">半角数字7桁。ハイフンは不要です。</span>
          <label class="profile-field">
            <span>住所</span>
            <textarea
              name="address"
              rows="3"
              maxlength="500"
              required
              bind:value={address}
              autocomplete="street-address"
              placeholder="例: 東京都渋谷区 1-2-3 テックビル 4F"></textarea>
          </label>
          <span class="field-hint"
            >複数行可。建物名・部屋番号まで入力してください。</span
          >
        </section>

        <section class="payout-section" aria-labelledby="payout-bank-heading">
          <h3 id="payout-bank-heading" class="payout-section-title">
            2. 銀行・支店
          </h3>
          <div class="payout-section-grid">
            <label class="profile-field">
              <span>金融機関名</span>
              <input
                name="bankName"
                bind:value={bankName}
                maxlength="100"
                required
                autocomplete="organization"
                placeholder="例: 三菱UFJ銀行"
              />
            </label>
            <label class="profile-field">
              <span>支店名</span>
              <input
                name="branchName"
                bind:value={branchName}
                maxlength="100"
                required
                placeholder="例: 渋谷支店"
              />
            </label>
          </div>
        </section>

        <section
          class="payout-section"
          aria-labelledby="payout-account-heading"
        >
          <h3 id="payout-account-heading" class="payout-section-title">
            3. 口座
          </h3>
          <div class="payout-section-grid">
            <label class="profile-field">
              <span>口座種別</span>
              <select name="accountType" bind:value={accountType} required>
                <option value="ordinary">普通</option>
                <option value="checking">当座</option>
                <option value="savings">貯蓄</option>
              </select>
            </label>
            <div class="payout-field-column">
              <label class="profile-field">
                <span>口座番号</span>
                <input
                  name="accountNumber"
                  bind:value={accountNumber}
                  maxlength="7"
                  inputmode="numeric"
                  required
                  autocomplete="off"
                  placeholder="0123456"
                  oninput={(event) => {
                    accountNumber = sanitizeAccountNumberInput(
                      event.currentTarget.value,
                    );
                  }}
                />
              </label>
              <span class="field-hint">半角数字7桁。先頭ゼロあり。</span>
            </div>
          </div>
          <label class="profile-field">
            <span>口座名義</span>
            <input
              name="accountHolderName"
              bind:value={accountHolderName}
              maxlength="100"
              required
              autocomplete="off"
              placeholder="ヤマダ タロウ"
            />
          </label>
          <span class="field-hint"
            >全角カタカナ。姓と名の間はスペース推奨。</span
          >
          <p class="payout-section-note">
            ゆうちょ銀行の記号・番号はそのまま入力せず、他行から振込用に変換した支店名・7桁口座番号を使ってください。
          </p>
        </section>

        <section class="payout-section" aria-labelledby="payout-note-heading">
          <h3 id="payout-note-heading" class="payout-section-title">
            4. 補足（任意）
          </h3>
          <label class="profile-field">
            <span>補足メモ</span>
            <textarea
              name="note"
              rows="3"
              maxlength="2000"
              bind:value={payoutNote}
              placeholder="例: ゆうちょから他行振込用に変換した口座"></textarea>
          </label>
        </section>

        <div class="form-actions profile-actions">
          <ActionSubmit
            actionName="save-payout-account"
            {pendingAction}
            label="振込先情報を保存"
            pendingLabel="保存中..."
          />
        </div>
      </form>
    {:else if data.payoutAccount.registered}
      <div class="payout-section">
        <dl class="profile-details profile-details-clean">
          <div>
            <dt>宛名</dt>
            <dd>{data.payoutAccount.recipientName}</dd>
          </div>
          <div>
            <dt>郵便番号</dt>
            <dd>{data.payoutAccount.postalCode}</dd>
          </div>
          <div>
            <dt>住所</dt>
            <dd class="payout-address-value">{data.payoutAccount.address}</dd>
          </div>
          <div>
            <dt>金融機関名</dt>
            <dd>{data.payoutAccount.bankName}</dd>
          </div>
          <div>
            <dt>支店名</dt>
            <dd>{data.payoutAccount.branchName}</dd>
          </div>
          <div>
            <dt>口座種別</dt>
            <dd>{data.payoutAccount.accountTypeLabel}</dd>
          </div>
          <div>
            <dt>口座番号</dt>
            <dd>{data.payoutAccount.accountNumber}</dd>
          </div>
          <div>
            <dt>口座名義</dt>
            <dd>{data.payoutAccount.accountHolderName}</dd>
          </div>
          <div>
            <dt>補足メモ</dt>
            <dd>{data.payoutAccount.note || "-"}</dd>
          </div>
        </dl>
      </div>
    {:else}
      <p class="muted">振込先情報は未登録です。</p>
    {/if}
  </section>
{/if}
