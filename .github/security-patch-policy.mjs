import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const packages = new Set(["@vercel/analytics", "html2canvas-pro", "jspdf"]);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const expectedFiles = ["package.json", "pnpm-lock.yaml"];

function parseLockfile(contents) {
  const result = spawnSync(
    "ruby",
    [
      "-ryaml",
      "-rjson",
      "-e",
      "puts JSON.generate(YAML.safe_load(STDIN.read, aliases: false))",
    ],
    {
      input: contents,
      encoding: "utf8",
      maxBuffer: 4_000_000,
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, "pnpm lockfile could not be parsed");
  return JSON.parse(result.stdout);
}

export function validatePatchMetadata({
  name,
  from,
  to,
  updateType,
  dependencyType,
  ghsa,
  alertState,
}) {
  assert.ok(packages.has(name), "package is outside the allowlist");
  assert.equal(
    updateType,
    "version-update:semver-patch",
    "only a patch version is eligible",
  );
  assert.equal(
    dependencyType,
    "direct:production",
    "only a direct production dependency is eligible",
  );
  assert.equal(alertState, "OPEN", "the linked advisory is not open");
  assert.match(
    ghsa,
    /^GHSA(?:-[a-z0-9]{4}){3}$/,
    "a single GitHub advisory is required",
  );
  assert.match(
    from,
    versionPattern,
    "the installed version is not stable SemVer",
  );
  assert.match(
    to,
    versionPattern,
    "the replacement version is not stable SemVer",
  );
  const oldParts = from.split(".");
  const newParts = to.split(".");
  assert.deepEqual(
    oldParts.slice(0, 2),
    newParts.slice(0, 2),
    "major and minor version must stay the same",
  );
  assert.ok(
    BigInt(newParts[2]) > BigInt(oldParts[2]),
    "the replacement version must increase",
  );
}

export function validateFiles(
  { files, originalPackage, updatedPackage, originalLock, updatedLock },
  { name, from, to },
) {
  const changedFiles = files.map((file) => file.filename).sort();
  assert.ok(
    changedFiles.includes("pnpm-lock.yaml") &&
      changedFiles.every((file) => expectedFiles.includes(file)),
    "only the manifest and pnpm lockfile may change",
  );
  assert.ok(
    files.every(
      (file) => file.status === "modified" && !file.previous_filename,
    ),
    "files must be modified in place",
  );

  const before = JSON.parse(originalPackage);
  const after = JSON.parse(updatedPackage);
  const beforeRange = before.dependencies?.[name];
  const afterRange = after.dependencies?.[name];
  assert.ok(
    beforeRange === from ||
      beforeRange === `^${from}` ||
      beforeRange === `~${from}` ||
      beforeRange === afterRange,
    "the original manifest range could not be verified",
  );
  assert.ok(
    typeof beforeRange === "string" &&
      (afterRange === beforeRange ||
        ["", "^", "~"].some(
          (prefix) =>
            beforeRange === `${prefix}${from}` &&
            afterRange === `${prefix}${to}`,
        )),
    "the manifest must preserve the package range policy",
  );
  delete before.dependencies[name];
  delete after.dependencies[name];
  assert.deepEqual(after, before, "an unrelated part of package.json changed");

  const beforeLock = parseLockfile(originalLock);
  const afterLock = parseLockfile(updatedLock);
  assert.equal(
    String(beforeLock.lockfileVersion),
    "9.0",
    "expected pnpm lockfile format 9",
  );
  const original = beforeLock.importers?.["."]?.dependencies?.[name];
  const replacement = afterLock.importers?.["."]?.dependencies?.[name];
  assert.equal(
    original?.specifier,
    beforeRange,
    "original lockfile and manifest disagree",
  );
  assert.equal(
    replacement?.specifier,
    afterRange,
    "updated lockfile and manifest disagree",
  );
  assert.equal(
    original.version?.split("(")[0],
    from,
    "original lockfile version disagrees with Dependabot",
  );
  assert.equal(
    replacement.version?.split("(")[0],
    to,
    "new lockfile version disagrees with Dependabot",
  );
  assert.equal(
    original.version.slice(from.length),
    replacement.version.slice(to.length),
    "peer resolution changed",
  );
  delete beforeLock.importers["."].dependencies[name];
  delete afterLock.importers["."].dependencies[name];

  const oldPackage = `${name}@${from}`;
  const newPackage = `${name}@${to}`;
  const oldSnapshot = `${name}@${original.version}`;
  const newSnapshot = `${name}@${replacement.version}`;
  assert.ok(
    beforeLock.packages?.[oldPackage]?.resolution?.integrity,
    "original package integrity is missing",
  );
  assert.ok(
    afterLock.packages?.[newPackage]?.resolution?.integrity,
    "new package integrity is missing",
  );
  assert.ok(
    !beforeLock.packages[oldPackage].resolution.tarball &&
      !afterLock.packages[newPackage].resolution.tarball,
    "the updated package must use registry resolution",
  );
  delete beforeLock.packages[oldPackage].resolution.integrity;
  delete afterLock.packages[newPackage].resolution.integrity;
  assert.deepEqual(
    afterLock.packages[newPackage],
    beforeLock.packages[oldPackage],
    "direct package metadata changed",
  );
  assert.deepEqual(
    afterLock.snapshots?.[newSnapshot],
    beforeLock.snapshots?.[oldSnapshot],
    "transitive dependencies changed",
  );
  assert.ok(
    Object.hasOwn(beforeLock.snapshots ?? {}, oldSnapshot) &&
      Object.hasOwn(afterLock.snapshots ?? {}, newSnapshot),
    "the direct dependency snapshot is missing",
  );
  delete beforeLock.packages[oldPackage];
  delete afterLock.packages[newPackage];
  delete beforeLock.snapshots[oldSnapshot];
  delete afterLock.snapshots[newSnapshot];
  assert.deepEqual(
    afterLock,
    beforeLock,
    "an unrelated lockfile entry changed",
  );
}
