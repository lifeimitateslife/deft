import shortcuts from "../desktop/shortcuts.json";
export function shortcutLabel(command: string) {
  const mac = window.deft.platform === "darwin";
  const entry = shortcuts.find(
    (item) =>
      item.command === command &&
      !(item.windowsOnly && mac) &&
      !(item.macOnly && !mac),
  );
  const accelerator =
    entry?.accelerator ||
    (
      {
        "edit-undo": "CmdOrCtrl+Z",
        "edit-redo": "CmdOrCtrl+Shift+Z",
        "edit-cut": "CmdOrCtrl+X",
        "edit-copy": "CmdOrCtrl+C",
        "edit-paste": "CmdOrCtrl+V",
        "edit-selectAll": "CmdOrCtrl+A",
      } as Record<string, string>
    )[command] ||
    "";
  return accelerator.replaceAll("CmdOrCtrl", mac ? "Cmd" : "Ctrl");
}
