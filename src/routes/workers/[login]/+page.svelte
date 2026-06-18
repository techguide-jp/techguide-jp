<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import CopyLoginButton from "$lib/components/CopyLoginButton.svelte";
  import { formatDateTime } from "$lib/format";

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
      ],
    },
    {
      title: "任されたい仕事",
      examples: [
        "小さめのUI改善から入り、慣れたら画面全体を任されたい",
        "仕様が曖昧な箇所を整理しながら実装したい",
        "既存機能のバグ調査と修正がやりやすい",
        "管理画面や運用を楽にする機能に関わりたい",
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

  const enhanceAction =
    (name: string): SubmitFunction =>
    ({ formData }) => {
      if (name === "save-self-profile") {
        const nextSkills = mergeSkills(skills, skillDraft);
        skills = nextSkills;
        skillDraft = "";
        formData.set("skills", nextSkills.join("\n"));
      }
      pendingAction = name;
      return async ({ update }) => {
        await update();
        pendingAction = null;
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);
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
  <p class="notice" role="status">{actionMessage}</p>
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

{#if data.canEditSelf && isPreferenceExamplesOpen}
  <div class="modal-backdrop">
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
