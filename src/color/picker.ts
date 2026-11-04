// The color picker sheet.
import { h } from "../ui/dom";
import type { Overlays } from "../ui/overlay";
import { cssOf, formatColor, hsvToRgb, parseColor, rgbToHsv, type ColorFormat, type RGBA } from "./color";

const PALETTE = [
  "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#30b0c7", "#32ade6", "#007aff",
  "#5856d6", "#af52de", "#ff2d55", "#a2845e", "#000000", "#3a3a3c", "#8e8e93", "#ffffff",
];

export interface PickerOptions {
  overlays: Overlays;
  /** The color being edited, or null for a new one. */
  initial: RGBA | null;
  format: ColorFormat;
  /** Keep hex in capitals if the original was. */
  upper?: boolean;
  /** Colors already used in the file, shown first. */
  used: string[];
  onPick(value: string): void;
}

export function openColorPicker(o: PickerOptions): void {
  const start: RGBA = o.initial ?? { r: 10, g: 132, b: 255, a: 1 };
  let { h: hue, s: sat, v: val } = rgbToHsv(start);
  let alpha = start.a;
  let format: ColorFormat = o.format;

  const current = (): RGBA => ({ ...hsvToRgb(hue, sat, val), a: alpha });

  const oldSwatch = h("span.cp-old", { title: "Before" });
  const newSwatch = h("span.cp-new", { title: "New color" });
  oldSwatch.style.setProperty("--c", o.initial ? cssOf(o.initial) : "transparent");
  const value = h("output.cp-value");

  const svThumb = h("span.cp-thumb");
  const sv = h("div.cp-sv", { role: "slider", "aria-label": "Saturation and brightness" }, svThumb);
  const hueKnob = h("span.cp-knob");
  const hueBar = h("div.cp-bar.cp-hue", { role: "slider", "aria-label": "Hue" }, hueKnob);
  const alphaKnob = h("span.cp-knob");
  const alphaBar = h("div.cp-bar.cp-alpha", { role: "slider", "aria-label": "Opacity" }, h("span.cp-alpha-fill"), alphaKnob);

  const formats = h("div.seg.cp-formats", { role: "radiogroup" });
  for (const [f, label] of [["hex", "HEX"], ["rgb", "RGB"], ["hsl", "HSL"]] as [ColorFormat, string][]) {
    const b = h("button", { type: "button", role: "radio", "data-f": f }, label);
    b.addEventListener("click", () => {
      format = f;
      render();
    });
    formats.append(b);
  }

  const swatches = h("div.cp-swatches");
  const addSwatch = (color: string, label?: string) => {
    const c = parseColor(color);
    if (!c) return;
    const b = h("button.cp-swatch", { type: "button", "aria-label": label ?? color, title: color });
    b.style.setProperty("--c", cssOf(c));
    b.addEventListener("click", () => {
      ({ h: hue, s: sat, v: val } = rgbToHsv(c));
      alpha = c.a;
      render();
    });
    swatches.append(b);
  };
  const used = o.used.filter((c) => !PALETTE.includes(c.toLowerCase()));
  if (used.length) {
    swatches.append(h("span.cp-label", {}, "In this file"));
    used.forEach((c) => addSwatch(c));
    swatches.append(h("span.cp-break"));
  }
  PALETTE.forEach((c) => addSwatch(c));

  const cancel = h("button.btn", { type: "button" }, "Cancel");
  const use = h("button.btn.primary", { type: "button" }, "Use color");

  function render(): void {
    const c = current();
    const opaque = `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
    sv.style.setProperty("--hue", `hsl(${hue}, 100%, 50%)`);
    svThumb.style.left = `${sat * 100}%`;
    svThumb.style.top = `${(1 - val) * 100}%`;
    svThumb.style.background = opaque;
    hueKnob.style.left = `${(hue / 360) * 100}%`;
    hueKnob.style.background = `hsl(${hue}, 100%, 50%)`;
    alphaBar.style.setProperty("--c", opaque);
    alphaKnob.style.left = `${alpha * 100}%`;
    newSwatch.style.setProperty("--c", cssOf(c));
    value.textContent = formatColor(c, format, o.upper);
    formats.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      const on = b.dataset.f === format;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  }

  /** Dragging inside an area: calls `set` with the finger's position from 0 to 1. */
  const drag = (el: HTMLElement, set: (x: number, y: number) => void) => {
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      render();
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      move(e);
    });
    el.addEventListener("pointermove", (e) => {
      if (el.hasPointerCapture(e.pointerId)) move(e);
    });
  };
  drag(sv, (x, y) => {
    sat = x;
    val = 1 - y;
  });
  drag(hueBar, (x) => (hue = Math.min(359.9, x * 360)));
  drag(alphaBar, (x) => (alpha = Math.round(x * 100) / 100));

  const body = h(
    "div.cp",
    {},
    h("div.cp-top", {}, h("span.cp-compare", {}, oldSwatch, newSwatch), value),
    sv,
    hueBar,
    alphaBar,
    formats,
    swatches,
    h("div.dialog-actions", {}, cancel, use)
  );
  const sheet = o.overlays.sheet({ title: "Color", body, className: "cp-sheet" });
  cancel.addEventListener("click", () => sheet.close());
  use.addEventListener("click", () => {
    const text = formatColor(current(), format, o.upper);
    sheet.close();
    o.onPick(text);
  });
  render();
}
