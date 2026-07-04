<script lang="ts">
  import { page } from "$app/state";
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import CopyLoginButton from "$lib/components/CopyLoginButton.svelte";
  import { formatDateTime } from "$lib/format";
  import { WORKER_PAYOUT_ACCOUNT_ANCHOR } from "$lib/workerProfileRoute";

  let { data, form }: PageProps = $props();
  type Profile = PageProps["data"]["profile"];

  const initialProfile = () => data.profile;
  const dateKey = (value: Date | string | null): string => {
    if (!value) return "";
    return typeof value === "string" ? value : value.toISOString();
  };
  const profileKey = (profile: Profile): string =>
    [
      profile.login,
      dateKey(profile.updatedAt),
      dateKey(profile.adminNoteUpdatedAt),
    ].join(":");

  let pendingAction = $state<string | null>(null);
  let displayName = $state(initialProfile().displayName);
  let skills = $state<string[]>(initialProfile().skills);
  let skillDraft = $state("");
  let specialtyNote = $state(initialProfile().specialtyNote);
  let availabilityNote = $state(initialProfile().availabilityNote);
  let selfAssignmentNote = $state(initialProfile().selfAssignmentNote);
  let adminNote = $state(initialProfile().adminNote);
  let syncedProfileKey = $state(profileKey(initialProfile()));
  let isPreferenceExamplesOpen = $state(false);

  type PayoutAccount = NonNullable<PageProps["data"]["payoutAccount"]>;
  const initialPayoutAccount = (): PayoutAccount =>
    data.payoutAccount ?? {
      registered: false,
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
      account.version,
      dateKey(account.updatedAt),
      account.bankName,
      account.branchName,
      account.accountType,
      account.accountNumber,
      account.accountHolderName,
      account.note,
    ].join(":");
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
  const preferenceExampleGroups = [
    {
      title: "触ってみたい技術",
      examples: [
        "SvelteKit / Svelte 5 の画面実装を増やしたい",
        "AI API / LLM 連携の実装に挑戦したい",
        "Drizzle / PostgreSQL の設計やクエリ改善を触りたい",
        "Playwright / Vitest でテスト整備を担当したい",
        "Vercel / CI/CD 周りの改善を経験したい",
        "TypeScript の型設計や安全なリファクタリングを深めたい",
        "認証・権限管理まわりの実装に関わりたい",
        "GitHub API など外部サービス連携を触りたい",
        "管理画面やダッシュボードの集計UIを作りたい",
        "アクセシビリティやフォームの使いやすさを改善したい",
        "パフォーマンス改善や不要な再取得の削減をやりたい",
        "DB migration やデータ整合性の検証を経験したい",
      ],
    },
    {
      title: "任されたい仕事",
      examples: [
        "小さめのUI改善から入り、慣れたら画面全体を任されたい",
        "仕様が曖昧な箇所を整理しながら実装したい",
        "既存機能のバグ調査と修正がやりやすい",
        "管理画面や運用を楽にする機能に関わりたい",
        "Issue の背景調査から実装方針の整理まで担当したい",
        "既存画面の使いにくい部分を見つけて改善したい",
        "テストが薄い機能にテストを足しながら直したい",
        "レビュー指摘の修正や仕上げの品質改善を担当したい",
        "DB schema 変更を含む小さめの機能追加をやりたい",
        "ログやエラー内容を見ながら原因調査する仕事が向いている",
        "ユーザー向けの文言や入力導線の改善も担当したい",
        "新規機能より既存運用の詰まりを解消する仕事がやりやすい",
      ],
    },
    {
      title: "進め方",
      examples: [
        "最初に目的・完了条件・確認方法を揃えてから進めたい",
        "途中で早めにレビューをもらえると進めやすい",
        "詰まったら早めに相談し、方向性を合わせたい",
        "まとまった作業時間を確保して一気に進めたい",
      ],
    },
    {
      title: "稼働条件",
      examples: [
        "平日夜を中心に対応しやすい",
        "短納期より、事前にスコープが見えているタスクがやりやすい",
        "緊急対応は事前に相談できると動きやすい",
        "レビュー待ちや仕様待ちの間に別タスクも並行できる",
      ],
    },
  ];

  $effect(() => {
    if (syncedProfileKey === profileSyncKey) return;
    syncedProfileKey = profileSyncKey;
    displayName = data.profile.displayName;
    skills = data.profile.skills;
    skillDraft = "";
    specialtyNote = data.profile.specialtyNote;
    availabilityNote = data.profile.availabilityNote;
    selfAssignmentNote = data.profile.selfAssignmentNote;
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

  const hasPreferenceExample = (example: string): boolean =>
    selfAssignmentNote
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes(example);

  const appendPreferenceExample = (example: string) => {
    if (hasPreferenceExample(example)) return;
    selfAssignmentNote = [selfAssignmentNote.trim(), example]
      .filter(Boolean)
      .join("\n");
  };

  const sanitizeAccountNumberInput = (value: string): string =>
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

  const actionMessage = $derived((form as ActionData | undefined)?.message);
  const actionIsError = $derived(
    (form as ActionData | undefined)?.outcome === "error",
  );

  $effect(() => {
    if (page.url.hash !== `#${WORKER_PAYOUT_ACCOUNT_ANCHOR}`) return;
    if (!data.payoutAccount) return;
    queueMicrotask(() => {
      document
        .getElementById(WORKER_PAYOUT_ACCOUNT_ANCHOR)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

{#if actionMessage}
  <p
    class={actionIsError ? "form-error" : "notice"}
    role={actionIsError ? "alert" : "status"}
  >
    {actionMessage}
  </p>
{/if}

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
          <label class="profile-field">
            <span>稼働目安</span>
            <textarea
              name="availabilityNote"
              rows="5"
              maxlength="2000"
              bind:value={availabilityNote}
              placeholder="平日夜、週5時間程度"></textarea>
          </label>
        </div>

        <div class="profile-field profile-field-wide">
          <div class="profile-field-header">
            <label for="self-assignment-note">仕事の進め方・希望</label>
            <button
              class="preference-example-trigger"
              type="button"
              onclick={() => (isPreferenceExamplesOpen = true)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 3v18" />
                <path d="M5 8h14" />
                <path d="M5 16h14" />
              </svg>
              希望例
            </button>
          </div>
          <textarea
            id="self-assignment-note"
            name="selfAssignmentNote"
            rows="5"
            maxlength="2000"
            bind:value={selfAssignmentNote}
            placeholder="集中しやすいタスク、相談したい条件、避けたい進め方など"
          ></textarea>
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
        <div>
          <dt>稼働目安</dt>
          <dd>{data.profile.availabilityNote || "-"}</dd>
        </div>
        <div>
          <dt>仕事の進め方・希望</dt>
          <dd>{data.profile.selfAssignmentNote || "-"}</dd>
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
          支払い振込に使用する口座です。通帳またはネットバンキングの振込先表示どおりに入力してください。
        </p>
      </div>
      <div class="payout-panel-meta">
        <span
          class="payout-status-badge"
          data-registered={data.payoutAccount.registered}
        >
          {data.payoutAccount.registered ? "登録済み" : "未登録"}
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

    {#if data.canEditPayoutAccount}
      <form
        method="POST"
        action="?/savePayoutAccount"
        use:enhance={enhanceAction("save-payout-account")}
        class="payout-form"
      >
        <input type="hidden" name="version" value={payoutVersion} />

        <section class="payout-section" aria-labelledby="payout-bank-heading">
          <h3 id="payout-bank-heading" class="payout-section-title">
            1. 銀行・支店
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
            2. 口座
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
            3. 補足（任意）
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

{#if data.canEditSelf && isPreferenceExamplesOpen}
  <div class="modal-backdrop">
    <button
      class="modal-scrim"
      type="button"
      aria-label="希望例を閉じる"
      onclick={() => (isPreferenceExamplesOpen = false)}
    ></button>
    <div
      class="modal preference-example-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preference-examples-title"
    >
      <div class="modal-header">
        <div>
          <p class="eyebrow">preference examples</p>
          <h2 id="preference-examples-title">希望例</h2>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="希望例を閉じる"
          onclick={() => (isPreferenceExamplesOpen = false)}
        >
          ×
        </button>
      </div>
      <div class="preference-example-grid">
        {#each preferenceExampleGroups as group (group.title)}
          <section class="preference-example-group">
            <h3>{group.title}</h3>
            <div class="preference-example-list">
              {#each group.examples as example (example)}
                <button
                  class="preference-example-button"
                  type="button"
                  data-selected={hasPreferenceExample(example)}
                  onclick={() => appendPreferenceExample(example)}
                >
                  <span>{example}</span>
                  <strong>
                    {hasPreferenceExample(example) ? "追加済み" : "追加"}
                  </strong>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
      <footer class="modal-actions">
        <button
          class="button secondary ghost"
          type="button"
          onclick={() => (isPreferenceExamplesOpen = false)}
        >
          閉じる
        </button>
      </footer>
    </div>
  </div>
{/if}
