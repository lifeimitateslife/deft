import React, { useEffect, useState } from "react";
const DISMISSED = "deft.dismissed-update";
export function UpdateNotice({ hidden }: { hidden: boolean }) {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED);
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () =>
      window.deft
        .updates()
        .then((update: { version: string } | null) => {
          if (active) setVersion(update?.version ?? null);
        })
        .catch(() => {});
    void check();
    const timer = setInterval(check, 24 * 60 * 60 * 1000);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);
  if (hidden || !version || dismissed === version) return null;
  return (
    <div className="notice" role="status" aria-label="Update available">
      <span>
        {error
          ? "Couldn't open your browser. Try again."
          : `DEFT ${version} is available.`}
      </span>
      <button
        onClick={() => {
          void window.deft
            .openUpdate()
            .then(() => setError(false))
            .catch(() => setError(true));
        }}
      >
        View update
      </button>
      <button
        aria-label="Dismiss update notification"
        onClick={() => {
          setDismissed(version);
          try {
            localStorage.setItem(DISMISSED, version);
          } catch {
            /* Dismissal still lasts for this session. */
          }
        }}
      >
        ×
      </button>
    </div>
  );
}
