import React, { useEffect, useState } from "react";
import type { Settings, CustomTheme } from "./types";
import {
  appearanceDefaults,
  light,
  dark,
  contrast,
  fontStack,
} from "./preferences";
let fontCache: string[] | undefined;
export function Appearance({
  settings,
  configure,
  material,
}: {
  settings: Settings;
  configure: (value: Partial<Settings>) => Promise<void>;
  material: { enabled: boolean; reason: string };
}) {
  const [original] = useState(() => ({
    ...settings,
    custom: settings.custom && { ...settings.custom },
  }));
  const [fonts, setFonts] = useState(fontCache);
  const [fontStatus, setFontStatus] = useState("");
  const [search, setSearch] = useState("");
  const custom = settings.custom || light;
  const unreadable =
    Math.min(
      contrast(custom.text, custom.paper),
      contrast(custom.text, custom.chrome),
    ) < 4.5;
  async function loadFonts() {
    setFontStatus("Loading installed fonts…");
    try {
      const result = await (window as any).queryLocalFonts();
      fontCache = [
        ...new Set<string>(
          result.map((font: { family: string }) => font.family),
        ),
      ].sort((a, b) => a.localeCompare(b));
      setFonts(fontCache);
      setFontStatus(
        `${fontCache.length} installed families. Font files stay on this computer.`,
      );
    } catch {
      setFontStatus(
        "Installed fonts could not be listed. The system font remains available.",
      );
    }
  }
  return (
    <>
      <h3>Appearance</h3>
      <label>
        Appearance
        <select
          aria-label="Appearance"
          value={settings.appearance}
          onChange={(event) => {
            const appearance = event.target.value as Settings["appearance"];
            const seed =
              settings.appearance === "dark" ||
              (settings.appearance === "system" &&
                matchMedia("(prefers-color-scheme: dark)").matches)
                ? dark
                : light;
            void configure({
              appearance,
              ...(appearance === "custom" && !settings.custom
                ? { custom: { ...seed } }
                : {}),
            });
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {settings.appearance === "custom" && (
        <div className="custom-colors">
          {(
            [
              ["chrome", "Window"],
              ["paper", "Document"],
              ["text", "Text"],
              ["accent", "Accent"],
            ] as const
          ).map(([key, label]) => (
            <Color
              key={key}
              label={label}
              value={custom[key]}
              change={(value) =>
                void configure({ custom: { ...custom, [key]: value } })
              }
            />
          ))}
          {unreadable && (
            <div role="status" className="contrast-warning">
              These colors may be hard to read.
              <button
                onClick={() =>
                  void configure({
                    custom: {
                      ...custom,
                      text:
                        contrast("#111111", custom.paper) >
                        contrast("#ffffff", custom.paper)
                          ? "#111111"
                          : "#ffffff",
                    },
                  })
                }
              >
                Suggest readable text
              </button>
            </div>
          )}
        </div>
      )}
      <label>
        Material
        <select
          aria-label="Material"
          value={settings.material}
          onChange={(event) =>
            void configure({
              material: event.target.value as Settings["material"],
            })
          }
        >
          <option value="glass">Glass</option>
          <option value="solid">Solid</option>
        </select>
      </label>
      <label>
        Glass tint
        <input
          aria-label="Glass tint"
          type="range"
          min="20"
          max="95"
          value={settings.glassOpacity ?? 68}
          disabled={!material.enabled}
          onChange={(event) =>
            void configure({ glassOpacity: Number(event.target.value) })
          }
        />
      </label>
      <p>{material.reason}</p>
      <label>
        Reduce motion
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(event) =>
            void configure({ reducedMotion: event.target.checked })
          }
        />
      </label>
      <p>
        Use fewer interface animations. Your system's reduced motion setting is
        always respected.
      </p>
      <h3>Fonts</h3>
      <button onClick={() => void loadFonts()}>Browse installed fonts</button>
      <p role="status">{fontStatus}</p>
      {fonts && (
        <label className="font-search">
          Search families
          <input
            type="search"
            aria-label="Search font families"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      {(
        [
          ["fontFamily", "Body font"],
          ["codeFontFamily", "Source and code font"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <label>
            {label}
            <select
              aria-label={label}
              value={settings[key] || ""}
              onChange={(event) =>
                void configure({ [key]: event.target.value })
              }
            >
              <option value="">System default</option>
              {settings[key] && !fonts?.includes(settings[key]!) && (
                <option value={settings[key]}>
                  {settings[key]} (unavailable; using fallback)
                </option>
              )}
              {fonts
                ?.filter(
                  (font) =>
                    font === settings[key] ||
                    font
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                )
                .map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
            </select>
          </label>
          <p
            className="font-preview"
            style={{
              fontFamily: fontStack(settings[key], key === "codeFontFamily"),
            }}
          >
            The quick brown fox · 雪 · 0123456789
          </p>
        </div>
      ))}
      <label>
        Text size
        <input
          aria-label="Text size"
          type="number"
          min="11"
          max="32"
          value={settings.fontSize}
          onChange={(event) =>
            void configure({
              fontSize: Math.max(
                11,
                Math.min(32, Number(event.target.value) || 16),
              ),
            })
          }
        />
      </label>
      <button
        onClick={() =>
          void configure({ fontFamily: "", codeFontFamily: "", fontSize: 16 })
        }
      >
        Reset fonts
      </button>
      <div className="appearance-reset">
        <button
          onClick={() =>
            void configure(
              Object.fromEntries(
                Object.keys(appearanceDefaults).map((key) => [
                  key,
                  original[key as keyof Settings],
                ]),
              ),
            )
          }
        >
          Revert appearance changes
        </button>
        <button onClick={() => void configure(appearanceDefaults)}>
          Reset appearance defaults
        </button>
      </div>
    </>
  );
}
function Color({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return (
    <label>
      {label}
      <span className="color-fields">
        <input
          aria-label={`${label} color`}
          type="color"
          value={value}
          onChange={(event) => change(event.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          value={hex}
          maxLength={7}
          onChange={(event) => {
            setHex(event.target.value);
            if (/^#[\da-f]{6}$/i.test(event.target.value))
              change(event.target.value);
          }}
          onBlur={() => setHex(value)}
        />
      </span>
    </label>
  );
}
