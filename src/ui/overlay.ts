import { h, icon, icons, kbInput } from "./dom";

interface Layer {
  el: HTMLElement;
  scrim: HTMLElement;
  /** Hides the code keyboard while open (menus and settings don't need it). */
  suspendKeyboard: boolean;
  onClose?: () => void;
}

export interface SheetOptions {
  title: string;
  body: HTMLElement;
  /** Keep the code keyboard visible (for sheets with a text field). */
  keyboard?: boolean;
  className?: string;
  onClose?: () => void;
}

export interface Handle {
  close(): void;
  el: HTMLElement;
}

export class Overlays {
  private layers: Layer[] = [];
  private toastEl: HTMLElement;
  private toastTimer = 0;

  constructor(private area: HTMLElement, private app: HTMLElement, private onAllClosed: () => void) {
    this.toastEl = h("div.toast", { role: "status", "aria-live": "polite" });
    this.toastEl.hidden = true;
    area.append(this.toastEl);
  }

  get isOpen(): boolean {
    return this.layers.length > 0;
  }

  /** The text field of the top layer, if it has one. */
  topInput(): HTMLInputElement | null {
    const top = this.layers[this.layers.length - 1];
    return top?.el.querySelector<HTMLInputElement>("input[data-kb]") ?? null;
  }

  toast(message: string, ms = 1600): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastEl.classList.remove("show");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove("show");
      this.toastEl.hidden = true;
    }, ms);
  }

  private push(el: HTMLElement, parent: HTMLElement, suspendKeyboard: boolean, onClose?: () => void): Handle {
    const scrim = h("div.scrim");
    const layer: Layer = { el, scrim, suspendKeyboard, onClose };
    scrim.addEventListener("click", () => this.close(layer));
    parent.append(scrim, el);
    this.layers.push(layer);
    this.syncKeyboard();
    requestAnimationFrame(() => {
      scrim.classList.add("in");
      el.classList.add("in");
    });
    return { el, close: () => this.close(layer) };
  }

  private close(layer: Layer): void {
    const i = this.layers.indexOf(layer);
    if (i < 0) return;
    this.layers.splice(i, 1);
    layer.el.remove();
    layer.scrim.remove();
    layer.onClose?.();
    this.syncKeyboard();
    if (!this.layers.length) this.onAllClosed();
  }

  /** Closes the top layer. Returns false when nothing was open. */
  closeTop(): boolean {
    const top = this.layers[this.layers.length - 1];
    if (!top) return false;
    this.close(top);
    return true;
  }

  closeAll(): void {
    while (this.closeTop()) {
      // keep closing
    }
  }

  private syncKeyboard(): void {
    this.app.classList.toggle("kb-suspended", this.layers.some((l) => l.suspendKeyboard));
  }

  sheet(o: SheetOptions): Handle {
    let handle: Handle;
    const closeBtn = h("button.icon-btn", { type: "button", "aria-label": "Close" }, icon(icons.close));
    const el = h(
      `section.sheet${o.className ? "." + o.className : ""}` as "section",
      { role: "dialog", "aria-label": o.title },
      h("header.sheet-head", {}, h("h2", {}, o.title), closeBtn),
      h("div.sheet-body", {}, o.body)
    );
    closeBtn.addEventListener("click", () => handle.close());
    handle = this.push(el, this.area, !o.keyboard, o.onClose);
    return handle;
  }

  drawer(body: HTMLElement, label: string): Handle {
    const el = h("aside.drawer", { role: "dialog", "aria-label": label }, body);
    return this.push(el, this.app, true);
  }

  prompt(o: {
    title: string;
    value?: string;
    placeholder?: string;
    ok?: string;
    /** Characters to select when the dialog opens, e.g. the name before the extension. */
    select?: [number, number];
    validate?: (value: string) => string | null;
  }): Promise<string | null> {
    return new Promise((resolve) => {
      let done = false;
      const input = kbInput(h("input.field", { type: "text", placeholder: o.placeholder ?? "", "aria-label": o.title }));
      input.value = o.value ?? "";
      const error = h("p.field-error", { role: "alert" });
      const cancel = h("button.btn", { type: "button" }, "Cancel");
      const ok = h("button.btn.primary", { type: "button" }, o.ok ?? "OK");
      const form = h("div.dialog-body", {}, h("h2", {}, o.title), input, error, h("div.dialog-actions", {}, cancel, ok));
      const el = h("section.dialog", { role: "dialog", "aria-label": o.title }, form);

      const finish = (value: string | null) => {
        if (done) return;
        done = true;
        handle.close();
        resolve(value);
      };
      const submit = () => {
        const v = input.value.trim();
        const problem = o.validate?.(v) ?? (v ? null : "Enter a name.");
        if (problem) {
          error.textContent = problem;
          input.focus();
          return;
        }
        finish(v);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          finish(null);
        }
      });
      input.addEventListener("input", () => (error.textContent = ""));
      cancel.addEventListener("click", () => finish(null));
      ok.addEventListener("click", submit);
      const handle = this.push(el, this.area, false, () => finish(null));
      input.focus();
      const [s, e] = o.select ?? [0, input.value.length];
      input.setSelectionRange(s, e);
    });
  }

  confirm(o: { title: string; message: string; ok: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const cancel = h("button.btn", { type: "button" }, "Cancel");
      const ok = h(`button.btn.${o.danger ? "danger" : "primary"}` as "button", { type: "button" }, o.ok);
      const el = h(
        "section.dialog",
        { role: "alertdialog", "aria-label": o.title },
        h("div.dialog-body", {}, h("h2", {}, o.title), h("p", {}, o.message), h("div.dialog-actions", {}, cancel, ok))
      );
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        handle.close();
        resolve(v);
      };
      cancel.addEventListener("click", () => finish(false));
      ok.addEventListener("click", () => finish(true));
      const handle = this.push(el, this.area, true, () => finish(false));
    });
  }
}

/** A list of tappable rows for menus. */
export function menuList(items: ({ label: string; icon?: string; hint?: string; danger?: boolean; run: () => void } | null)[]): HTMLElement {
  const list = h("div.menu");
  for (const item of items) {
    if (!item) {
      list.append(h("div.menu-sep"));
      continue;
    }
    const row = h(
      `button.menu-item${item.danger ? ".danger" : ""}` as "button",
      { type: "button" },
      item.icon ? icon(item.icon) : h("span.menu-gap"),
      h("span.menu-label", {}, item.label),
      item.hint ? h("span.menu-hint", {}, item.hint) : null
    );
    row.addEventListener("click", item.run);
    list.append(row);
  }
  return list;
}
