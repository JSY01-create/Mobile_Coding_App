import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-400-italic.css";
import "./styles.css";

import { closeSearchPanel, openSearchPanel, searchPanelOpen } from "@codemirror/search";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createState, parts, settingEffects, type EditorHooks } from "./editor";
import { FileStore, type FileRec } from "./files";
import { Keyboard, type KeyboardHost } from "./keyboard/keyboard";
import { EditorTarget, InputTarget, type Target } from "./keyboard/targets";
import { writeClipboard } from "./keyboard/clipboard";
import { allLanguages, detect, languageFor, loadLanguage, mainExtension, PLAIN, popularNames } from "./languages";
import { settings, type Settings } from "./settings";
import { fileLanguage, prepareFor, setCssProvider, setWorkspace } from "./snippets";
import { h, icon, icons, kbInput, keepFocus, refreshKbInputs } from "./ui/dom";
import { menuList, Overlays } from "./ui/overlay";
import { Explorer } from "./ui/explorer";
import { Preview, type RunTarget } from "./run/preview";
import { basename, dirname } from "./paths";
import { isNative, onBackButton } from "./native";
import { appWorkspace, chooseWorkspace, copyWorkspace, phoneWorkspace, requestPhoneStorage, type Workspace } from "./workspace";
import { loadJSON, saveJSON } from "./storage";

/** The open workspace. Replaced when files move to phone storage. */
let files = new FileStore(appWorkspace(), reportError);

function reportError(message: string): void {
  overlays.toast(message, 3200);
}

// ---- Layout ------------------------------------------------------------------

const app = document.getElementById("app")!;
const fileDir = h("span.file-dir");
const fileName = h("span.file-name");
const titleBtn = h("button.file-title", { type: "button", "aria-label": "Rename or move file" }, fileDir, fileName);
const langBtn = h("button.lang-pill", { type: "button", "aria-label": "Change language" }, h("span.lang-name"), icon(icons.chevronDown, { size: 14 }));
const filesBtn = h("button.icon-btn", { type: "button", "aria-label": "Files" }, icon(icons.menu));
const moreBtn = h("button.icon-btn", { type: "button", "aria-label": "More" }, icon(icons.more));
const runBtn = h("button.icon-btn.run-btn", { type: "button", "aria-label": "Run", title: "Run" }, icon(icons.play, { size: 22 }));
const header = h("header.topbar", {}, filesBtn, titleBtn, runBtn, langBtn, moreBtn);

const editorHost = h("div.editor-host");
const showKbBtn = keepFocus(h("button.show-kb", { type: "button", "aria-label": "Show keyboard" }, icon(icons.keyboard, { size: 22 })));
const editorArea = h("main.editor-area", {}, editorHost, showKbBtn);
const dock = h("div.kb-dock");
app.append(header, editorArea, dock);

const overlays = new Overlays(editorArea, app, header, () => {
  if (!document.activeElement || document.activeElement === document.body) view.focus();
});

// ---- Editor ------------------------------------------------------------------

const states = new Map<string, EditorState>();
/** Language name each cached editor state was set up with. */
const stateLang = new Map<string, string>();
let currentId = "";
let saveTimer = 0;
let refreshQueued = false;
let openToken = 0;

const hooks: EditorHooks = {
  onUpdate(u) {
    if (u.docChanged && currentId) {
      const id = currentId;
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => files.setContent(id, u.view.state.doc.toString()), 250);
    }
    queueRefresh();
  },
  tooltipSpace() {
    const r = editorArea.getBoundingClientRect();
    return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
  },
};

/** Hands the open file's text to the store (which writes it to storage shortly). */
function flushSave(): void {
  if (!currentId) return;
  clearTimeout(saveTimer);
  files.setContent(currentId, view.state.doc.toString());
}

function languageExtension(file: FileRec): Extension {
  const desc = languageFor(file);
  if (!desc) return fileLanguage.of("");
  return desc.support ? [desc.support, fileLanguage.of(desc.name)] : fileLanguage.of(desc.name);
}

function makeState(file: FileRec): EditorState {
  const state = createState(file.content ?? "", settings.value, languageExtension(file), hooks);
  stateLang.set(file.id, languageFor(file)?.support ? languageFor(file)!.name : "");
  return state;
}

const view = new EditorView({ state: createState("", settings.value, fileLanguage.of(""), hooks), parent: editorHost });

/** Loads syntax highlighting for the open file if it isn't set up yet. */
async function ensureLanguage(file: FileRec): Promise<void> {
  const desc = languageFor(file);
  const want = desc?.name ?? "";
  prepareFor(want);
  if (stateLang.get(file.id) === want) return;
  if (!desc) {
    view.dispatch({ effects: parts.language.reconfigure(fileLanguage.of("")) });
    stateLang.set(file.id, "");
    return;
  }
  try {
    const support = await loadLanguage(desc);
    if (files.activeId !== file.id || languageFor(file)?.name !== want) return;
    view.dispatch({ effects: parts.language.reconfigure([support, fileLanguage.of(desc.name)]) });
    stateLang.set(file.id, want);
  } catch {
    overlays.toast(`Couldn't load ${desc.name} highlighting. Check your connection.`);
  }
}

/** Opens a text file in the editor (`reload` re-reads it even if it is already open). */
async function openFile(id: string, reload = false): Promise<void> {
  const token = ++openToken;
  if (id !== currentId) flushSave();
  const file = await files.ensureContent(id);
  if (!file || token !== openToken) return;
  if (file.binary) {
    void explorer.preview(file);
    return;
  }
  if (id !== currentId || reload) {
    if (currentId && files.get(currentId) && id !== currentId) states.set(currentId, view.state);
    if (reload) states.delete(id);
    files.setActive(id);
    currentId = id;
    const cached = states.get(id);
    view.setState(cached ? cached.update({ effects: settingEffects(settings.value) }).state : makeState(file));
  }
  void ensureLanguage(file);
  updateHeader();
  keyboard.refresh();
}

function updateHeader(): void {
  const file = files.active;
  const dir = dirname(file.name);
  const parts = dir ? dir.split("/") : [];
  fileDir.textContent = parts.length ? `${parts.length > 2 ? "\u2026/" : ""}${parts.slice(-2).join("/")}/` : "";
  fileName.textContent = basename(file.name);
  const lang = languageFor(file);
  langBtn.querySelector(".lang-name")!.textContent = lang?.name ?? PLAIN;
  document.title = `${basename(file.name)} · Thumbcode`;
}

// ---- Keyboard ----------------------------------------------------------------

const editorTarget = new EditorTarget(
  () => view,
  () => settings.value.closeBrackets,
  () => settings.value.enterAccepts
);

function focusedInput(): HTMLInputElement | null {
  const el = document.activeElement;
  return el instanceof HTMLInputElement && el.dataset.kb !== undefined && el.isConnected ? el : null;
}

const host: KeyboardHost = {
  target(): Target {
    const input = focusedInput();
    if (input) return new InputTarget(input);
    const sheetInput = overlays.topInput();
    if (sheetInput) {
      sheetInput.focus();
      return new InputTarget(sheetInput);
    }
    // Typing while a menu is open closes it and goes back to the code.
    if (overlays.isOpen) overlays.closeAll();
    return editorTarget;
  },
  peek(): Target {
    const input = focusedInput() ?? overlays.topInput();
    return input ? new InputTarget(input) : editorTarget;
  },
  command(cmd) {
    overlays.closeAll();
    if (cmd === "search") toggleSearch();
    else if (cmd === "hide") hideKeyboard();
  },
  vibrate: () => settings.value.vibrate,
  toast: (m) => overlays.toast(m),
  afterInput: queueRefresh,
};

const keyboard = new Keyboard(host);
dock.append(keyboard.bar, keyboard.el);

function queueRefresh(): void {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    keyboard.refresh();
  });
}

function toggleSearch(): void {
  if (searchPanelOpen(view.state)) {
    closeSearchPanel(view);
    view.focus();
  } else {
    openSearchPanel(view);
  }
}

function hideKeyboard(): void {
  if (settings.value.keyboard === "system") {
    view.contentDOM.blur();
    (document.activeElement as HTMLElement | null)?.blur?.();
    return;
  }
  app.classList.add("kb-hidden");
}

function showKeyboard(): void {
  app.classList.remove("kb-hidden");
}

showKbBtn.addEventListener("click", () => {
  showKeyboard();
  view.focus();
});
// A quick tap on the code brings the hidden keyboard back. Scrolling (the browser
// cancels the pointer when it starts panning), dragging and long-press selection don't.
{
  let tap: { id: number; x: number; y: number; t: number } | null = null;
  view.dom.addEventListener("pointerdown", (e) => {
    tap = e.isPrimary ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
  });
  view.dom.addEventListener("pointercancel", () => (tap = null));
  view.dom.addEventListener("pointerup", (e) => {
    const start = tap;
    tap = null;
    if (!start || e.pointerId !== start.id || settings.value.keyboard !== "custom") return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved < 10 && e.timeStamp - start.t < 450) showKeyboard();
  });
}
document.addEventListener("focusin", queueRefresh);
document.addEventListener("selectionchange", queueRefresh);

// ---- Settings ----------------------------------------------------------------

function applySettings(s: Settings): void {
  app.classList.toggle("mode-system", s.keyboard === "system");
  app.dataset.keySize = s.keySize;
  keyboard.setHints(s.hints);
  refreshKbInputs();
}

settings.subscribe((s, changed) => {
  applySettings(s);
  if (changed.some((k) => k !== "keySize" && k !== "hints" && k !== "vibrate")) {
    view.dispatch({ effects: settingEffects(s) });
  }
  if (changed.includes("keyboard")) {
    showKeyboard();
    view.contentDOM.blur();
    requestAnimationFrame(() => view.focus());
  }
});
applySettings(settings.value);

// Pinch the code to zoom.
{
  let start: { dist: number; size: number } | null = null;
  let pending = 0;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const scroller = view.scrollDOM;
  scroller.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) start = { dist: dist(e.touches), size: settings.value.fontSize };
  }, { passive: true });
  scroller.addEventListener("touchmove", (e) => {
    if (!start || e.touches.length !== 2) return;
    e.preventDefault();
    const size = Math.round(Math.min(28, Math.max(9, start.size * (dist(e.touches) / start.dist))));
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => settings.set({ fontSize: size }));
  }, { passive: false });
  scroller.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) start = null;
  });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}

// Keep the app sized to the visible screen (the system keyboard shrinks it).
function syncViewport(): void {
  const vv = window.visualViewport;
  app.style.height = `${vv ? vv.height : window.innerHeight}px`;
  app.style.transform = vv && vv.offsetTop > 0 ? `translateY(${vv.offsetTop}px)` : "";
}
window.visualViewport?.addEventListener("resize", syncViewport);
window.visualViewport?.addEventListener("scroll", syncViewport);
window.addEventListener("resize", syncViewport);
syncViewport();

// ---- Files -------------------------------------------------------------------

/** Drops cached editors for deleted files and switches away if the open one is gone. */
function filesRemoved(ids: string[]): void {
  for (const id of ids) {
    states.delete(id);
    stateLang.delete(id);
  }
  if (!files.get(currentId)) {
    clearTimeout(saveTimer);
    currentId = "";
    void openFile(files.activeId, true);
  }
  updateHeader();
  keyboard.refresh();
}

const explorer = new Explorer({
  get files() {
    return files;
  },
  storageLabel: () => files.ws.label,
  storageShared: () => files.ws.shared,
  canUsePhoneStorage: () => isNative && !files.ws.shared,
  usePhoneStorage,
  refresh: refreshFiles,
  overlays,
  currentId: () => currentId,
  flushSave,
  openFile(id) {
    void openFile(id).then(() => view.focus());
  },
  pathsChanged(ids) {
    // A new extension can mean a new language.
    for (const id of ids) if (id !== currentId) stateLang.delete(id);
    if (ids.includes(currentId)) void ensureLanguage(files.active);
    updateHeader();
  },
  filesRemoved,
  toast: (m, ms) => overlays.toast(m, ms),
});

setWorkspace({ files: () => files.files.map((f) => f.name), current: () => files.get(currentId)?.name ?? "" });
setCssProvider(async () => {
  const css = files.files.filter((f) => /\.(css|scss|less)$/i.test(f.name) && !f.binary).slice(0, 40);
  const loaded = await Promise.all(css.map((f) => files.ensureContent(f.id)));
  return loaded.map((f) => f?.content ?? "");
});

/** Re-reads the folder so files added by other apps (Files, Gallery...) show up. */
async function refreshFiles(): Promise<void> {
  flushSave();
  let changed = false;
  try {
    changed = await files.refresh();
  } catch {
    return;
  }
  const open = files.get(currentId);
  // The open file was deleted, or changed by another app: show what is on disk now.
  if (!open || open.content === null) {
    currentId = open ? currentId : "";
    await openFile(open ? open.id : files.activeId, true);
  }
  if (changed) explorer.update();
  updateHeader();
}

/** Switches to another storage location and opens its files. */
async function useWorkspace(ws: Workspace): Promise<void> {
  flushSave();
  await files.flush();
  states.clear();
  stateLang.clear();
  currentId = "";
  files = new FileStore(ws, reportError);
  await files.load();
  await openFile(files.activeId, true);
}

/** Asks for file access, then copies the app's files to Documents/Thumbcode and uses them from there. */
async function usePhoneStorage(): Promise<void> {
  const ok = await requestPhoneStorage();
  if (!ok) {
    overlays.toast("Thumbcode didn't get file access, so files stay inside the app.", 3500);
    return;
  }
  overlays.toast("Moving your files to Documents/Thumbcode...", 6000);
  flushSave();
  await files.flush();
  try {
    const target = phoneWorkspace();
    const copied = await copyWorkspace(files.ws, target);
    await useWorkspace(target);
    overlays.toast(`Your files are in Documents/Thumbcode${copied ? ` (${copied} copied)` : ""}.`, 3500);
  } catch (e) {
    overlays.toast(`Couldn't copy files to Documents/Thumbcode: ${String((e as Error)?.message ?? e)}`, 4000);
  }
}

/** First start of the Android app: offer to keep projects where other apps can reach them. */
function offerPhoneStorage(): void {
  const KEY = "thumbcode.storageAsked";
  if (!isNative || files.ws.shared || loadJSON(KEY, false)) return;
  saveJSON(KEY, true);
  const allow = h("button.btn.primary", { type: "button" }, "Allow file access");
  const later = h("button.btn", { type: "button" }, "Not now");
  const sheet = overlays.sheet({
    title: "Keep projects in your phone's storage?",
    body: h(
      "div.storage-offer",
      {},
      h("p", {}, "Thumbcode can save your projects in Documents/Thumbcode. Then you can add images and other files with the Files or Gallery app, and every app can open what you make."),
      h("p", {}, "Android will show a screen to allow Thumbcode to manage files. Turn it on, then come back."),
      h("div.dialog-actions", {}, later, allow)
    ),
  });
  allow.addEventListener("click", () => {
    sheet.close();
    void usePhoneStorage();
  });
  later.addEventListener("click", () => sheet.close());
}

// ---- Run ---------------------------------------------------------------------------

const preview = new Preview({
  get files() {
    return files;
  },
  openAt(path, line) {
    const f = files.byPath(path);
    if (!f) return;
    void openFile(f.id).then(() => {
      if (line && line <= view.state.doc.lines) {
        const at = view.state.doc.line(line).from;
        view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
      }
      view.focus();
    });
  },
  onClose() {
    if (settings.value.keyboard === "custom") view.focus();
  },
});
app.append(preview.el);

/** The page that uses a script or stylesheet: an HTML file next to it (or above) that mentions it. */
async function pageFor(path: string, mustMention: boolean): Promise<string | null> {
  const name = basename(path);
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    const pages = files.files
      .filter((f) => /\.html?$/i.test(f.name) && dirname(f.name) === dir)
      .sort((a, b) => Number(basename(b.name) === "index.html") - Number(basename(a.name) === "index.html"));
    for (const page of pages) {
      const text = (await files.ensureContent(page.id))?.content ?? "";
      if (text.includes(name)) return page.name;
    }
    if (!mustMention && pages.length) return pages[0].name;
    if (!dir) return null;
  }
}

async function runCurrent(): Promise<void> {
  flushSave();
  const file = files.get(currentId);
  if (!file) return;
  const ext = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
  let target: RunTarget | null = null;
  if (ext === "html" || ext === "htm") target = { kind: "html", path: file.name };
  else if (ext === "py") target = { kind: "python", path: file.name };
  else if (ext === "js" || ext === "mjs" || ext === "cjs") {
    const page = await pageFor(file.name, true);
    target = page ? { kind: "html", path: page } : { kind: "js", path: file.name };
  } else if (ext === "css" || ext === "scss" || ext === "less") {
    const page = await pageFor(file.name, false);
    if (page) target = { kind: "html", path: page };
    else overlays.toast("Add an HTML page that links this stylesheet, then run it.", 3000);
  } else if (ext === "ts" || ext === "tsx" || ext === "jsx") {
    overlays.toast("TypeScript and JSX can't run here yet. HTML, JavaScript and Python can.", 3200);
  } else {
    overlays.toast(`.${ext} files can't run here. HTML, JavaScript and Python can.`, 3000);
  }
  if (target) await preview.open(target);
}

runBtn.addEventListener("click", () => void runCurrent());

// ---- Language picker -----------------------------------------------------------

function openLanguagePicker(): void {
  const file = files.active;
  const current = languageFor(file)?.name ?? PLAIN;
  const filter = kbInput(h("input.field.filter", { type: "text", placeholder: "Search 140+ languages", "aria-label": "Search languages" }));
  const list = h("div.lang-list", { role: "listbox" });
  const detected = detect(file.name);

  const choose = (lang: string) => {
    sheet.close();
    files.setLang(file.id, lang);
    void ensureLanguage(files.active);
    updateHeader();
    view.focus();
  };

  const row = (label: string, value: string, note?: string) => {
    const selected = value ? value === file.lang : !file.lang;
    const b = h(
      `button.lang-row${selected ? ".active" : ""}` as "button",
      { type: "button", role: "option", "aria-selected": String(selected) },
      h("span", {}, label),
      note ? h("span.lang-note", {}, note) : null,
      selected ? icon(icons.check, { size: 18 }) : null
    );
    b.addEventListener("click", () => choose(value));
    return b;
  };

  const render = () => {
    const q = filter.value.trim().toLowerCase();
    list.replaceChildren();
    const match = (name: string, exts: readonly string[] = []) =>
      !q || name.toLowerCase().includes(q) || exts.some((e) => e.toLowerCase() === q.replace(/^\./, ""));
    if (!q) {
      list.append(row("Detect from file name", "", detected?.name ?? PLAIN));
      list.append(h("div.lang-group", {}, "Popular"));
      for (const name of popularNames) {
        const l = allLanguages.find((x) => x.name === name);
        if (l) list.append(row(l.name, l.name, mainExtension(l)));
      }
      list.append(h("div.lang-group", {}, "All languages"));
    }
    if (match(PLAIN, ["txt"])) list.append(row(PLAIN, PLAIN, ".txt"));
    let count = 0;
    for (const l of allLanguages) {
      if (!match(l.name, l.extensions)) continue;
      list.append(row(l.name, l.name, mainExtension(l)));
      count++;
    }
    if (q && !count) list.append(h("p.empty", {}, `No language matches "${filter.value}".`));
  };

  filter.addEventListener("input", render);
  filter.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    list.querySelector<HTMLButtonElement>(".lang-row")?.click();
  });
  render();
  const sheet = overlays.sheet({
    title: `Language · ${current}`,
    body: h("div.lang-picker", {}, filter, list),
    keyboard: true,
    className: "tall",
  });
  filter.focus();
}

// ---- Settings sheet ------------------------------------------------------------

function segmented<K extends keyof Settings>(key: K, options: [Settings[K], string][]): HTMLElement {
  const wrap = h("div.seg", { role: "radiogroup" });
  const sync = () =>
    wrap.querySelectorAll<HTMLButtonElement>("button").forEach((b, i) => {
      const on = options[i][0] === settings.value[key];
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  options.forEach(([value, label]) => {
    const b = h("button", { type: "button", role: "radio" }, label);
    b.addEventListener("click", () => {
      settings.set({ [key]: value } as Partial<Settings>);
      sync();
    });
    wrap.append(b);
  });
  sync();
  return wrap;
}

function toggle(key: keyof Settings): HTMLElement {
  const b = h("button.switch", { type: "button", role: "switch" });
  const sync = () => b.setAttribute("aria-checked", String(!!settings.value[key]));
  b.addEventListener("click", () => {
    settings.set({ [key]: !settings.value[key] } as Partial<Settings>);
    sync();
  });
  sync();
  return b;
}

function stepper(key: "fontSize", min: number, max: number, unit: string): HTMLElement {
  const value = h("span.step-value");
  const sync = () => (value.textContent = `${settings.value[key]}${unit}`);
  const btn = (label: string, delta: number) => {
    const b = h("button.step-btn", { type: "button", "aria-label": delta > 0 ? "Larger" : "Smaller" }, label);
    b.addEventListener("click", () => {
      settings.set({ [key]: Math.min(max, Math.max(min, settings.value[key] + delta)) });
      sync();
    });
    return b;
  };
  sync();
  return h("div.stepper", {}, btn("A−", -1), value, btn("A+", 1));
}

function settingRow(label: string, control: HTMLElement, note?: string): HTMLElement {
  return h("div.set-row", {}, h("div.set-text", {}, h("span.set-label", {}, label), note ? h("span.set-note", {}, note) : null), control);
}

function storageButton(): HTMLElement {
  const b = h("button.btn.small.primary", { type: "button" }, "Use phone storage");
  b.addEventListener("click", () => {
    overlays.closeAll();
    void usePhoneStorage();
  });
  return b;
}

function openSettings(): void {
  const body = h(
    "div.settings",
    {},
    h("h3.set-group", {}, "Keyboard"),
    settingRow("Keyboard", segmented("keyboard", [["custom", "Code"], ["system", "Phone"]]), "Code keyboard, or your phone's own keyboard with the arrow bar"),
    settingRow("Key height", segmented("keySize", [["compact", "S"], ["normal", "M"], ["tall", "L"]])),
    settingRow("Shift symbols on keys", toggle("hints"), "The small symbol in each key's corner"),
    isNative || "vibrate" in navigator ? settingRow("Vibrate on key press", toggle("vibrate")) : null,
    h("h3.set-group", {}, "Files"),
    settingRow(
      "Saved in",
      isNative && !files.ws.shared ? storageButton() : h("span.set-value", {}, files.ws.label),
      isNative && !files.ws.shared
        ? "Inside the app. Move projects to Documents/Thumbcode to add images with other apps."
        : files.ws.shared
          ? "Other apps like Files and Gallery can add files here."
          : "Files stay in this browser on this device."
    ),
    h("h3.set-group", {}, "Editor"),
    settingRow("Text size", stepper("fontSize", 9, 28, "px"), "You can also pinch the code"),
    settingRow("Indent", segmented("tabSize", [[2, "2"], [4, "4"], [8, "8"]]), "Spaces per tab"),
    settingRow("Wrap long lines", toggle("wrap")),
    settingRow("Close brackets and quotes", toggle("closeBrackets")),
    settingRow("Suggestions while typing", toggle("autocomplete")),
    settingRow("Enter picks a suggestion", toggle("enterAccepts"), "Tab always picks one")
  );
  overlays.sheet({ title: "Settings", body, className: "tall" });
}

// ---- Tips and menu ------------------------------------------------------------

function openTips(): void {
  const tip = (keys: string, text: string) => h("li", {}, h("kbd", {}, keys), h("span", {}, text));
  overlays.sheet({
    title: "Keyboard tips",
    className: "tall",
    body: h(
      "div.tips",
      {},
      h("ul", {},
        tip("slide", "Put a finger on any key and slide to move the cursor. Turn on shift first to select."),
        tip("hold", "Hold a key for more symbols, e.g. \" for ' and `, : for ;"),
        tip("shift", "Shows the corner symbol of each key: ? & ^ ~ | ' \\ ; $ @. Double-tap for caps lock."),
        tip("( ) [ ] { }", "Types both brackets. Selected text gets wrapped."),
        tip("tab", "Picks a suggestion, expands a shortcut, jumps to the next blank, or indents."),
        tip("copy", "Hold for cut, select line, select all."),
        tip("pinch", "Zoom the code in or out."),
        tip("\u25B6 run", "Runs the file: HTML opens a live preview with a console and Inspect; JavaScript and Python run too."),
      ),
      h("h3.set-group", {}, "Shortcuts"),
      h("p", {}, "Type a shortcut, then tap it in the list or press tab. Each blank is a stop: press tab to go to the next one."),
      h("ul.shortcuts", {},
        tip("!", "HTML page skeleton (in .html files)"),
        tip("link:css", "Stylesheet link. Any Emmet abbreviation works: ul>li*3, div.card, a:link, input:email"),
        tip("m10 df jcc", "CSS: margin: 10px; display: flex; justify-content: center;"),
        tip("log fn afn", "JavaScript: console.log, arrow function, async arrow function"),
        tip("main pr forr", "Python: main block, print, for in range"),
        tip("sout fori", "Java: System.out.println, for loop"),
        tip("iferr fp", "Go: error check, fmt.Println"),
        tip("pln match", "Rust: println!, match"),
        tip("sel ins ct", "SQL: SELECT, INSERT, CREATE TABLE"),
      ),
      h("p.tips-foot", {}, "Shortcuts exist for JavaScript, TypeScript, React, Python, HTML, CSS, Java, C, C++, C#, Go, Rust, Kotlin, Swift, PHP, Ruby, Dart, SQL, Shell, Markdown and Lua.")
    ),
  });
}

function openMenu(): void {
  const file = files.active;
  const run = (fn: () => void) => () => {
    sheet.close();
    fn();
  };
  const sheet = overlays.sheet({
    title: "Menu",
    body: menuList([
      { label: "New file", icon: icons.filePlus, run: run(() => void explorer.newFile()) },
      { label: "New folder", icon: icons.folderPlus, run: run(() => void explorer.newFolder()) },
      { label: "Open files or a .zip", icon: icons.upload, run: run(() => explorer.pickFiles()) },
      { label: "Save to device", icon: icons.download, hint: basename(file.name), run: run(() => void explorer.exportFile(file)) },
      { label: "Save everything as .zip", icon: icons.zip, run: run(() => void explorer.saveZip("")) },
      { label: "Copy whole file", icon: icons.copy, run: run(async () => {
        await writeClipboard(view.state.doc.toString());
        overlays.toast("File copied");
      }) },
      null,
      { label: "Run", icon: icons.play, hint: basename(file.name), run: run(() => void runCurrent()) },
      { label: "Find and replace", icon: icons.search, run: run(() => openSearchPanel(view)) },
      { label: "Rename or move file", icon: icons.pencil, run: run(() => void explorer.renameFile(file)) },
      { label: "Settings", icon: icons.gear, run: run(openSettings) },
      { label: "Keyboard tips", icon: icons.info, run: run(openTips) },
    ]),
  });
}

filesBtn.addEventListener("click", () => explorer.open());
moreBtn.addEventListener("click", openMenu);
langBtn.addEventListener("click", openLanguagePicker);
titleBtn.addEventListener("click", () => void explorer.renameFile(files.active));

// ---- Start -----------------------------------------------------------------------

function saveNow(): void {
  flushSave();
  void files.flush();
}
window.addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveNow();
  // Back in the app: pick up files other apps added meanwhile.
  else if (started) void refreshFiles();
});

let started = false;

async function start(): Promise<void> {
  let ws = await chooseWorkspace();
  try {
    files = new FileStore(ws, reportError);
    await files.load();
  } catch (e) {
    // The phone folder can't be read (e.g. access was removed): fall back to the app's own storage.
    ws = appWorkspace();
    files = new FileStore(ws, reportError);
    await files.load();
    overlays.toast(`Couldn't open Documents/Thumbcode, using the app's storage. ${String((e as Error)?.message ?? "")}`, 4000);
  }
  await openFile(files.activeId, true);
  started = true;
  if (settings.value.keyboard === "custom") view.focus();
  offerPhoneStorage();
}
void start();

// Android back button: close the top menu, then find, then leave the app.
onBackButton(() => {
  if (overlays.closeTop()) return true;
  if (preview.isOpen) {
    preview.close();
    return true;
  }
  if (searchPanelOpen(view.state)) {
    closeSearchPanel(view);
    view.focus();
    return true;
  }
  return false;
});

// The Android app has its files built in, so it needs no offline cache.
if (!__SINGLE_FILE__ && !isNative && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Offline support is optional.
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) overlays.toast("Thumbcode was updated. Reopen the app to use the new version.", 4000);
  });
}

// Handle for debugging from the browser console.
(window as unknown as { thumbcode: unknown }).thumbcode = {
  view,
  settings,
  get files() {
    return files;
  },
  ready: () => started,
};
