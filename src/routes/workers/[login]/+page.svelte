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

        <label class="profile-field profile-field-wide">
          <span>仕事の進め方・希望</span>
          <textarea
            name="selfAssignmentNote"
            rows="5"
            maxlength="2000"
            bind:value={selfAssignmentNote}
            placeholder="集中しやすいタスク、相談したい条件、避けたい進め方など"
          ></textarea>
        </label>

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
