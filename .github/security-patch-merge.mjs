import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  validateFiles,
  validatePatchMetadata,
} from "./security-patch-policy.mjs";

const repository = "techguide-jp/techguide-jp";
const bot = "dependabot[bot]";
const trustedDeployment = "vercel[bot]";
const { AbortSignal, fetch } = globalThis;

async function api(resource, { method = "GET", body } = {}) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${resource}`,
    {
      method,
      headers: {
        authorization: `Bearer ${process.env.PATCH_APP_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: body && JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
  return response.json();
}

function verifyPull(pull, head) {
  assert.equal(pull.user.login, bot, "unexpected pull request author");
  assert.equal(pull.state, "open", "pull request is no longer open");
  assert.equal(pull.draft, false, "draft pull requests are ineligible");
  assert.equal(pull.head.sha, head, "the pull request SHA changed");
  assert.equal(
    pull.head.repo?.full_name,
    repository,
    "pull request is not from the pilot repository",
  );
  assert.equal(
    pull.base.repo.full_name,
    repository,
    "unexpected base repository",
  );
  assert.equal(pull.base.ref, "main", "unexpected base branch");
  assert.ok(
    pull.head.ref.startsWith("dependabot/"),
    "unexpected source branch",
  );
  assert.ok(
    [1, 2].includes(pull.changed_files),
    "unexpected number of changed files",
  );
}

async function loadFile(path, sha) {
  const file = await api(`contents/${path}?ref=${sha}`);
  assert.equal(file.type, "file", "unexpected file type");
  assert.equal(file.encoding, "base64", "unexpected file encoding");
  return Buffer.from(file.content, "base64").toString("utf8");
}

async function deploymentResult(sha, environment) {
  const deployments = await api(
    `deployments?sha=${sha}&environment=${environment}&per_page=20`,
  );
  const deployment = deployments.find(
    (entry) =>
      entry.sha === sha &&
      entry.environment === environment &&
      entry.creator?.login === trustedDeployment,
  );
  if (!deployment) return "pending";
  const statuses = await api(
    `deployments/${deployment.id}/statuses?per_page=20`,
  );
  return (
    statuses.find((entry) => entry.creator?.login === trustedDeployment)
      ?.state ?? "pending"
  );
}

async function ciResult(sha, event, check) {
  const runs = await api(
    `actions/workflows/ci.yml/runs?head_sha=${sha}&event=${event}&per_page=20`,
  );
  const run = runs.workflow_runs.find(
    (entry) =>
      entry.head_sha === sha &&
      entry.event === event &&
      entry.repository.full_name === repository,
  );
  if (!run) return "pending";
  const { jobs } = await api(
    `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=50`,
  );
  return (
    jobs.find((job) => job.head_sha === sha && job.name === check)
      ?.conclusion ?? "pending"
  );
}

async function poll(check, minutes, detail) {
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    const statuses = await check();
    if (statuses.every((status) => status === "success")) return;
    if (
      statuses.some((status) =>
        [
          "failure",
          "error",
          "cancelled",
          "timed_out",
          "action_required",
          "inactive",
          "skipped",
        ].includes(status),
      )
    ) {
      throw new Error(`${detail} did not succeed: ${statuses.join(", ")}`);
    }
    await sleep(20_000);
  }
  throw new Error(`${detail} timed out`);
}

async function latestBase() {
  const ref = await api("git/ref/heads/main");
  return ref.object.sha;
}

async function run() {
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    repository,
    "unexpected repository",
  );
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const number = event.pull_request.number;
  const head = event.pull_request.head.sha;
  assert.match(head, /^[0-9a-f]{40}$/);
  assert.ok(Number.isInteger(number));
  const pull = await api(`pulls/${number}`);
  const metadata = {
    name: process.env.DEPENDENCY_NAME,
    from: process.env.DEPENDENCY_FROM,
    to: process.env.DEPENDENCY_TO,
    updateType: process.env.DEPENDENCY_UPDATE,
    dependencyType: process.env.DEPENDENCY_TYPE,
    ghsa: process.env.DEPENDENCY_ADVISORY,
    alertState: process.env.DEPENDENCY_ALERT_STATE,
  };

  let base;
  try {
    verifyPull(pull, head);
    validatePatchMetadata(metadata);
    base = await latestBase();
    assert.match(base, /^[0-9a-f]{40}$/);
    const comparison = await api(`compare/${base}...${head}`);
    assert.equal(comparison.merge_base_commit.sha, base, "head is behind main");
    assert.equal(
      comparison.total_commits,
      1,
      "expected a single Dependabot commit",
    );
    const [commit] = comparison.commits;
    assert.equal(commit.sha, head, "unexpected commit SHA");
    assert.equal(
      commit.author?.login,
      bot,
      "commit was not authored by Dependabot",
    );
    assert.equal(
      commit.commit.verification?.verified,
      true,
      "commit lacks a verified signature",
    );

    const [files, originalPackage, updatedPackage, originalLock, updatedLock] =
      await Promise.all([
        api(`pulls/${number}/files?per_page=3`),
        loadFile("package.json", base),
        loadFile("package.json", head),
        loadFile("pnpm-lock.yaml", base),
        loadFile("pnpm-lock.yaml", head),
      ]);
    validateFiles(
      { files, originalPackage, updatedPackage, originalLock, updatedLock },
      metadata,
    );
  } catch (error) {
    if (error.name !== "AssertionError") throw error;
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `手動確認が必要です。\n\n${error.message.split("\n")[0]}\n`,
    );
    return;
  }

  await poll(
    () =>
      Promise.all([
        ciResult(head, "pull_request", "verify"),
        deploymentResult(head, "Preview"),
      ]),
    18,
    "pull request CI and Vercel Preview",
  );
  await poll(
    () =>
      Promise.all([
        ciResult(base, "push", "verify"),
        ciResult(base, "push", "migrate-production-database"),
        deploymentResult(base, "Production"),
      ]),
    1,
    "current production deployment",
  );
  verifyPull(await api(`pulls/${number}`), head);
  assert.equal(await latestBase(), base, "main changed during verification");

  if (process.env.PATCH_ENABLED !== "true") {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      "自動マージの条件を満たしました。検証モードで終了しました。\n",
    );
    return;
  }

  const result = await api(`pulls/${number}/merge`, {
    method: "PUT",
    body: {
      sha: head,
      merge_method: "squash",
      commit_title: `fix: ${metadata.name}の既知脆弱性を修正 (#${number})`,
      commit_message: `${metadata.ghsa} / ${metadata.from} → ${metadata.to}`,
    },
  });
  assert.equal(result.merged, true, "GitHub did not merge the pull request");
  assert.match(result.sha, /^[0-9a-f]{40}$/);
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `修正をマージしました。\n\nコミット ${result.sha}\n`,
  );

  await poll(
    () =>
      Promise.all([
        ciResult(result.sha, "push", "verify"),
        ciResult(result.sha, "push", "migrate-production-database"),
        deploymentResult(result.sha, "Production"),
      ]),
    22,
    "production CI and Vercel deployment",
  );
  const response = await fetch("https://techguide-jp.vercel.app/login", {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(
    response.status,
    200,
    "the production login screen did not return 200",
  );
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    "同じコミットの本番デプロイとログイン画面を確認しました。\n",
  );
}

await run();
