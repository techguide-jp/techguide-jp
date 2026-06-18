<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import CopyLoginButton from "$lib/components/CopyLoginButton.svelte";
  import { formatDateTime } from "$lib/format";

  let { data, form }: PageProps = $props();
  const initialProfile = () => data.profile;
  let pendingAction = $state<string | null>(null);
  let displayName = $state(initialProfile().displayName);
  let skillsInput = $state(initialProfile().skills.join("\n"));
  let specialtyNote = $state(initialProfile().specialtyNote);
  let availabilityNote = $state(initialProfile().availabilityNote);
  let selfAssignmentNote = $state(initialProfile().selfAssignmentNote);
  let adminNote = $state(initialProfile().adminNote);
  let syncedLogin = $state<string | null>(initialProfile().login);

  $effect(() => {
    if (syncedLogin === data.profile.login) return;
    syncedLogin = data.profile.login;
    displayName = data.profile.displayName;
    skillsInput = data.profile.skills.join("\n");
    specialtyNote = data.profile.specialtyNote;
    availabilityNote = data.profile.availabilityNote;
    selfAssignmentNote = data.profile.selfAssignmentNote;
    adminNote = data.profile.adminNote;
  });

  const enhanceAction =
    (name: string): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ update }) => {
        await update();
        pendingAction = null;
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);
</script>

<section class="page-heading">
  <div>
    <p class="eyebrow">worker profile</p>
    <h1>{data.profile.displayName}</h1>
    <p class="muted">{data.profile.login}</p>
  </div>
  <CopyLoginButton login={data.profile.login} />
</section>

{#if actionMessage}
  <p class="notice" role="status">{actionMessage}</p>
{/if}

<section class="panel">
  <h2>プロフィール</h2>
  {#if data.canEditSelf}
    <form
      method="POST"
      action="?/saveSelfProfile"
      use:enhance={enhanceAction("save-self-profile")}
      class="request-form"
    >
      <label>
        表示名
        <input
          name="displayName"
          bind:value={displayName}
          maxlength="100"
          required
        />
      </label>
      <label>
        スキル
        <textarea
          name="skills"
          rows="5"
          maxlength="2000"
          bind:value={skillsInput}></textarea>
      </label>
      <label>
        得意領域
        <textarea
          name="specialtyNote"
          rows="4"
          maxlength="2000"
          bind:value={specialtyNote}></textarea>
      </label>
      <label>
        稼働目安
        <textarea
          name="availabilityNote"
          rows="4"
          maxlength="2000"
          bind:value={availabilityNote}></textarea>
      </label>
      <label class="wide">
        割り振り用本人メモ
        <textarea
          name="selfAssignmentNote"
          rows="4"
          maxlength="2000"
          bind:value={selfAssignmentNote}></textarea>
      </label>
      <div class="form-actions">
        <ActionSubmit
          actionName="save-self-profile"
          {pendingAction}
          label="保存"
          pendingLabel="保存中..."
        />
      </div>
    </form>
  {:else}
    <dl class="profile-details">
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
        <dt>割り振り用本人メモ</dt>
        <dd>{data.profile.selfAssignmentNote || "-"}</dd>
      </div>
    </dl>
  {/if}
</section>

{#if data.canEditAdminNote}
  <section class="panel">
    <h2>管理者メモ</h2>
    <form
      method="POST"
      action="?/saveAdminNote"
      use:enhance={enhanceAction("save-admin-note")}
      class="request-form"
    >
      <label class="wide">
        メモ
        <textarea
          name="adminNote"
          rows="5"
          maxlength="2000"
          bind:value={adminNote}></textarea>
      </label>
      {#if data.profile.adminNoteUpdatedBy && data.profile.adminNoteUpdatedAt}
        <p class="muted wide">
          最終更新: {formatDateTime(data.profile.adminNoteUpdatedAt)} / {data
            .profile.adminNoteUpdatedBy}
        </p>
      {/if}
      <div class="form-actions">
        <ActionSubmit
          actionName="save-admin-note"
          {pendingAction}
          label="管理者メモを保存"
          pendingLabel="保存中..."
          variant="secondary"
        />
      </div>
    </form>
  </section>
{/if}
