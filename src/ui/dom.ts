import { settings } from "../settings";

type Attrs = Record<string, string | number | boolean | undefined>;

/** Small element helper: h("button.primary", { type: "button" }, "Save"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}` | `${K}#${string}`,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const [tagAndId, ...classes] = spec.split(".");
  const [tag, id] = tagAndId.split("#");
  const el = document.createElement(tag as K);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(" ");
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    el.append(child);
  }
  return el;
}

/** Inline SVG icon from a path list (24x24 grid, stroked). */
export function icon(paths: string, opts: { fill?: boolean; size?: number; stroke?: number } = {}): SVGSVGElement {
  const size = opts.size ?? 20;
  const wrap = document.createElement("span");
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${opts.fill ? "currentColor" : "none"}" stroke="${opts.fill ? "none" : "currentColor"}" stroke-width="${opts.stroke ?? 2}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

export const icons = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="7.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>',
  chevronLeft: '<path d="M14.5 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  filePlus: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5z"/><path d="M14 3.5V8h4.5M12 11v6M9 14h6"/>',
  folderPlus: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7z"/><path d="M12 10.5v5M9.5 13h5"/>',
  folder: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7z"/>',
  folderOpen: '<path d="M3.5 17.5V7A1.5 1.5 0 0 1 5 5.5h4l2 2h7A1.5 1.5 0 0 1 19.5 9v1.5"/><path d="M3.5 17.5l2.6-6.2a1.5 1.5 0 0 1 1.4-.8h12.4a1 1 0 0 1 .9 1.4l-2.4 5.7a1.5 1.5 0 0 1-1.4.9H5a1.5 1.5 0 0 1-1.5-1z"/>',
  zip: '<rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><path d="M12 3.5v2M12 7.5v2M12 11.5v2"/><rect x="10.5" y="15" width="3" height="3" rx=".6"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16.5V20"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  chevronRightSmall: '<path d="M10 7l5 5-5 5"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>',
};

/** Marks an input so the custom keyboard types into it, and hides the system keyboard when custom mode is on. */
export function kbInput(el: HTMLInputElement): HTMLInputElement {
  el.dataset.kb = "";
  el.autocomplete = "off";
  el.spellcheck = false;
  el.setAttribute("autocapitalize", "off");
  el.setAttribute("autocorrect", "off");
  el.inputMode = settings.value.keyboard === "custom" ? "none" : "text";
  return el;
}

export function refreshKbInputs(): void {
  const mode = settings.value.keyboard === "custom" ? "none" : "text";
  document.querySelectorAll<HTMLInputElement>("input[data-kb]").forEach((el) => (el.inputMode = mode));
}

/** Keeps focus where it is (e.g. in the editor or a text field) when this control is tapped. */
export function keepFocus<T extends HTMLElement>(el: T): T {
  el.addEventListener("pointerdown", (e) => e.preventDefault());
  el.addEventListener("mousedown", (e) => e.preventDefault());
  return el;
}
