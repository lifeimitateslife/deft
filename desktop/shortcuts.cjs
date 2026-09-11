const shortcuts = require("./shortcuts.json");
function shortcutFor(input, platform = process.platform) {
  if (input.type !== "keyDown" || input.isComposing || input.altGraph) return;
  const mac = platform === "darwin";
  const key =
    mac && input.meta && input.alt && /^Key[A-Z]$/.test(input.code || "")
      ? input.code.slice(3).toLowerCase()
      : /^Digit[0-9]$/.test(input.code || "") &&
          !(input.control && input.alt && !mac)
        ? input.code.slice(5)
        : input.code === "Backquote"
          ? "`"
          : input.code === "Period"
            ? "."
            : input.key.toLowerCase();
  return shortcuts.find((item) => {
    if ((item.macOnly && !mac) || (item.windowsOnly && mac)) return false;
    const control = !item.unmodified && (item.control || !mac);
    const meta = !item.unmodified && !item.control && mac;
    return (
      !!input.control === !!control &&
      !!input.meta === !!meta &&
      !!input.alt === !!item.alt &&
      !!input.shift === !!item.shift &&
      key === item.key.toLowerCase()
    );
  })?.command;
}
module.exports = { shortcutFor };
