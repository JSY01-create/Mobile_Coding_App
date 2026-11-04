import { isNative, nativeTap } from "../native";
import { h } from "../ui/dom";
import { accessoryRow, keyboardRows, keyIcons, type Action, type Cmd, type KeyDef, type RowDef } from "./layout";
import type { Target } from "./targets";

export interface KeyboardHost {
  /** Where the next key press goes (may close a menu or focus a field). */
  target(): Target;
  /** Same as target(), without side effects; used to grey out keys. */
  peek(): Target;
  /** App-level commands such as find or hiding the keyboard. */
  command(cmd: Cmd): void;
  vibrate(): boolean;
  toast(message: string): void;
  afterInput(): void;
}

type Mode = "pending" | "popup" | "trackpad" | "repeat" | "done";
type Shift = "off" | "once" | "lock";

interface Press {
  pointerId: number;
  key: KeyDef;
  el: HTMLElement;
  x0: number;
  y0: number;
  /** Trackpad: last finger position and distance not yet turned into cursor steps. */
  lx: number;
  ly: number;
  lt: number;
  accX: number;
  accY: number;
  mode: Mode;
  timer?: number;
  repeatTimer?: number;
  popupIndex: number;
}

const LONG_PRESS_MS = 350;
const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 55;
/** Finger travel per character / per line in trackpad mode. */
const TRACK_X = 9;
const TRACK_Y = 22;
/** How far a finger must slide before a key press turns into cursor movement. */
const START_SPACE = { x: 8, y: 12 };
const START_KEY = { x: 18, y: 24 };

export class Keyboard {
  readonly el: HTMLElement;
  readonly bar: HTMLElement;
  private keys = new Map<string, KeyDef>();
  private keyEls = new Map<string, HTMLElement>();
  private presses = new Map<number, Press>();
  private shift: Shift = "off";
  private lastShiftTap = 0;
  private balloon: HTMLElement;
  private balloonOwner: Press | null = null;
  private popup: HTMLElement;
  private popupOwner: Press | null = null;

  constructor(private host: KeyboardHost) {
    this.bar = h("div.accessory", { role: "toolbar", "aria-label": "Cursor and tools" }, this.renderRow(accessoryRow));
    this.balloon = h("div.kb-balloon", { "aria-hidden": "true" });
    this.popup = h("div.kb-popup", { role: "listbox" });
    this.balloon.hidden = true;
    this.popup.hidden = true;
    this.el = h(
      "div.keyboard",
      { role: "group", "aria-label": "Code keyboard" },
      ...keyboardRows.map((r) => this.renderRow(r)),
      this.balloon,
      this.popup
    );
    this.listen(this.el);
    this.listen(this.bar);
    this.updateLabels();
  }

  private renderRow(row: RowDef): HTMLElement {
    const el = h(`div.kb-row${row.className ? "." + row.className : ""}` as "div");
    el.style.gridTemplateColumns = `repeat(${row.cols}, minmax(0, 1fr))`;
    for (const key of row.keys) {
      const k = h(`div.key.tone-${key.tone}` as "div", {
        "data-key": key.id,
        role: "button",
        "aria-label": key.icon || key.word ? key.label : key.id === "space" ? "space" : key.label,
      });
      if (key.span !== 1) k.style.gridColumn = `span ${key.span}`;
      if (key.icon) k.append(h("span.k-icon"));
      else k.append(h(`span.k-label${key.word ? ".word" : ""}` as "span"));
      if (key.shift || key.letter || key.alts) k.append(h("span.k-hint"));
      if (key.label.length > 1 && !key.word && !key.icon) k.classList.add("pair");
      el.append(k);
      this.keys.set(key.id, key);
      this.keyEls.set(key.id, k);
    }
    return el;
  }

  /** Labels change with shift: letters go uppercase, symbol keys swap to their shift symbol. */
  private updateLabels(): void {
    const shifted = this.shift !== "off";
    for (const [id, key] of this.keys) {
      const el = this.keyEls.get(id)!;
      if (key.icon) {
        let name = key.icon;
        if (id === "shift") name = this.shift === "lock" ? "capsLock" : this.shift === "once" ? "shiftOn" : "shift";
        const iconEl = el.querySelector(".k-icon")!;
        if (iconEl.getAttribute("data-icon") !== name) {
          iconEl.setAttribute("data-icon", name);
          iconEl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${keyIcons[name]}</svg>`;
        }
        continue;
      }
      const label = el.querySelector<HTMLElement>(".k-label")!;
      const hint = el.querySelector<HTMLElement>(".k-hint");
      if (key.letter) {
        label.textContent = shifted ? key.label.toUpperCase() : key.label;
        continue;
      }
      if (key.shift && shifted) {
        label.textContent = key.shift.label;
        if (hint) hint.textContent = key.label;
      } else {
        label.textContent = key.label;
        if (hint) hint.textContent = key.shift?.label ?? "";
      }
      el.classList.toggle("long", label.textContent!.length > 1 && key.action.kind !== "pair");
    }
    const shiftEl = this.keyEls.get("shift");
    shiftEl?.classList.toggle("on", shifted);
    shiftEl?.setAttribute("aria-pressed", String(shifted));
  }

  /** Greys out undo, redo and copy when they would do nothing. */
  refresh(): void {
    const t = this.host.peek();
    this.keyEls.get("undo")?.classList.toggle("disabled", !t.canUndo());
    this.keyEls.get("redo")?.classList.toggle("disabled", !t.canRedo());
    this.keyEls.get("copy")?.classList.toggle("disabled", !t.hasSelection());
  }

  setHints(on: boolean): void {
    this.el.classList.toggle("no-hints", !on);
  }

  private listen(root: HTMLElement): void {
    root.addEventListener("pointerdown", (e) => this.down(e));
    root.addEventListener("pointermove", (e) => this.move(e));
    root.addEventListener("pointerup", (e) => this.up(e, true));
    root.addEventListener("pointercancel", (e) => this.up(e, false));
    // Stop taps from moving focus away from the editor, scrolling, or opening the callout menu.
    root.addEventListener("touchstart", (e) => e.cancelable && e.preventDefault(), { passive: false });
    root.addEventListener("mousedown", (e) => e.preventDefault());
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private down(e: PointerEvent): void {
    const keyEl = (e.target as Element).closest<HTMLElement>("[data-key]");
    if (!keyEl) return;
    e.preventDefault();
    const key = this.keys.get(keyEl.dataset.key!);
    if (!key) return;
    // Fast typing: a new touch commits any key still waiting for its release.
    this.flushPending();
    try {
      keyEl.setPointerCapture(e.pointerId);
    } catch {
      // Capture is optional.
    }
    const p: Press = {
      pointerId: e.pointerId, key, el: keyEl,
      x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, accX: 0, accY: 0,
      mode: "pending", popupIndex: 0,
    };
    this.presses.set(e.pointerId, p);
    keyEl.classList.add("down");
    this.buzz();

    if (key.action.kind === "cmd" && key.action.cmd === "shift") {
      this.tapShift();
      p.mode = "done";
      return;
    }
    if (key.repeat) {
      p.mode = "repeat";
      this.fire(key);
      p.timer = window.setTimeout(() => {
        p.repeatTimer = window.setInterval(() => this.fire(key), REPEAT_MS);
      }, REPEAT_DELAY_MS);
      return;
    }
    if (key.balloon) this.showBalloon(p);
    if (key.alts?.length) p.timer = window.setTimeout(() => this.openPopup(p), LONG_PRESS_MS);
  }

  private move(e: PointerEvent): void {
    const p = this.presses.get(e.pointerId);
    if (!p) return;
    if (p.mode === "pending" || p.mode === "trackpad") this.trackpad(p, e);
    else if (p.mode === "popup") this.pickPopup(p, e.clientX);
  }

  private up(e: PointerEvent, commit: boolean): void {
    const p = this.presses.get(e.pointerId);
    if (!p) return;
    this.presses.delete(e.pointerId);
    this.release(p);
    if (!commit) {
      if (this.popupOwner === p) this.closePopup();
      return;
    }
    if (p.mode === "pending") {
      this.fire(p.key);
    } else if (p.mode === "popup") {
      const choice = p.key.alts?.[p.popupIndex];
      this.closePopup();
      if (choice) this.run(choice.action);
    } else if (p.mode === "trackpad") {
      if (this.shift === "once") this.setShift("off");
    }
  }

  private release(p: Press): void {
    clearTimeout(p.timer);
    clearInterval(p.repeatTimer);
    p.el.classList.remove("down");
    if (this.balloonOwner === p) this.hideBalloon();
    if (p.mode === "trackpad") this.el.classList.remove("trackpad");
  }

  private flushPending(): void {
    for (const p of this.presses.values()) {
      if (p.mode !== "pending") continue;
      clearTimeout(p.timer);
      p.mode = "done";
      if (this.balloonOwner === p) this.hideBalloon();
      this.fire(p.key);
    }
  }

  private fire(key: KeyDef): void {
    let action: Action = key.action;
    if (this.shift !== "off") {
      if (key.letter) action = { kind: "text", text: key.label.toUpperCase() };
      else if (key.shift) action = key.shift.action;
    }
    this.run(action);
  }

  private run(action: Action): void {
    const target = this.host.target();
    if (action.kind === "text") {
      target.insert(action.text);
      this.consumeShift();
    } else if (action.kind === "pair") {
      target.pair(action.open, action.close);
      this.consumeShift();
    } else {
      this.runCmd(action.cmd, target);
    }
    this.host.afterInput();
  }

  private runCmd(cmd: Cmd, target: Target): void {
    const select = this.shift !== "off";
    switch (cmd) {
      case "backspace": target.backspace(); break;
      case "enter": target.enter(); break;
      case "tab":
        target.tab(select);
        this.consumeShift();
        break;
      case "outdent": target.tab(true); break;
      case "left": case "right": case "up": case "down":
        target.move(cmd, select);
        break;
      case "home": target.edge(false, select); break;
      case "end": target.edge(true, select); break;
      case "undo": target.undo(); break;
      case "redo": target.redo(); break;
      case "copy":
        if (!target.hasSelection()) {
          this.host.toast("Select text first. Hold copy to select the line.");
          break;
        }
        void target.copy().then((ok) => ok && this.host.toast("Copied"));
        break;
      case "cut":
        if (!target.hasSelection()) target.selectLine();
        void target.cut().then((ok) => ok && this.host.toast("Cut"));
        break;
      case "paste": void target.paste().then(() => this.host.afterInput()); break;
      case "selectAll": target.selectAll(); break;
      case "selectLine": target.selectLine(); break;
      case "comment": target.comment(); break;
      default: this.host.command(cmd);
    }
  }

  private tapShift(): void {
    const now = performance.now();
    const quick = now - this.lastShiftTap < 350;
    this.lastShiftTap = now;
    if (this.shift === "off") this.setShift("once");
    else if (this.shift === "once") this.setShift(quick ? "lock" : "off");
    else this.setShift("off");
  }

  private setShift(s: Shift): void {
    if (s === this.shift) return;
    this.shift = s;
    this.updateLabels();
  }

  private consumeShift(): void {
    if (this.shift === "once") this.setShift("off");
  }

  /**
   * Slide a finger across the keys to move the cursor, like a trackpad (select while shift is on).
   * Works from any key: the space bar starts after a short slide, other keys after a longer one,
   * so normal taps still type.
   */
  private trackpad(p: Press, e: PointerEvent): void {
    if (p.mode === "pending") {
      if (!this.el.contains(p.el)) return;
      const start = p.key.id === "space" ? START_SPACE : START_KEY;
      if (Math.abs(e.clientX - p.x0) < start.x && Math.abs(e.clientY - p.y0) < start.y) return;
      p.mode = "trackpad";
      clearTimeout(p.timer);
      if (this.balloonOwner === p) this.hideBalloon();
      p.el.classList.remove("down");
      p.lx = e.clientX;
      p.ly = e.clientY;
      p.lt = e.timeStamp;
      this.el.classList.add("trackpad");
      return;
    }
    const dx = e.clientX - p.lx;
    const dy = e.clientY - p.ly;
    const dt = Math.max(1, e.timeStamp - p.lt);
    p.lx = e.clientX;
    p.ly = e.clientY;
    p.lt = e.timeStamp;
    // Faster swipes move further (up to 3x), slow ones stay precise.
    const speed = Math.abs(dx) / dt;
    const boost = 1 + Math.min(2, Math.max(0, (speed - 0.45) * 2));
    p.accX += dx * boost;
    p.accY += dy;

    const target = this.host.target();
    const select = this.shift !== "off";
    let moved = false;
    while (p.accX >= TRACK_X) { target.move("right", select); p.accX -= TRACK_X; moved = true; }
    while (p.accX <= -TRACK_X) { target.move("left", select); p.accX += TRACK_X; moved = true; }
    while (p.accY >= TRACK_Y) { target.move("down", select); p.accY -= TRACK_Y; moved = true; }
    while (p.accY <= -TRACK_Y) { target.move("up", select); p.accY += TRACK_Y; moved = true; }
    if (moved) this.host.afterInput();
  }

  private showBalloon(p: Press): void {
    const label = p.el.querySelector(".k-label")?.textContent;
    if (!label) return;
    this.balloonOwner = p;
    const kb = this.el.getBoundingClientRect();
    const r = p.el.getBoundingClientRect();
    this.balloon.textContent = label;
    this.balloon.className = `kb-balloon tone-${p.key.tone}${label.length > 1 ? " long" : ""}`;
    this.balloon.hidden = false;
    const w = Math.max(r.width + 14, this.balloon.offsetWidth);
    const left = Math.min(Math.max(r.left - kb.left + r.width / 2 - w / 2, 2), kb.width - w - 2);
    this.balloon.style.width = `${w}px`;
    this.balloon.style.transform = `translate(${left}px, ${r.top - kb.top - this.balloon.offsetHeight - 4}px)`;
  }

  private hideBalloon(): void {
    this.balloon.hidden = true;
    this.balloonOwner = null;
  }

  private openPopup(p: Press): void {
    if (this.presses.get(p.pointerId) !== p || p.mode !== "pending" || !p.key.alts?.length) return;
    p.mode = "popup";
    this.hideBalloon();
    this.popup.replaceChildren(
      ...p.key.alts.map((a, i) => h("div.kb-opt", { role: "option", "data-i": i }, a.label))
    );
    this.popup.classList.remove("rev");
    this.popup.hidden = false;
    const kb = this.el.getBoundingClientRect();
    const r = p.el.getBoundingClientRect();
    const pw = this.popup.offsetWidth;
    const first = (this.popup.firstElementChild as HTMLElement).offsetWidth;
    // Put the first option right above the finger; near the right edge, list the options leftwards.
    const center = r.left - kb.left + r.width / 2;
    let left = center - first / 2;
    if (left + pw > kb.width - 2) {
      this.popup.classList.add("rev");
      left = center + first / 2 - pw;
    }
    left = Math.min(Math.max(left, 2), kb.width - pw - 2);
    this.popup.style.transform = `translate(${left}px, ${r.top - kb.top - this.popup.offsetHeight - 6}px)`;
    this.popupOwner = p;
    p.popupIndex = 0;
    this.pickPopup(p, p.x0);
    this.buzz();
  }

  private pickPopup(p: Press, x: number): void {
    const opts = [...this.popup.children] as HTMLElement[];
    let best = 0;
    let bestDist = Infinity;
    opts.forEach((o, i) => {
      const r = o.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    p.popupIndex = best;
    opts.forEach((o, i) => o.classList.toggle("sel", i === best));
  }

  private closePopup(): void {
    this.popup.hidden = true;
    this.popupOwner = null;
  }

  private buzz(): void {
    if (!this.host.vibrate()) return;
    if (isNative) {
      nativeTap();
      return;
    }
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate(5);
      } catch {
        // Not supported here.
      }
    }
  }
}
