import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFiles,
  validatePatchMetadata,
} from "./security-patch-policy.mjs";

const metadata = {
  name: "jspdf",
  from: "4.2.1",
  to: "4.2.2",
  updateType: "version-update:semver-patch",
  dependencyType: "direct:production",
  ghsa: "GHSA-2345-abcd-6789",
  alertState: "OPEN",
};
const files = ["package.json", "pnpm-lock.yaml"].map((filename) => ({
  filename,
  status: "modified",
}));
const manifest = (version) =>
  JSON.stringify({ dependencies: { jspdf: `^${version}`, svelte: "^5.0.0" } });
const lock = (version, transitive = "1.0.0") => `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      jspdf:
        specifier: ^${version}
        version: ${version}
packages:
  jspdf@${version}:
    resolution: {integrity: sha512-${version}}
  dependency@${transitive}:
    resolution: {integrity: sha512-foo}
snapshots:
  jspdf@${version}:
    dependencies: {dependency: ${transitive}}
  dependency@${transitive}: {}
`;
const patch = {
  files,
  originalPackage: manifest(metadata.from),
  updatedPackage: manifest(metadata.to),
  originalLock: lock(metadata.from),
  updatedLock: lock(metadata.to),
};

test("accepts a direct allowlisted patch tied to an open advisory", () => {
  assert.doesNotThrow(() => validatePatchMetadata(metadata));
  assert.doesNotThrow(() => validateFiles(patch, metadata));
});

test("keeps minor changes, closed issues, missing advisories, and unknown packages for review", () => {
  for (const change of [
    { to: "4.3.0" },
    { alertState: "FIXED" },
    { ghsa: "" },
    { name: "svelte" },
  ]) {
    assert.throws(() => validatePatchMetadata({ ...metadata, ...change }));
  }
});

test("rejects any unrelated change to a script, lockfile dependency, or workflow", () => {
  assert.throws(
    () =>
      validateFiles(
        {
          ...patch,
          updatedPackage: JSON.stringify({
            dependencies: { jspdf: "^4.2.2", svelte: "^5.0.0" },
            scripts: { build: "unrelated-command" },
          }),
        },
        metadata,
      ),
    /unrelated part/,
  );
  assert.throws(
    () =>
      validateFiles(
        { ...patch, updatedLock: lock(metadata.to, "1.0.1") },
        metadata,
      ),
    /transitive/,
  );
  assert.throws(
    () =>
      validateFiles(
        {
          ...patch,
          files: [...files, { filename: ".github/workflows/ci.yml" }],
        },
        metadata,
      ),
    /only the manifest/,
  );
});
