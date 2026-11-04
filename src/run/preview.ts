// The Run screen: the page (or program) on top, a console below it.
import erudaUrl from "eruda/eruda.js?url";
import type { FileStore } from "../files";
import { basename, dirname } from "../paths";
import { h, icon, icons } from "../ui/dom";
import { preludeTag, type FromPage, type Wire } from "./prelude";
import { encodePath, prepareFiles } from "./server";

export type RunTarget = { kind: "html" | "js" | "python"; path: string };

export interface PreviewHost {
  readonly files: FileStore;
  /** Opens a file in the editor at a line (from an error in the console). */
  openAt(path: string, line?: number): void;
  onClose(): void;
}

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const MAX_LOG = 1500;

type Size = "half" | "full" | "min";

const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export class Preview {
  readonly el: HTMLElement;
  private frameWrap: HTMLElement;
  private frame: HTMLIFrameElement | null = null;
  private log: HTMLElement;
  private input: HTMLInputElement;
  private title: HTMLElement;
  private counts: HTMLElement;
  private inspectBtn: HTMLButtonElement;
  private deviceBtn: HTMLButtonElement;
  private target: RunTarget | null = null;
  private size: Size = "half";
  private desktop = false;
  private inspect = false;
  private errors = 0;
  private warnings = 0;
  private evalId = 0;
  private started = 0;
  private lastEntry: { key: string; el: HTMLElement; count: number } | null = null;

  constructor(private host: PreviewHost) {
    const btn = (label: string, ic: string, run: () => void, cls = "") => {
      const b = h(`button.icon-btn.pv-btn${cls ? "." + cls : ""}` as "button", { type: "button", "aria-label": label, title: label }, icon(ic, { size: 20 }));
      b.addEventListener("click", run);
      return b;
    };
    this.title = h("div.pv-title");
    this.inspectBtn = h("button.pv-chip", { type: "button", "aria-pressed": "false", title: "Inspect elements, styles, network and storage" }, "Inspect");
    this.inspectBtn.addEventListener("click", () => {
      this.inspect = !this.inspect;
      this.inspectBtn.setAttribute("aria-pressed", String(this.inspect));
      // The inspector has its own console; give the page the room.
      this.setSize(this.inspect ? "min" : "half");
      void this.reload();
    });
    this.deviceBtn = btn("Desktop width", icons.monitor, () => this.toggleDevice());
    const bar = h(
      "div.pv-bar",
      {},
      btn("Back to code", icons.chevronLeft, () => this.close()),
      this.title,
      btn("Run again", icons.refresh, () => void this.reload()),
      this.deviceBtn,
      this.inspectBtn
    );
    this.frameWrap = h("div.pv-page");
    this.log = h("div.pv-log", { role: "log", "aria-live": "polite" });
    this.counts = h("span.pv-counts");
    const sizeBtn = btn("Console size", icons.chevronDown, () => this.cycleSize(), "pv-size");
    const clearBtn = h("button.pv-chip", { type: "button" }, "Clear");
    clearBtn.addEventListener("click", () => this.clear());
    const consoleBar = h("div.pv-console-bar", {}, h("span.pv-console-title", {}, "Console"), this.counts, h("span.pv-spacer"), clearBtn, sizeBtn);
    consoleBar.addEventListener("click", (e) => {
      if (e.target === consoleBar) this.cycleSize();
    });
    this.input = h("input.pv-input", {
      type: "text",
      placeholder: "Run JavaScript in the page",
      autocapitalize: "off",
      autocomplete: "off",
      spellcheck: "false",
      enterkeyhint: "go",
      "aria-label": "Console command",
    });
    this.input.setAttribute("autocorrect", "off");
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.runCommand();
      }
    });
    const go = h("button.pv-go", { type: "button", "aria-label": "Run command" }, icon(icons.play, { size: 16 }));
    go.addEventListener("click", () => this.runCommand());
    const consoleEl = h("div.pv-console", {}, consoleBar, this.log, h("div.pv-prompt", {}, h("span.pv-caret", {}, "›"), this.input, go));
    this.el = h("section.preview", { role: "dialog", "aria-label": "Run" }, bar, this.frameWrap, consoleEl);
    this.el.hidden = true;
    window.addEventListener("message", (e) => this.onMessage(e));
    window.addEventListener("resize", () => this.fitDevice());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  async open(target: RunTarget): Promise<void> {
    this.target = target;
    this.el.hidden = false;
    this.el.dataset.kind = target.kind;
    this.setSize(target.kind === "html" ? "half" : "full");
    this.inspectBtn.hidden = target.kind !== "html";
    this.deviceBtn.hidden = target.kind !== "html";
    this.input.placeholder = target.kind === "python" ? "Run Python" : "Run JavaScript in the page";
    (document.activeElement as HTMLElement | null)?.blur?.();
    await this.reload();
  }

  close(): void {
    this.el.hidden = true;
    this.frame?.remove();
    this.frame = null;
    this.host.onClose();
  }

  /** Builds the page again from the current files and runs it. */
  async reload(): Promise<void> {
    const target = this.target;
    if (!target) return;
    this.clear();
    this.title.replaceChildren(h("span.pv-dir", {}, dirname(target.path) ? dirname(target.path) + "/" : ""), basename(target.path));
    let root: string | null = null;
    try {
      root = await prepareFiles(this.host.files);
    } catch (e) {
      this.system("warn", `The project's files couldn't be prepared: ${String((e as Error)?.message ?? e)}`);
    }
    const doc = await this.buildDocument(target, root);
    if (doc === null) return;
    this.frame?.remove();
    const frame = h("iframe.pv-frame", { title: `Preview of ${basename(target.path)}`, allow: "clipboard-read; clipboard-write; fullscreen; autoplay" });
    frame.srcdoc = doc;
    this.frame = frame;
    this.frameWrap.replaceChildren(frame);
    this.started = performance.now();
    this.fitDevice();
  }

  private async buildDocument(target: RunTarget, root: string | null): Promise<string | null> {
    const files = this.host.files;
    const file = files.byPath(target.path);
    if (!file) {
      this.system("error", `${target.path} was not found.`);
      return null;
    }
    const text = (await files.ensureContent(file.id))?.content ?? "";
    const dir = dirname(target.path);
    const base = root ? `<base href="${root}${dir ? encodePath(dir) + "/" : ""}">` : "";
    const head = base + preludeTag(root ?? "\u0000", basename(target.path));

    if (target.kind === "html") {
      if (!root && /\b(?:src|href)\s*=\s*["'](?![a-z]+:|#|\/\/)[^"']+/i.test(text)) {
        this.system("info", "Linked files (CSS, scripts, images) can't load in this view. They load in the Android app and the installed web app.");
      }
      const inspector = this.inspect
        ? `<script src="${new URL(erudaUrl, location.href).href}"></script><script>addEventListener("DOMContentLoaded",function(){eruda.init({tool:["elements","console","network","resources","sources","info"],useShadowDom:true,defaults:{displaySize:55,theme:"Dark"}});eruda.show();eruda.show("elements");});</script>`
        : "";
      return injectHead(text, head + inspector);
    }

    if (target.kind === "js") {
      const module = /^\s*(import|export)\b/m.test(text);
      const script = root
        ? `<script${module ? ' type="module"' : ""} src="${encodePath(basename(target.path))}"></script>`
        : `<script${module ? ' type="module"' : ""}>${text.replace(/<\/script/gi, "<\\/script")}</script>`;
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${script}<script>addEventListener("load",function(){parent.postMessage({__tc:1,type:"done"},"*")})</script></body></html>`;
    }

    // Python: Pyodide runs the program in the page; the project's .py and small data files are copied in.
    const project: Record<string, string> = {};
    let total = 0;
    for (const f of files.files) {
      if (f.binary || f.size > 1_000_000 || !/\.(py|txt|csv|json|md|tsv|ini|cfg|toml|ya?ml|xml|html)$/i.test(f.name)) continue;
      const content = (await files.ensureContent(f.id))?.content ?? "";
      total += content.length;
      if (total > 8_000_000) break;
      project[f.name] = content;
    }
    project[target.path] = text;
    return `<!doctype html><html><head><meta charset="utf-8">${head}<style>html,body{margin:0;background:#1c1c1e;color:#8e8e93;font:13px system-ui,sans-serif}#s{padding:14px}</style></head><body><div id="s">Starting Python…</div>
<script src="${PYODIDE}pyodide.js"></script>
<script>
(async function () {
  var FILES = ${json(project)}, MAIN = ${json(target.path)}, DIR = ${json(dir)};
  var status = document.getElementById("s");
  var post = function (m) { parent.postMessage(Object.assign({ __tc: 1 }, m), "*"); };
  try {
    if (typeof loadPyodide !== "function") throw new Error("Python couldn't be downloaded. Check your internet connection and run again.");
    var slow = setTimeout(function () { console.info("Downloading Python (about 10 MB, only the first time)…"); }, 1500);
    var py = await loadPyodide({ indexURL: ${json(PYODIDE)}, stdout: function (s) { console.log(s); }, stderr: function (s) { console.warn(s); } });
    clearTimeout(slow);
    window.__py = py;
    for (var p in FILES) {
      var full = "/home/pyodide/project/" + p;
      py.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
      py.FS.writeFile(full, FILES[p]);
    }
    py.FS.chdir("/home/pyodide/project" + (DIR ? "/" + DIR : ""));
    py.runPython("import sys, builtins, js\\nsys.path.insert(0, '.')\\ndef _input(prompt=''):\\n    r = js.prompt(str(prompt))\\n    if r is None:\\n        raise EOFError('input was cancelled')\\n    print(str(prompt) + r)\\n    return r\\nbuiltins.input = _input\\n");
    await py.loadPackagesFromImports(FILES[MAIN], { messageCallback: function (m) { if (!/^Loaded/.test(m)) console.info(m); } });
    status.textContent = "Running " + MAIN;
    await py.runPythonAsync(FILES[MAIN], { filename: MAIN });
    status.textContent = MAIN + " finished. Type Python below to keep going.";
  } catch (e) {
    var tb = cleanTraceback(String((e && e.message) || e));
    var at = null, re = /File "([^"]+)", line (\\d+)/g, m;
    while ((m = re.exec(tb))) if (!/^\\/lib\\//.test(m[1])) at = m;
    post({ type: "error", message: tb, file: at ? at[1].replace(/^\\/home\\/pyodide\\/project\\//, "") : "", line: at ? +at[2] : 0 });
    status.textContent = "Stopped with an error.";
  }
  post({ type: "done" });
})();
// Drops the frames that belong to Pyodide itself, keeping the user's code.
function cleanTraceback(t) {
  var out = [], skip = false;
  t.split("\\n").forEach(function (l) {
    if (/^  File "/.test(l)) skip = /^  File "\\/lib\\/python/.test(l);
    else if (!/^    /.test(l)) skip = false;
    if (!skip) out.push(l.replace("/home/pyodide/project/", ""));
  });
  return out.join("\\n").trim();
}
addEventListener("message", async function (e) {
  var d = e.data;
  if (!d || d.__tc !== 2 || d.type !== "eval-py" || !window.__py) return;
  try {
    var r = await window.__py.runPythonAsync(d.code);
    var text = r === undefined ? undefined : (r && r.toString ? r.toString() : String(r));
    if (r && r.destroy) r.destroy();
    parent.postMessage({ __tc: 1, type: "result", id: d.id, value: text === undefined ? { t: "undef" } : { t: "str", v: text } }, "*");
  } catch (err) {
    parent.postMessage({ __tc: 1, type: "result", id: d.id, error: { t: "err", v: cleanTraceback(String(err.message || err)), stack: "" } }, "*");
  }
});
</script></body></html>`;
  }

  // ---- Messages from the page ------------------------------------------------------

  private onMessage(e: MessageEvent): void {
    if (!this.frame || e.source !== this.frame.contentWindow) return;
    const m = e.data as FromPage;
    if (!m || m.__tc !== 1) return;
    switch (m.type) {
      case "log":
        this.entry(m.level ?? "log", (m.args ?? []).map((a, i) => renderValue(a, i === 0 && a.t === "str")));
        break;
      case "error": {
        const loc = m.file ? this.location(m.file, m.line, m.col) : null;
        const parts: Node[] = [document.createTextNode(m.message ?? "Error")];
        const entry = this.entry("error", parts, loc);
        if (m.stack && !/^\s*$/.test(m.stack)) {
          // The first stack line repeats the message.
          const lines = tidyStack(m.stack).split("\n");
          if (lines.length && (m.message ?? "").includes(lines[0].trim())) lines.shift();
          if (lines.join("").trim()) entry.append(h("pre.pv-stack", {}, lines.join("\n")));
        }
        break;
      }
      case "clear":
        this.clear();
        this.system("debug", "Console was cleared");
        break;
      case "result": {
        const row = this.log.querySelector(`[data-eval="${m.id}"]`);
        const out = m.error ? h("div.pv-result.err", {}, "← ", renderValue(m.error, false)) : h("div.pv-result", {}, "← ", renderValue(m.value ?? { t: "undef" }, false));
        (row ?? this.log).append(out);
        this.scrollDown();
        break;
      }
      case "navigate":
        if (m.path && this.host.files.byPath(m.path)) {
          this.target = { kind: "html", path: m.path };
          void this.reload();
        } else {
          this.system("warn", `${m.path} is not in the project.`);
        }
        break;
      case "done":
        if (this.target?.kind !== "html") {
          const secs = (performance.now() - this.started) / 1000;
          this.system("debug", secs < 0.1 ? "Finished" : `Finished in ${secs.toFixed(1)} s`);
        }
        break;
    }
  }

  private location(file: string, line?: number, col?: number): HTMLElement {
    const label = `${file}${line ? `:${line}` : ""}${col ? `:${col}` : ""}`;
    const dir = this.target ? dirname(this.target.path) : "";
    const path = this.host.files.byPath(file) ? file : this.host.files.byPath(dir ? `${dir}/${file}` : file) ? `${dir}/${file}` : null;
    if (!path) return h("span.pv-loc", {}, label);
    const a = h("button.pv-loc.link", { type: "button", title: "Show in the code" }, label);
    a.addEventListener("click", () => {
      this.close();
      this.host.openAt(path, line);
    });
    return a;
  }

  // ---- Console ------------------------------------------------------------------------

  private entry(level: string, parts: Node[], loc: HTMLElement | null = null): HTMLElement {
    const key = level + "|" + parts.map((p) => p.textContent).join(" ");
    if (this.lastEntry && this.lastEntry.key === key && !loc) {
      this.lastEntry.count++;
      let badge = this.lastEntry.el.querySelector(".pv-repeat");
      if (!badge) {
        badge = h("span.pv-repeat");
        this.lastEntry.el.prepend(badge);
      }
      badge.textContent = String(this.lastEntry.count);
      return this.lastEntry.el;
    }
    const body = h("div.pv-msg");
    parts.forEach((p, i) => {
      if (i) body.append(" ");
      body.append(p);
    });
    const el = h(`div.pv-entry.${level}` as "div", {}, body, loc);
    this.log.append(el);
    this.lastEntry = { key, el, count: 1 };
    if (level === "error") this.errors++;
    if (level === "warn") this.warnings++;
    this.updateCounts();
    while (this.log.childElementCount > MAX_LOG) this.log.firstElementChild?.remove();
    this.scrollDown();
    return el;
  }

  private system(level: string, text: string): void {
    this.entry(level, [document.createTextNode(text)]).classList.add("system");
  }

  private updateCounts(): void {
    const parts: HTMLElement[] = [];
    if (this.errors) parts.push(h("span.pv-count.err", {}, `${this.errors} ${this.errors === 1 ? "error" : "errors"}`));
    if (this.warnings) parts.push(h("span.pv-count.warn", {}, `${this.warnings} ${this.warnings === 1 ? "warning" : "warnings"}`));
    this.counts.replaceChildren(...parts);
  }

  private clear(): void {
    this.log.replaceChildren();
    this.errors = 0;
    this.warnings = 0;
    this.lastEntry = null;
    this.updateCounts();
  }

  private scrollDown(): void {
    const near = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
    if (near || this.log.childElementCount < 3) requestAnimationFrame(() => (this.log.scrollTop = this.log.scrollHeight));
  }

  private runCommand(): void {
    const code = this.input.value.trim();
    if (!code || !this.frame?.contentWindow) return;
    this.input.value = "";
    const id = ++this.evalId;
    const row = h("div.pv-entry.command", { "data-eval": String(id) }, h("div.pv-msg", {}, h("span.pv-caret", {}, "› "), code));
    this.log.append(row);
    this.lastEntry = null;
    this.scrollDown();
    const type = this.target?.kind === "python" ? "eval-py" : "eval";
    this.frame.contentWindow.postMessage({ __tc: 2, type, id, code }, "*");
  }

  private setSize(size: Size): void {
    this.size = size;
    this.el.dataset.console = size;
  }

  private cycleSize(): void {
    const order: Size[] = this.target?.kind === "html" ? ["half", "full", "min"] : ["full", "half"];
    this.setSize(order[(order.indexOf(this.size) + 1) % order.length]);
    this.fitDevice();
  }

  // ---- Desktop view ------------------------------------------------------------------

  private toggleDevice(): void {
    this.desktop = !this.desktop;
    this.deviceBtn.setAttribute("aria-pressed", String(this.desktop));
    this.deviceBtn.setAttribute("aria-label", this.desktop ? "Phone width" : "Desktop width");
    this.deviceBtn.replaceChildren(icon(this.desktop ? icons.phone : icons.monitor, { size: 20 }));
    this.fitDevice();
  }

  /** Desktop view renders the page 1280 px wide and scales it down to fit. */
  private fitDevice(): void {
    const frame = this.frame;
    if (!frame) return;
    if (!this.desktop || this.target?.kind !== "html") {
      frame.style.cssText = "";
      return;
    }
    const w = this.frameWrap.clientWidth || 1;
    const hgt = this.frameWrap.clientHeight || 1;
    const scale = w / 1280;
    frame.style.cssText = `width:1280px;height:${hgt / scale}px;transform:scale(${scale});transform-origin:0 0;`;
  }
}

/** Puts our tags at the start of <head> (on the same line, so line numbers in errors stay right). */
function injectHead(html: string, tags: string): string {
  const head = html.match(/<head\b[^>]*>/i);
  if (head) return html.replace(head[0], head[0] + tags);
  const root = html.match(/<html\b[^>]*>/i);
  if (root) return html.replace(root[0], root[0] + tags);
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) return html.replace(doctype[0], doctype[0] + tags);
  return tags + html;
}

/** Shortens stack lines to project paths: ".../__preview__/js/app.js:3:9" -> "js/app.js:3:9". */
function tidyStack(stack: string): string {
  return stack
    .split("\n")
    .map((l) =>
      l
        .replace(/https?:\/\/[^\s)]*?\/__preview__\//g, "")
        .replace(/https?:\/\/[^\s)]*?\/_capacitor_file_[^\s)]*?\/(?:Thumbcode|workspace)\//g, "")
        .replace(/about:srcdoc/g, "page")
    )
    .slice(0, 12)
    .join("\n");
}

// ---- Showing values -------------------------------------------------------------------

function renderValue(v: Wire, plain: boolean): HTMLElement {
  switch (v.t) {
    case "str":
      return plain ? h("span.v-text", {}, v.v) : h("span.v-str", {}, JSON.stringify(v.v));
    case "num":
    case "big":
      return h("span.v-num", {}, v.v);
    case "bool":
      return h("span.v-bool", {}, v.v);
    case "null":
      return h("span.v-dim", {}, "null");
    case "undef":
      return h("span.v-dim", {}, "undefined");
    case "sym":
    case "re":
    case "date":
      return h("span.v-special", {}, v.v);
    case "fn":
      return h("span.v-fn", {}, v.v);
    case "node":
      return h("span.v-node", {}, v.v);
    case "circ":
      return h("span.v-dim", {}, "[Circular]");
    case "more":
      return h("span.v-dim", {}, `[${v.v}]`);
    case "err": {
      const d = h("details.v-tree.v-err");
      d.append(h("summary", {}, v.v), h("pre.pv-stack", {}, tidyStack(v.stack)));
      return d;
    }
    case "arr":
    case "set": {
      const label = v.t === "arr" ? `Array(${v.n})` : `Set(${v.n})`;
      return tree(label, preview(v.items.map((x) => short(x)), "[", "]"), v.items.map((x, i) => [v.t === "arr" ? String(i) : "", x]));
    }
    case "map":
      return tree(`Map(${v.n})`, preview(v.items.map(([k, x]) => `${short(k)} => ${short(x)}`), "{", "}"), v.items.map(([k, x]) => [short(k), x]));
    case "obj": {
      const label = v.name || "";
      const p = preview(v.entries.map(([k, x]) => `${k}: ${short(x)}`), "{", "}");
      const rows = v.entries as [string, Wire][];
      const el = tree(label, p, rows);
      if (v.more) el.append(h("div.v-dim.v-more", {}, `… ${v.more} more`));
      return el;
    }
  }
}

function tree(label: string, previewText: string, rows: [string, Wire][]): HTMLElement {
  const d = h("details.v-tree");
  d.append(h("summary", {}, label ? h("span.v-name", {}, label + " ") : "", h("span.v-preview", {}, previewText)));
  let built = false;
  d.addEventListener("toggle", () => {
    if (built || !d.open) return;
    built = true;
    for (const [k, x] of rows) d.append(h("div.v-row", {}, k ? h("span.v-key", {}, `${k}: `) : "", renderValue(x, false)));
    if (!rows.length) d.append(h("div.v-row.v-dim", {}, "empty"));
  });
  return d;
}

function short(v: Wire): string {
  switch (v.t) {
    case "str":
      return JSON.stringify(v.v.length > 40 ? v.v.slice(0, 40) + "…" : v.v);
    case "arr":
      return `Array(${v.n})`;
    case "set":
      return `Set(${v.n})`;
    case "map":
      return `Map(${v.n})`;
    case "obj":
      return v.name ? `${v.name} {…}` : "{…}";
    case "err":
      return v.v;
    case "null":
      return "null";
    case "undef":
      return "undefined";
    case "circ":
      return "[Circular]";
    default:
      return v.v;
  }
}

function preview(items: string[], open: string, close: string): string {
  const text = items.slice(0, 6).join(", ");
  return `${open}${text.length > 90 ? text.slice(0, 90) + "…" : text}${items.length > 6 ? ", …" : ""}${close}`;
}
