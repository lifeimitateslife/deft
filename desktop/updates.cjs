const RELEASES =
  "https://api.github.com/repos/lifeimitateslife/deft/releases?per_page=100";
const PAGE = "https://github.com/lifeimitateslife/deft/releases/tag/v";
const DAY = 24 * 60 * 60 * 1000;
function parts(value) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  const numbers = value.split(".").map(Number);
  return numbers.every(Number.isSafeInteger) ? numbers : null;
}
function newer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function selectUpdate(releases, current, platform, arch) {
  let best = parts(current),
    available = null;
  if (!best || !Array.isArray(releases)) return null;
  for (const release of releases) {
    const version =
      typeof release?.tag_name === "string"
        ? release.tag_name.replace(/^v/, "")
        : "";
    const parsed = parts(version);
    if (
      !parsed ||
      !newer(parsed, best) ||
      release.draft ||
      !release.published_at
    )
      continue;
    const installer =
      platform === "darwin" && ["arm64", "x64"].includes(arch)
        ? `DEFT-${version}-${arch}.dmg`
        : platform === "win32" && arch === "x64"
          ? `DEFT.Setup.${version}.exe`
          : null;
    if (
      !installer ||
      !Array.isArray(release.assets) ||
      !release.assets.some(
        (asset) =>
          asset?.name === installer &&
          asset.state === "uploaded" &&
          asset.size > 0,
      )
    )
      continue;
    // Public numbered prereleases are included: DEFT currently ships that way.
    best = parsed;
    available = { version };
  }
  return available;
}
function createUpdateChecker({
  version,
  platform,
  arch,
  fetchImpl = (url, options) => fetch(url, options),
  now = () => Date.now(),
}) {
  let available = null,
    nextCheck = 0,
    pending;
  return {
    check() {
      if (pending) return pending;
      if (now() < nextCheck) return Promise.resolve(available);
      nextCheck = now() + DAY;
      pending = (async () => {
        try {
          const response = await fetchImpl(RELEASES, {
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": "DEFT-update-check",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          });
          if (!response.ok) throw Error("Update service unavailable");
          available = selectUpdate(
            await response.json(),
            version,
            platform,
            arch,
          );
        } catch {
          // Offline/rate-limited checks must never interrupt writing.
        }
        return available;
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    page() {
      return available ? PAGE + available.version : null;
    },
  };
}
module.exports = { createUpdateChecker, selectUpdate };
