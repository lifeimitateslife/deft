export type Kind = "text" | "markdown";
export type Mode = "live" | "source" | "read";
export interface Document {
  id: string;
  path: string | null;
  name: string;
  kind?: Kind;
  text: string;
  encoding: string;
  bom: string;
  fingerprint: string | null;
  readOnly: boolean;
  dirty?: boolean;
  mode?: Mode;
}
export interface Settings {
  appearance: "system" | "light" | "dark";
  material: "glass" | "solid";
  wrap: boolean;
  lines: boolean;
  fontSize: number;
  reducedMotion: boolean;
  autosave: boolean;
  recent: string[];
}
declare global {
  interface Window {
    deft: any;
  }
}
