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
import { allLanguages, detect, extTag, languageFor, loadLanguage, PLAIN, popularNames } from "./languages";
import { settings, type Settings } from "./settings";
import { fileLanguage, prepareFor } from "./snippets";
import { h, icon, icons, kbInput, keepFocus, refreshKbInputs } from "./ui/dom";
import { menuList, Overlays } from "./ui/overlay";

const files = new FileStore();

// ---- Layout ------------------------------------------------------------------

const app = document.getElementById("app")!;
const fileName = h("span.file-name");
const titleBtn = h("button.file-title", { type: "button", "aria-label": "Rename file" }, fileName);
const langBtn = h("button.lang-pill", { type: "button", "aria-label": "Change language" }, h("span.lang-name"), icon(icons.chevronDown, { size: 14 }));
const filesBtn = h("button.icon-btn", { type: "button", "aria-label": "Files" }, icon(icons.menu));
const moreBtn = h("button.icon-btn", { type: "button", "aria-label": "More" }, icon(icons.more));
const header = h("header.topbar", {}, filesBtn, titleBtn, langBtn, moreBtn);

const editorHost = h("div.editor-host");
const showKbBtn = keepFocus(h("button.show-kb", { type: "button", "aria-label": "Show keyboard" }, icon(icons.keyboard, { size: 22 })));
const editorArea = h("main.editor-area", {}, editorHost, showKbBtn);
const dock = h("div.kb-dock");
app.append(header, editorArea, dock);

const overlays = new Overlays(editorArea, app, () => {
  if (!document.activeElement || document.activeElement === document.body) view.focus();
});

// ---- Editor ------------------------------------------------------------------

const states = new Map<string, EditorState>();
/** Language name each cached editor state was set up with. */
const stateLang = new Map<string, string>();
let currentId = files.activeId;
let saveTimer = 0;
let refreshQueued = false;

const hooks: EditorHooks = {
  onUpdate(u) {
    if (u.docChanged) {
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

function flushSave(): void {
  clearTimeout(saveTimer);
  files.setContent(currentId, view.state.doc.toString());
  files.persist();
}

function languageExtension(file: FileRec): Extension {
  const desc = languageFor(file);
  if (!desc) return fileLanguage.of("");
  return desc.support ? [desc.support, fileLanguage.of(desc.name)] : fileLanguage.of(desc.name);
}

function makeState(file: FileRec): EditorState {
  const state = createState(file.content, settings.value, languageExtension(file), hooks);
  stateLang.set(file.id, languageFor(file)?.support ? languageFor(file)!.name : "");
  return state;
}

const view = new EditorView({ state: makeState(files.active), parent: editorHost });

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

function openFile(id: string): void {
  if (id !== currentId) {
    flushSave();
    states.set(currentId, view.state);
    files.setActive(id);
    currentId = id;
    const file = files.active;
    const cached = states.get(id);
    view.setState(cached ? cached.update({ effects: settingEffects(settings.value) }).state : makeState(file));
  }
  void ensureLanguage(files.active);
  updateHeader();
  keyboard.refresh();
}

function updateHeader(): void {
  const file = files.active;
  fileName.textContent = file.name;
  const lang = languageFor(file);
  langBtn.querySelector(".lang-name")!.textContent = lang?.name ?? PLAIN;
  document.title = `${file.name} · Thumbcode`;
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
view.dom.addEventListener("pointerdown", () => {
  if (settings.value.keyboard === "custom") showKeyboard();
});
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

function timeAgo(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function badge(name: string): HTMLElement {
  const tag = extTag(name);
  return h("span.badge", { "data-ext": tag }, tag);
}

function validName(name: string): string | null {
  if (!name) return "Enter a name.";
  if (/[\\/]/.test(name)) return "Names can't contain / or \\.";
  if (name.length > 120) return "Use a shorter name.";
  return null;
}

/** Selects the part before the extension, so typing replaces just the name. */
function baseRange(name: string): [number, number] {
  const dot = name.lastIndexOf(".");
  return [0, dot > 0 ? dot : name.length];
}

async function newFile(): Promise<void> {
  const ext = files.active.name.includes(".") ? files.active.name.slice(files.active.name.lastIndexOf(".")) : ".txt";
  const suggestion = files.uniqueName(`untitled${ext}`);
  const name = await overlays.prompt({
    title: "New file",
    value: suggestion,
    placeholder: "name.py",
    ok: "Create",
    select: baseRange(suggestion),
    validate: validName,
  });
  if (!name) return;
  const file = files.create(name);
  openFile(file.id);
  const lang = detect(file.name);
  overlays.toast(lang ? `${lang.name} file` : "Plain text file. Add an extension like .py for highlighting.", 2200);
}

async function renameFile(file: FileRec): Promise<void> {
  const name = await overlays.prompt({
    title: "Rename file",
    value: file.name,
    ok: "Rename",
    select: baseRange(file.name),
    validate: validName,
  });
  if (!name || name === file.name) return;
  files.rename(file.id, name);
  if (file.id === currentId) void ensureLanguage(file);
  else stateLang.delete(file.id);
  updateHeader();
}

async function deleteFile(file: FileRec): Promise<void> {
  if (files.files.length <= 1) {
    overlays.toast("You need at least one file.");
    return;
  }
  const ok = await overlays.confirm({
    title: `Delete ${file.name}?`,
    message: "It is removed from this device. This can't be undone.",
    ok: "Delete",
    danger: true,
  });
  if (!ok) return;
  const wasOpen = file.id === currentId;
  if (wasOpen) clearTimeout(saveTimer);
  files.remove(file.id);
  states.delete(file.id);
  stateLang.delete(file.id);
  if (wasOpen) {
    currentId = "";
    const next = files.active;
    view.setState(states.get(next.id)?.update({ effects: settingEffects(settings.value) }).state ?? makeState(next));
    currentId = next.id;
    void ensureLanguage(next);
    updateHeader();
  }
  overlays.toast(`Deleted ${file.name}`);
}

function duplicateFile(file: FileRec): void {
  if (file.id === currentId) flushSave();
  const copy = files.duplicate(file.id);
  if (copy) {
    files.setActive(currentId);
    openFile(copy.id);
  }
}

async function exportFile(file: FileRec): Promise<void> {
  if (file.id === currentId) flushSave();
  const blob = new Blob([file.content], { type: "text/plain" });
  try {
    const shared = new File([blob], file.name, { type: "text/plain" });
    if (navigator.canShare?.({ files: [shared] })) {
      await navigator.share({ files: [shared], title: file.name });
      return;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
  }
  const a = h("a", { href: URL.createObjectURL(blob), download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const fileInput = h("input.hidden-input", { type: "file", multiple: true, "aria-hidden": "true", tabindex: "-1" });
document.body.append(fileInput);
fileInput.addEventListener("change", async () => {
  const picked = [...(fileInput.files ?? [])];
  fileInput.value = "";
  let last: FileRec | null = null;
  for (const f of picked) {
    if (f.size > 5_000_000) {
      overlays.toast(`${f.name} is too large to open (5 MB limit).`, 2600);
      continue;
    }
    last = files.create(f.name, await f.text());
    files.setActive(currentId);
  }
  if (last) {
    openFile(last.id);
    overlays.toast(picked.length > 1 ? `Opened ${picked.length} files` : `Opened ${last.name}`);
  }
});

function fileActions(file: FileRec): void {
  const sheet = overlays.sheet({
    title: file.name,
    body: menuList([
      { label: "Rename", icon: icons.pencil, run: () => { sheet.close(); void renameFile(file); } },
      { label: "Duplicate", icon: icons.copy, run: () => { sheet.close(); duplicateFile(file); } },
      { label: "Save to device", icon: icons.download, run: () => { sheet.close(); void exportFile(file); } },
      null,
      { label: "Delete", icon: icons.trash, danger: true, run: () => { sheet.close(); void deleteFile(file); } },
    ]),
  });
}

function openDrawer(): void {
  flushSave();
  const list = h("div.file-list");
  const drawer = overlays.drawer(
    h(
      "div.drawer-inner",
      {},
      h("div.drawer-head", {}, h("h2", {}, "Files"), h("span.drawer-count", {}, `${files.files.length}`)),
      h("div.drawer-actions", {}, actionButton("New file", icons.plus, () => { drawer.close(); void newFile(); }),
        actionButton("Open", icons.upload, () => { drawer.close(); fileInput.click(); })),
      list,
      h("p.drawer-foot", {}, "Files are saved on this device.")
    ),
    "Files"
  );
  for (const f of files.sorted()) {
    const lang = languageFor(f)?.name ?? PLAIN;
    const open = h(
      `button.file-row${f.id === currentId ? ".active" : ""}` as "button",
      { type: "button" },
      badge(f.name),
      h("span.file-row-text", {}, h("span.file-row-name", {}, f.name), h("span.file-row-meta", {}, `${lang} · ${timeAgo(f.updated)}`))
    );
    open.addEventListener("click", () => {
      drawer.close();
      openFile(f.id);
      view.focus();
    });
    const more = h("button.icon-btn.file-row-more", { type: "button", "aria-label": `Actions for ${f.name}` }, icon(icons.more));
    more.addEventListener("click", () => {
      drawer.close();
      fileActions(f);
    });
    list.append(h("div.file-item", {}, open, more));
  }
}

function actionButton(label: string, ic: string, run: () => void): HTMLButtonElement {
  const b = h("button.btn.small", { type: "button" }, icon(ic, { size: 18 }), label);
  b.addEventListener("click", run);
  return b;
}

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
        if (l) list.append(row(l.name, l.name, l.extensions[0] ? `.${l.extensions[0]}` : undefined));
      }
      list.append(h("div.lang-group", {}, "All languages"));
    }
    if (match(PLAIN, ["txt"])) list.append(row(PLAIN, PLAIN, ".txt"));
    let count = 0;
    for (const l of allLanguages) {
      if (!match(l.name, l.extensions)) continue;
      list.append(row(l.name, l.name, l.extensions[0] ? `.${l.extensions[0]}` : undefined));
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

function openSettings(): void {
  const body = h(
    "div.settings",
    {},
    h("h3.set-group", {}, "Keyboard"),
    settingRow("Keyboard", segmented("keyboard", [["custom", "Code"], ["system", "Phone"]]), "Code keyboard, or your phone's own keyboard with the arrow bar"),
    settingRow("Key height", segmented("keySize", [["compact", "S"], ["normal", "M"], ["tall", "L"]])),
    settingRow("Shift symbols on keys", toggle("hints"), "The small symbol in each key's corner"),
    "vibrate" in navigator ? settingRow("Vibrate on key press", toggle("vibrate")) : null,
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
      { label: "New file", icon: icons.plus, run: run(() => void newFile()) },
      { label: "Open from device", icon: icons.upload, run: run(() => fileInput.click()) },
      { label: "Save to device", icon: icons.download, hint: file.name, run: run(() => void exportFile(file)) },
      { label: "Copy whole file", icon: icons.copy, run: run(async () => {
        await writeClipboard(view.state.doc.toString());
        overlays.toast("File copied");
      }) },
      null,
      { label: "Find and replace", icon: icons.search, run: run(() => openSearchPanel(view)) },
      { label: "Rename file", icon: icons.pencil, run: run(() => void renameFile(file)) },
      { label: "Settings", icon: icons.gear, run: run(openSettings) },
      { label: "Keyboard tips", icon: icons.info, run: run(openTips) },
    ]),
  });
}

filesBtn.addEventListener("click", openDrawer);
moreBtn.addEventListener("click", openMenu);
langBtn.addEventListener("click", openLanguagePicker);
titleBtn.addEventListener("click", () => void renameFile(files.active));

// ---- Start -----------------------------------------------------------------------

window.addEventListener("pagehide", flushSave);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});

openFile(currentId);
if (settings.value.keyboard === "custom") view.focus();

if (!__SINGLE_FILE__ && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Offline support is optional.
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) overlays.toast("Thumbcode was updated. Reopen the app to use the new version.", 4000);
  });
}

// Handle for debugging from the browser console.
(window as unknown as { thumbcode: unknown }).thumbcode = { view, files, settings };
