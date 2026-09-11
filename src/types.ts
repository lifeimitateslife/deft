export type Kind = "text" | "markdown";
export type Mode = "live" | "source" | "read";
export interface Document {
  id: string;
  path: string | null;
  name: string;
  kind?: Kind;
  formatted?: boolean;
  text: string;
  encoding: string;
  bom: string;
  fingerprint: string | null;
  readOnly: boolean;
  dirty?: boolean;
  mode?: Mode;
  active?: boolean;
  selection?: { anchor: number; head: number };
  scroll?: { top: number; left: number };
}
export interface CustomTheme {
  chrome: string;
  paper: string;
  text: string;
  accent: string;
}
export interface Settings {
  appearance: "system" | "light" | "dark" | "custom";
  material: "glass" | "solid";
  wrap: boolean;
  lines: boolean;
  fontSize: number;
  reducedMotion: boolean;
  autosave: boolean;
  restoreSession?: boolean;
  statusBar?: boolean;
  custom?: CustomTheme;
  glassOpacity?: number;
  backgroundBlur?: boolean;
  fontFamily?: string;
  codeFontFamily?: string;
  recent: string[];
}
declare global {
  interface Window {
    deft: any;
  }
}
