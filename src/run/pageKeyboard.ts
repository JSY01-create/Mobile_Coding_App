// An on-screen keyboard for the Run preview. Phones have no keyboard for a page without a
// text field, so keydown listeners (games, Wordle...) never fire. This sends real
// keydown / keypress / keyup events into the page, and types into a focused text field.
import type { LetterLayout } from "../keyboard/layout";
import { h } from "../ui/dom";

interface PageKey {
  label: string;
  /** event.key; for letters, the small letter (shift makes it capital). */
  key: string;
  code: string;
  keyCode: number;
  /** Typed text (letters, digits, space). */
  char?: string;
  grow?: number;
  mod?: boolean;
}

const LETTERS: Record<LetterLayout, string[]> = {
  qwerty: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
  qwertz: ["qwertzuiop", "asdfghjkl", "yxcvbnm"],
  azerty: ["azertyuiop", "qsdfghjklm", "wxcvbn"],
  colemak: ["qwfpgjluy", "arstdhneio", "zxcvbkm"],
};

const letter = (c: string): PageKey => ({ label: c, key: c, code: `Key${c.toUpperCase()}`, keyCode: c.toUpperCase().charCodeAt(0), char: c });
const digit = (d: string): PageKey => ({ label: d, key: d, code: `Digit${d}`, keyCode: d.charCodeAt(0), char: d });
const special = (label: string, key: string, keyCode: number, grow = 1, code = key): PageKey => ({ label, key, code, keyCode, grow, mod: true });

const REPEAT_DELAY = 420;
const REPEAT_EVERY = 60;

export class PageKeyboard {
  readonly el: HTMLElement;
  private shift: "off" | "once" | "lock" = "off";
  private lastShiftTap = 0;
  private layout: LetterLayout | null = null;
  private held = new Map<number, { key: PageKey; el: HTMLElement; timer: number; repeat: number }>();

  constructor(
    private frame: () => HTMLIFrameElement | null,
    private currentLayout: () => LetterLayout,
    private tapFeedback: () => void
  ) {
    this.el = h("div.pk", { role: "group", "aria-label": "Keyboard for the page" });
    this.el.hidden = true;
    this.el.addEventListener("pointerdown", (e) => this.down(e));
    this.el.addEventListener("pointerup", (e) => this.up(e));
    this.el.addEventListener("pointercancel", (e) => this.up(e));
    // Keep focus (and any focused text field) inside the page.
    this.el.addEventListener("touchstart", (e) => e.cancelable && e.preventDefault(), { passive: false });
    this.el.addEventListener("mousedown", (e) => e.preventDefault());
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(on: boolean): void {
    if (on) this.render();
    this.el.hidden = !on;
  }

  /** Draws the keys again if the letter layout changed in settings. */
  private render(): void {
    const layout = this.currentLayout();
    if (layout === this.layout) return;
    this.layout = layout;
    const [r1, r2, r3] = LETTERS[layout] ?? LETTERS.qwerty;
    const rows: PageKey[][] = [
      "1234567890".split("").map(digit),
      r1.split("").map(letter),
      r2.split("").map(letter),
      [special("⇧", "Shift", 16, 1.5, "ShiftLeft"), ...r3.split("").map(letter), special("⌫", "Backspace", 8, 1.5)],
      [
        special("esc", "Escape", 27),
        special("tab", "Tab", 9),
        { label: "space", key: " ", code: "Space", keyCode: 32, char: " ", grow: 3 },
        special("←", "ArrowLeft", 37),
        special("↑", "ArrowUp", 38),
        special("↓", "ArrowDown", 40),
        special("→", "ArrowRight", 39),
        special("⏎", "Enter", 13, 1.6),
      ],
    ];
    this.el.replaceChildren(
      ...rows.map((row) =>
        h(
          "div.pk-row",
          {},
          ...row.map((k) => {
            const icon = k.mod && k.label.length === 1;
            const el = h(`div.pk-key${k.mod ? ".mod" : ""}${icon ? ".icon" : ""}` as "div", { role: "button", "aria-label": k.key === " " ? "Space" : k.key });
            el.textContent = k.label;
            if (k.grow && k.grow !== 1) el.style.flexGrow = String(k.grow);
            (el as HTMLElement & { _key?: PageKey })._key = k;
            return el;
          })
        )
      )
    );
    this.syncShift();
  }

  private syncShift(): void {
    const on = this.shift !== "off";
    this.el.querySelectorAll<HTMLElement>(".pk-key").forEach((el) => {
      const k = (el as HTMLElement & { _key?: PageKey })._key;
      if (!k) return;
      if (k.key === "Shift") {
        el.classList.toggle("on", on);
        el.classList.toggle("lock", this.shift === "lock");
      } else if (k.char && /[a-z]/.test(k.char)) {
        el.textContent = on ? k.char.toUpperCase() : k.char;
      }
    });
  }

  private down(e: PointerEvent): void {
    const el = (e.target as Element).closest<HTMLElement>(".pk-key");
    const key = (el as (HTMLElement & { _key?: PageKey }) | null)?._key;
    if (!el || !key) return;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Optional.
    }
    el.classList.add("down");
    this.tapFeedback();
    if (key.key === "Shift") {
      const now = performance.now();
      const quick = now - this.lastShiftTap < 350;
      this.lastShiftTap = now;
      this.shift = this.shift === "off" ? "once" : this.shift === "once" && quick ? "lock" : "off";
      this.syncShift();
      this.send("keydown", key, false);
      this.held.set(e.pointerId, { key, el, timer: 0, repeat: 0 });
      return;
    }
    this.press(key, false);
    const timer = window.setTimeout(() => {
      const held = this.held.get(e.pointerId);
      if (held) held.repeat = window.setInterval(() => this.press(key, true), REPEAT_EVERY);
    }, REPEAT_DELAY);
    this.held.set(e.pointerId, { key, el, timer, repeat: 0 });
  }

  private up(e: PointerEvent): void {
    const held = this.held.get(e.pointerId);
    if (!held) return;
    this.held.delete(e.pointerId);
    clearTimeout(held.timer);
    clearInterval(held.repeat);
    held.el.classList.remove("down");
    this.send("keyup", held.key, false);
    if (held.key.char && this.shift === "once") {
      this.shift = "off";
      this.syncShift();
    }
  }

  /** One key press as a browser does it: keydown, then (for text) keypress and typing. */
  private press(key: PageKey, repeat: boolean): void {
    const target = this.target();
    if (!target) return;
    const proceed = this.send("keydown", key, repeat);
    if (!proceed) return;
    if (key.char) {
      this.send("keypress", key, repeat);
      this.type(target.el, target.win, this.text(key));
    } else if (key.key === "Backspace") {
      this.erase(target.el, target.win);
    } else if (key.key === "Enter") {
      this.enter(target.el, target.win);
    }
  }

  private text(key: PageKey): string {
    return key.char && this.shift !== "off" ? key.char.toUpperCase() : key.char ?? "";
  }

  private target(): { win: Window & typeof globalThis; doc: Document; el: Element } | null {
    const win = this.frame()?.contentWindow as (Window & typeof globalThis) | null;
    if (!win) return null;
    try {
      const doc = win.document;
      const active = doc.activeElement;
      return { win, doc, el: active && active !== doc.documentElement ? active : doc.body ?? doc.documentElement };
    } catch {
      return null;
    }
  }

  /** Sends one keyboard event. Returns false when the page called preventDefault(). */
  private send(type: "keydown" | "keyup" | "keypress", key: PageKey, repeat: boolean): boolean {
    const t = this.target();
    if (!t) return false;
    const shifted = this.shift !== "off";
    const value = key.char ? this.text(key) : key.key;
    const ev = new t.win.KeyboardEvent(type, {
      key: value,
      code: key.code,
      repeat,
      shiftKey: shifted || key.key === "Shift" && type === "keydown",
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    // Older code reads keyCode / which (e.g. 13 for Enter); browsers don't let us set them, so add them.
    const codeNum = type === "keypress" ? value.charCodeAt(0) : key.keyCode;
    Object.defineProperty(ev, "keyCode", { get: () => codeNum });
    Object.defineProperty(ev, "which", { get: () => codeNum });
    Object.defineProperty(ev, "charCode", { get: () => (type === "keypress" ? codeNum : 0) });
    return t.el.dispatchEvent(ev);
  }

  private editable(el: Element, win: Window & typeof globalThis): HTMLInputElement | HTMLTextAreaElement | null {
    if (el instanceof win.HTMLTextAreaElement) return el;
    if (el instanceof win.HTMLInputElement && /^(text|search|email|url|tel|password|number|)$/.test(el.type)) return el;
    return null;
  }

  private type(el: Element, win: Window & typeof globalThis, text: string): void {
    const field = this.editable(el, win);
    if (field) {
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? start;
      try {
        field.setRangeText(text, start, end, "end");
      } catch {
        field.value += text;
      }
      field.dispatchEvent(new win.InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    } else if ((el as HTMLElement).isContentEditable) {
      el.ownerDocument.execCommand("insertText", false, text);
    }
  }

  private erase(el: Element, win: Window & typeof globalThis): void {
    const field = this.editable(el, win);
    if (field) {
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? start;
      if (start === end && start === 0) return;
      try {
        field.setRangeText("", start === end ? start - 1 : start, end, "end");
      } catch {
        field.value = field.value.slice(0, -1);
      }
      field.dispatchEvent(new win.InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    } else if ((el as HTMLElement).isContentEditable) {
      el.ownerDocument.execCommand("delete");
    }
  }

  private enter(el: Element, win: Window & typeof globalThis): void {
    if (el instanceof win.HTMLTextAreaElement) {
      this.type(el, win, "\n");
    } else if (el instanceof win.HTMLInputElement) {
      el.form?.requestSubmit();
    } else if (el instanceof win.HTMLButtonElement || el instanceof win.HTMLAnchorElement) {
      (el as HTMLElement).click();
    }
  }
}
