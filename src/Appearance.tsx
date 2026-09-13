import React, { useEffect, useState } from "react";
import type { Settings, CustomTheme } from "./types";
import { FontPicker } from "./FontPicker";
import {
  appearanceDefaults,
  light,
  dark,
  contrast,
  fontStack,
  defaults,
} from "./preferences";
export function Appearance({
  settings,
  visible,
  configure,
  material,
}: {
  settings: Settings;
  visible: boolean;
  configure: (value: Partial<Settings>) => Promise<void>;
  material: {
    enabled: boolean;
    reason: string;
    clearSupported?: boolean;
    blurStrengthSupported?: boolean;
  };
}) {
  const [original] = useState(() => ({
    ...settings,
    custom: settings.custom && { ...settings.custom },
  }));
  const [fontTarget, setFontTarget] = useState<
    "fontFamily" | "codeFontFamily" | null
  >(null);
  useEffect(() => {
    if (!visible) setFontTarget(null);
  }, [visible]);
  const custom = settings.custom || light;
  const unreadable =
    Math.min(
      contrast(custom.text, custom.paper),
      contrast(custom.text, custom.chrome),
    ) < 4.5;
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
          <button onClick={() => void configure({ custom: { ...light } })}>
            Reset custom colors
          </button>
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
      <label htmlFor="glass-opacity">
        Background opacity
        <output htmlFor="glass-opacity">
          {settings.glassOpacity ?? defaults.glassOpacity}%
        </output>
      </label>
      <div className="slider-reset">
        <input
          id="glass-opacity"
          aria-label="Background opacity"
          type="range"
          min="0"
          max="95"
          step="1"
          list="glass-default"
          value={settings.glassOpacity ?? defaults.glassOpacity}
          aria-valuetext={`${settings.glassOpacity ?? defaults.glassOpacity}% background fill`}
          disabled={!material.enabled}
          onChange={(event) =>
            void configure({ glassOpacity: Number(event.target.value) })
          }
        />
        <datalist id="glass-default">
          <option value={defaults.glassOpacity} label="Default" />
        </datalist>
        <button
          aria-label="Reset background opacity"
          disabled={!material.enabled}
          onClick={() =>
            void configure({ glassOpacity: defaults.glassOpacity })
          }
        >
          Reset
        </button>
      </div>
      {material.blurStrengthSupported ? (
        <>
          <label htmlFor="background-blur">
            Background blur{" "}
            <output htmlFor="background-blur">
              {settings.backgroundBlurStrength ?? 40}%
            </output>
          </label>
          <div className="slider-reset">
            <input
              id="background-blur"
              aria-label="Background blur"
              type="range"
              min="0"
              max="100"
              step="1"
              value={settings.backgroundBlurStrength ?? 40}
              aria-valuetext={`${settings.backgroundBlurStrength ?? 40}% blur strength`}
              disabled={settings.material === "solid" || !material.enabled}
              onChange={(event) =>
                void configure({
                  backgroundBlurStrength: Number(event.target.value),
                })
              }
            />
            <button
              aria-label="Reset background blur"
              disabled={settings.material === "solid" || !material.enabled}
              onClick={() =>
                void configure({
                  backgroundBlurStrength: defaults.backgroundBlurStrength,
                })
              }
            >
              Reset
            </button>
          </div>
        </>
      ) : (
        <label>
          Background blur
          <input
            type="checkbox"
            checked={
              !material.clearSupported || settings.backgroundBlur !== false
            }
            disabled={
              settings.material === "solid" ||
              !material.enabled ||
              !material.clearSupported
            }
            onChange={(event) =>
              void configure({ backgroundBlur: event.target.checked })
            }
          />
        </label>
      )}
      <p className="default-hint">
        Background opacity defaults to {defaults.glassOpacity}%. Lower opacity
        shows more of the background. Text stays opaque.
        {material.blurStrengthSupported &&
          ` Blur defaults to ${defaults.backgroundBlurStrength}%.`}
      </p>
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
      <button onClick={() => setFontTarget("fontFamily")}>
        Browse installed fonts
      </button>
      {(
        [
          ["fontFamily", "Body font"],
          ["codeFontFamily", "Source and code font"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <label>
            {label}
            <button
              aria-label={label}
              aria-haspopup="dialog"
              className="font-choice"
              onClick={() => setFontTarget(key)}
            >
              {settings[key] || "System default"}
            </button>
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
      <FontPicker
        open={visible && fontTarget !== null}
        selected={settings[fontTarget || "fontFamily"] || ""}
        code={fontTarget === "codeFontFamily"}
        close={() => setFontTarget(null)}
        apply={(font) => configure({ [fontTarget || "fontFamily"]: font })}
      />
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
                Math.min(32, Number(event.target.value) || defaults.fontSize),
              ),
            })
          }
        />
      </label>
      <button
        onClick={() =>
          void configure({
            fontFamily: defaults.fontFamily,
            codeFontFamily: defaults.codeFontFamily,
            fontSize: defaults.fontSize,
          })
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
          Reset Appearance to Defaults
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
