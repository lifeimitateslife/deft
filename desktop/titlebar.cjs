// Keep real OS caption controls and hit-testing; only the title surface is ours.
function titlebarOptions(platform) {
  if (!["darwin", "win32"].includes(platform)) return {};
  return {
    titleBarStyle: "hidden",
    titleBarOverlay:
      platform === "win32"
        ? { color: "#00000000", symbolColor: "#242930", height: 32 }
        : true,
  };
}
function updateTitlebar(win, settings, nativeTheme, platform) {
  if (platform !== "win32") return;
  const dark =
    settings.appearance === "dark" ||
    ((!settings.appearance || settings.appearance === "system") &&
      nativeTheme.shouldUseDarkColors);
  const custom =
    settings.appearance === "custom" ? settings.custom?.text : null;
  win.setTitleBarOverlay({
    color: "#00000000",
    symbolColor: /^#[\da-f]{6}$/i.test(custom || "")
      ? custom
      : dark
        ? "#e7e8eb"
        : "#242930",
    height: 32,
  });
}
module.exports = { titlebarOptions, updateTitlebar };
