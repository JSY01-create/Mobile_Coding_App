import type { LetterLayout } from "./keyboard/layout";
import { loadJSON, saveJSON } from "./storage";

export type KeyboardMode = "custom" | "system";
export type KeySize = "compact" | "normal" | "tall";

export interface Settings {
  keyboard: KeyboardMode;
  keySize: KeySize;
  /** Order of the letter keys. */
  layout: LetterLayout;
  hints: boolean;
  vibrate: boolean;
  fontSize: number;
  tabSize: number;
  wrap: boolean;
  closeBrackets: boolean;
  autocomplete: boolean;
  /** Enter picks the highlighted suggestion (like VS Code). */
  enterAccepts: boolean;
}

export const defaultSettings: Settings = {
  keyboard: "custom",
  keySize: "normal",
  layout: "qwerty",
  hints: true,
  vibrate: true,
  fontSize: 14,
  tabSize: 4,
  wrap: false,
  closeBrackets: true,
  autocomplete: true,
  enterAccepts: true,
};

const KEY = "thumbcode.settings";
type Listener = (s: Settings, changed: (keyof Settings)[]) => void;

class SettingsStore {
  value: Settings;
  private listeners: Listener[] = [];

  constructor() {
    this.value = { ...defaultSettings, ...loadJSON<Partial<Settings>>(KEY, {}) };
  }

  set(patch: Partial<Settings>): void {
    const changed = (Object.keys(patch) as (keyof Settings)[]).filter((k) => patch[k] !== this.value[k]);
    if (!changed.length) return;
    this.value = { ...this.value, ...patch };
    saveJSON(KEY, this.value);
    for (const l of this.listeners) l(this.value, changed);
  }

  subscribe(l: Listener): void {
    this.listeners.push(l);
  }
}

export const settings = new SettingsStore();
