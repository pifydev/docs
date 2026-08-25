import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const releaseFixtureURL = new URL(
  "fixtures/pi-release-0843.json",
  import.meta.url,
);
const compileFixturePackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
];

async function readReleaseFixture() {
  return JSON.parse(await readFile(releaseFixtureURL, "utf8"));
}

async function activeContentFiles(directoryURL) {
  const entries = await readdir(directoryURL, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryURL = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        directoryURL,
      );
      return entry.isDirectory() ? activeContentFiles(entryURL) : [entryURL];
    }),
  );
  return files.flat();
}

async function readActiveSources() {
  const contentFiles = (
    await Promise.all([
      activeContentFiles(new URL("content/en/", repositoryRoot)),
      activeContentFiles(new URL("content/vi/", repositoryRoot)),
    ])
  ).flat();
  const readmeURL = new URL("README.md", repositoryRoot);

  return Promise.all(
    [...contentFiles, readmeURL].map(async (fileURL) => ({
      filename: path.relative(repositoryRoot.pathname, fileURL.pathname),
      source: await readFile(fileURL, "utf8"),
    })),
  );
}

test("release fixture identifies published Pi 0.84.3 authority", async () => {
  const release = await readReleaseFixture();

  assert.equal(release.packageVersion, "0.84.3");
  assert.equal(release.tag, "v0.84.3");
  assert.equal(release.commit, "4e58f324fae8ebfa98a3d45181fb248072a2afac");
});

test("release fixture keeps the audited upstream head explicitly unreleased", async () => {
  const release = await readReleaseFixture();

  assert.equal(
    release.upstreamAuditCommit,
    "dcd461925db2edf69a43c8135db1180d418afd54",
  );
  assert.equal(release.upstreamAuditStatus, "unreleased");
});

test("compile fixture packages are exactly pinned to the published release", async () => {
  const packageJSON = JSON.parse(
    await readFile(new URL("package.json", repositoryRoot), "utf8"),
  );

  for (const packageName of compileFixturePackages) {
    assert.equal(packageJSON.devDependencies[packageName], "0.84.3");
  }
});

test("active content no longer contains the previous release markers", async () => {
  const activeSources = await readActiveSources();
  const staleFiles = activeSources
    .filter(({ source }) => /0\.84\.2|a470b121/.test(source))
    .map(({ filename }) => filename);

  assert.deepEqual(staleFiles, []);
});

test("0.84.3 source links point to the published tag or release commit", async () => {
  const release = await readReleaseFixture();
  const activeSources = await readActiveSources();
  const releaseClaimSourceLinks = activeSources.flatMap(
    ({ filename, source }) =>
      !source.includes(release.packageVersion)
        ? []
        : [
            ...source.matchAll(
              /https:\/\/github\.com\/(?:earendil-works\/pi|badlogic\/pi-mono)\/(?:blob|commit|tree)\/[^\s)'"\]]+/g,
            ),
          ].map(([link]) => ({ filename, link })),
  );

  for (const { filename, link } of releaseClaimSourceLinks) {
    assert.equal(link.includes(release.upstreamAuditCommit), false, filename);
    assert.ok(
      link.includes(release.tag) || link.includes(release.commit),
      filename,
    );
  }
});
