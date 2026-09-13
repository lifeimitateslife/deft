import type { Settings, CustomTheme } from "./types";
import { blurSettings } from "../desktop/blur-settings.cjs";
import builtIn from "../desktop/defaults.json";
export const defaults = builtIn as Settings;
export const light: CustomTheme = {
  chrome: "#f0f2f5",
  paper: "#ffffff",
  text: "#242930",
  accent: "#3268a8",
};
export const dark: CustomTheme = {
  chrome: "#17181a",
  paper: "#101113",
  text: "#e7e8eb",
  accent: "#9bc2f3",
};
export const appearanceDefaults: Partial<Settings> = {
  appearance: defaults.appearance,
  material: defaults.material,
  glassOpacity: defaults.glassOpacity,
  backgroundBlur: defaults.backgroundBlur,
  backgroundBlurStrength: defaults.backgroundBlurStrength,
  translucentTitleBar: defaults.translucentTitleBar,
  custom: undefined,
  fontFamily: defaults.fontFamily,
  codeFontFamily: defaults.codeFontFamily,
  fontSize: defaults.fontSize,
};
export function preferences(saved: Partial<Settings> = {}): Settings {
  return {
    ...defaults,
    recent: [],
    ...saved,
    ...blurSettings(saved),
  };
}
export function contrast(a: string, b: string) {
  const luminance = (color: string) => {
    const rgb = color
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const fontStack = (family = "", code = false) =>
  `${family ? JSON.stringify(family) + ", " : ""}${code ? '"Cascadia Code", Consolas, ui-monospace, monospace' : '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'}`;
