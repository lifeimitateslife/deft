const { test } = require("node:test");
const assert = require("node:assert/strict");
const { selectUpdate, createUpdateChecker } = require("../desktop/updates.cjs");
const release = (v, changes = {}) => ({
  tag_name: `v${v}`,
  published_at: "2026-09-11T00:00:00Z",
  draft: false,
  prerelease: true,
  html_url: "https://malicious.invalid/ignored",
  assets: [
    `DEFT-${v}-arm64.dmg`,
    `DEFT-${v}-x64.dmg`,
    `DEFT.Setup.${v}.exe`,
  ].map((name) => ({ name, state: "uploaded", size: 100 })),
  ...changes,
});
test("update selection uses numeric versions and each platform's published installer", () => {
  const feed = [release("0.2.9"), release("0.2.10"), release("0.2.5")];
  for (const [platform, arch] of [
    ["darwin", "arm64"],
    ["darwin", "x64"],
    ["win32", "x64"],
  ]) {
    assert.deepEqual(selectUpdate(feed, "0.2.5", platform, arch), {
      version: "0.2.10",
    });
    assert.equal(selectUpdate(feed, "0.2.10", platform, arch), null);
    assert.equal(selectUpdate(feed, "1.0.0", platform, arch), null);
  }
  assert.equal(selectUpdate(feed, "0.2.5", "linux", "x64"), null);
  assert.equal(
    selectUpdate(
      [
        release("0.2.6", {
          assets: [
            { name: "DEFT-0.2.6-arm64.dmg", state: "uploaded", size: 100 },
          ],
        }),
      ],
      "0.2.5",
      "win32",
      "x64",
    ),
    null,
  );
});
test("drafts, unfinished assets, malformed versions and missing publication are ignored", () => {
  const feed = [
    null,
    release("99.0.0", { draft: true }),
    release("98.0.0", { published_at: null }),
    release("97.0.0", { assets: [] }),
    release("96.0.0", {
      assets: [{ name: "DEFT.Setup.96.0.0.exe", state: "new", size: 100 }],
    }),
    release("95.0.0", {
      assets: [{ name: "DEFT.Setup.95.0.0.exe", state: "uploaded", size: 0 }],
    }),
    release("0.2.6-beta.1"),
    release("0.2.6/evil"),
    release("999999999999999999999999999999.0.0"),
  ];
  assert.equal(selectUpdate(feed, "0.2.5", "win32", "x64"), null);
  assert.equal(selectUpdate({}, "0.2.5", "win32", "x64"), null);
  assert.equal(selectUpdate(feed, "bad", "win32", "x64"), null);
});
test("checks are coalesced, cached for a day and only open a fixed official page", async () => {
  let clock = 1,
    calls = 0,
    resolve;
  const checker = createUpdateChecker({
    version: "0.2.5",
    platform: "win32",
    arch: "x64",
    now: () => clock,
    fetchImpl: (url, options) => {
      calls++;
      assert.equal(
        url,
        "https://api.github.com/repos/lifeimitateslife/deft/releases?per_page=100",
      );
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Authorization, undefined);
      return new Promise((r) => {
        resolve = r;
      });
    },
  });
  assert.equal(checker.page(), null);
  const a = checker.check(),
    b = checker.check();
  assert.equal(calls, 1);
  resolve({ ok: true, json: async () => [release("0.2.6")] });
  assert.deepEqual(await a, { version: "0.2.6" });
  await b;
  assert.equal(
    checker.page(),
    "https://github.com/lifeimitateslife/deft/releases/tag/v0.2.6",
  );
  await checker.check();
  assert.equal(calls, 1);
  clock += 86400001;
  const c = checker.check();
  assert.equal(calls, 2);
  resolve({ ok: true, json: async () => [] });
  assert.equal(await c, null);
  assert.equal(checker.page(), null);
});
test("offline, rate limits and malformed replies fail quietly and retry after a day", async () => {
  for (const fail of [
    () => {
      throw Error("offline");
    },
    async () => ({ ok: false, status: 403 }),
    async () => ({
      ok: true,
      json: async () => {
        throw Error("bad JSON");
      },
    }),
  ]) {
    let clock = 1,
      calls = 0;
    const checker = createUpdateChecker({
      version: "0.2.5",
      platform: "darwin",
      arch: "arm64",
      now: () => clock,
      fetchImpl: async () => {
        calls++;
        return calls === 1
          ? fail()
          : { ok: true, json: async () => [release("0.2.6")] };
      },
    });
    assert.equal(await checker.check(), null);
    assert.equal(await checker.check(), null);
    assert.equal(calls, 1);
    clock += 86400001;
    assert.deepEqual(await checker.check(), { version: "0.2.6" });
  }
});
