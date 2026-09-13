import { useEffect, useState } from "react";

export function TitleBar() {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void window.deft.windowState().then((state: { fullscreen: boolean }) => {
        if (alive) setFullscreen(state.fullscreen);
      });
    refresh();
    const unsubscribe = window.deft.onAction((action: string) => {
      if (action === "window-state") refresh();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  if (!["win32", "darwin"].includes(window.deft.platform)) return null;
  return (
    <div
      className="title-bar"
      data-platform={window.deft.platform}
      hidden={fullscreen}
    >
      <span>DEFT</span>
    </div>
  );
}
