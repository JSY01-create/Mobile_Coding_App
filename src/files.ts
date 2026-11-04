import { ancestors, basename, dirname, isInside, normalizePath, splitExt } from "./paths";
import { sampleFiles } from "./samples";
import { loadJSON, saveJSON } from "./storage";
import type { Workspace } from "./workspace";

export interface FileRec {
  id: string;
  /** Path in the workspace, e.g. "src/app.js". */
  name: string;
  /** Text, once loaded. Null until the file is opened (or for binary files). */
  content: string | null;
  /** Images, fonts, archives...: shown and moved, not edited. */
  binary: boolean;
  size: number;
  /** Language name chosen by the user. Empty means "detect from the file name". */
  lang: string;
  updated: number;
}

/** What is remembered between visits (the files themselves live in the workspace). */
interface Meta {
  active?: string;
  expanded?: string[];
  langs?: Record<string, string>;
  seeded?: boolean;
}

const META_KEY = "thumbcode.workspace";
const LEGACY_KEY = "thumbcode.files";

const BINARY_EXT = new Set(
  "png jpg jpeg gif webp bmp ico avif heic tif tiff psd pdf zip gz tgz rar 7z jar apk aab exe dll so dylib class o a wasm mp3 wav ogg m4a flac aac mp4 mov webm mkv avi woff woff2 ttf otf eot db sqlite pyc keystore jks".split(" ")
);
export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i;
/** Text files bigger than this open as "too large". */
const MAX_TEXT = 3_000_000;

export function isBinaryName(path: string): boolean {
  return BINARY_EXT.has(splitExt(path)[1].slice(1).toLowerCase());
}

let idCounter = 0;
const newId = () => `f${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export class FileStore {
  files: FileRec[] = [];
  activeId = "";
  expanded = new Set<string>();
  /** Every folder known to exist, including empty ones. */
  private dirs = new Set<string>();
  private langs: Record<string, string> = {};
  private writeTimers = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();
  private listeners: (() => void)[] = [];

  constructor(public ws: Workspace, private onError: (message: string) => void) {}

  onChange(l: () => void): void {
    this.listeners.push(l);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Runs storage operations one after another, so a rename never overtakes the write before it. */
  private run(label: string, op: () => Promise<unknown>): Promise<void> {
    const next = this.queue.then(op).then(
      () => undefined,
      (e) => this.onError(`Couldn't ${label}: ${String((e as Error)?.message ?? e)}`)
    );
    this.queue = next;
    return next;
  }

  // ---- Loading ---------------------------------------------------------------------

  /** Reads the folder. Fills an empty workspace with older saved files or the starter project. */
  async load(): Promise<void> {
    await this.ws.ensureRoot();
    const meta = loadJSON<Meta>(META_KEY, {});
    let entries = await this.ws.list();
    if (!entries.length && !meta.seeded) {
      meta.active = (await this.seed()) ?? meta.active;
      entries = await this.ws.list();
    }
    this.langs = meta.langs ?? {};
    this.applyListing(entries);
    // First visit: open every folder of a small project, only the top level of a big one.
    const all = this.folders();
    this.expanded = new Set(meta.expanded ?? (all.length <= 12 ? all : all.filter((f) => !f.includes("/"))));
    const active = meta.active ? this.byPath(meta.active) : undefined;
    this.activeId = (active && !active.binary ? active : this.firstText())?.id ?? "";
    if (!this.activeId) this.activeId = this.create("untitled.md").id;
    this.saveMeta({ seeded: true });
  }

  private firstText(): FileRec | undefined {
    return this.files.find((f) => f.name === "welcome.md") ?? this.files.find((f) => !f.binary);
  }

  /**
   * First run: move files saved by older versions into the workspace, or write the starter project.
   * Returns the path of the file that was open before, if any.
   */
  private async seed(): Promise<string | undefined> {
    type Legacy = { files?: { id?: string; name: string; content: string }[]; folders?: string[]; active?: string };
    const legacy = loadJSON<Legacy | null>(LEGACY_KEY, null);
    const files = legacy?.files?.length ? legacy.files : sampleFiles;
    for (const f of files) await this.ws.writeText(normalizePath(f.name) || "untitled.txt", f.content ?? "");
    for (const d of legacy?.folders ?? []) await this.ws.mkdir(d);
    if (!legacy) return undefined;
    saveJSON(`${LEGACY_KEY}.migrated`, legacy);
    const open = legacy.files?.find((f) => f.id === legacy.active);
    return open ? normalizePath(open.name) : undefined;
  }

  private applyListing(entries: { path: string; kind: "file" | "dir"; size: number; mtime: number }[]): void {
    const old = new Map(this.files.map((f) => [f.name, f]));
    this.dirs = new Set(entries.filter((e) => e.kind === "dir").map((e) => e.path));
    this.files = entries
      .filter((e) => e.kind === "file")
      .map((e) => {
        const prev = old.get(e.path);
        const binary = isBinaryName(e.path) || e.size > MAX_TEXT;
        // Keep loaded text unless the file changed on disk (and has no unsaved edits).
        const unchanged = prev && (prev.updated >= e.mtime || this.writeTimers.has(prev.id));
        return {
          id: prev?.id ?? newId(),
          name: e.path,
          content: unchanged ? prev.content : null,
          binary: prev?.binary || binary,
          size: e.size,
          lang: this.langs[e.path] ?? "",
          updated: unchanged ? prev.updated : e.mtime || Date.now(),
        };
      });
  }

  /** Picks up files added, changed or removed by other apps. Returns true when something changed. */
  async refresh(): Promise<boolean> {
    await this.flush();
    const entries = await this.ws.list();
    const before = this.signature();
    const activePath = this.active?.name;
    this.applyListing(entries);
    if (!this.get(this.activeId)) {
      const again = activePath ? this.byPath(activePath) : undefined;
      this.activeId = (again ?? this.firstText() ?? this.create("untitled.md")).id;
    }
    const changed = before !== this.signature();
    if (changed) this.emit();
    return changed;
  }

  private signature(): string {
    return this.files.map((f) => `${f.name}:${f.size}:${f.content === null ? "" : "l"}`).join("|") + "#" + [...this.dirs].join("|");
  }

  /** Loads a file's text the first time it is opened. */
  async ensureContent(id: string): Promise<FileRec | undefined> {
    const f = this.get(id);
    if (!f || f.binary || f.content !== null) return f;
    try {
      const text = await this.ws.readText(f.name);
      if (text.slice(0, 8000).includes("\u0000")) {
        f.binary = true;
      } else {
        f.content = text;
      }
    } catch (e) {
      this.onError(`Couldn't open ${basename(f.name)}: ${String((e as Error)?.message ?? e)}`);
      f.content = "";
    }
    return f;
  }

  /** Raw bytes of a file, after any pending save of it has finished. */
  async readBytes(f: FileRec): Promise<Uint8Array> {
    await this.queue;
    return this.ws.readBytes(f.name);
  }

  // ---- Lookups ---------------------------------------------------------------------

  get active(): FileRec {
    return this.get(this.activeId) ?? this.files[0];
  }

  get(id: string): FileRec | undefined {
    return this.files.find((f) => f.id === id);
  }

  byPath(path: string): FileRec | undefined {
    const p = path.toLowerCase();
    return this.files.find((f) => f.name.toLowerCase() === p);
  }

  /** Every folder, sorted. */
  folders(): string[] {
    const all = new Set<string>();
    for (const d of this.dirs) {
      all.add(d);
      for (const a of ancestors(d)) all.add(a);
    }
    for (const file of this.files) for (const a of ancestors(file.name)) all.add(a);
    return [...all].sort((a, b) => a.localeCompare(b));
  }

  isFolder(path: string): boolean {
    const p = path.toLowerCase();
    return this.folders().some((f) => f.toLowerCase() === p);
  }

  filesIn(folder: string): FileRec[] {
    return this.files.filter((f) => isInside(f.name, folder));
  }

  /** Most recently edited first. */
  sorted(): FileRec[] {
    return [...this.files].sort((a, b) => b.updated - a.updated);
  }

  /** Why a file or folder can't be created at `path`, or null. */
  conflict(path: string, exceptId?: string, exceptFolder?: string): string | null {
    const lower = path.toLowerCase();
    const sameFile = this.files.find((f) => f.id !== exceptId && f.name.toLowerCase() === lower);
    if (sameFile) return `${basename(sameFile.name)} already exists here.`;
    const folders = this.folders().filter((f) => !exceptFolder || !(f === exceptFolder || isInside(f, exceptFolder)));
    if (folders.some((f) => f.toLowerCase() === lower)) return `There is already a folder called ${basename(path)}.`;
    for (const a of ancestors(path)) {
      if (this.files.some((f) => f.id !== exceptId && f.name.toLowerCase() === a.toLowerCase()))
        return `${basename(a)} is a file, so it can't hold other files.`;
    }
    return null;
  }

  uniqueName(path: string, exceptId?: string): string {
    if (!this.conflict(path, exceptId)) return path;
    const [base, ext] = splitExt(path);
    for (let i = 2; ; i++) {
      const candidate = `${base}-${i}${ext}`;
      if (!this.conflict(candidate, exceptId)) return candidate;
    }
  }

  // ---- Changes ---------------------------------------------------------------------

  private openParents(path: string): void {
    for (const a of ancestors(path)) this.expanded.add(a);
  }

  create(path: string, content = ""): FileRec {
    const name = this.uniqueName(normalizePath(path));
    const file: FileRec = { id: newId(), name, content, binary: false, size: content.length, lang: "", updated: Date.now() };
    this.files.push(file);
    this.openParents(name);
    this.activeId = file.id;
    void this.run(`create ${basename(name)}`, async () => {
      await this.ws.writeText(name, content);
      file.updated = Date.now();
    });
    this.saveMeta();
    this.emit();
    return file;
  }

  /** Adds any kind of file (images too) from raw bytes. */
  addBytes(path: string, bytes: Uint8Array): FileRec {
    const name = this.uniqueName(normalizePath(path));
    const file: FileRec = { id: newId(), name, content: null, binary: true, size: bytes.length, lang: "", updated: Date.now() };
    this.files.push(file);
    this.openParents(name);
    void this.run(`add ${basename(name)}`, async () => {
      await this.ws.writeBytes(name, bytes);
      file.updated = Date.now();
    });
    this.emit();
    return file;
  }

  createFolder(path: string): string {
    const folder = normalizePath(path);
    this.dirs.add(folder);
    this.expanded.add(folder);
    this.openParents(folder);
    void this.run(`create the folder ${basename(folder)}`, () => this.ws.mkdir(folder));
    this.saveMeta();
    this.emit();
    return folder;
  }

  duplicate(id: string): FileRec | undefined {
    const src = this.get(id);
    if (!src) return;
    const [base, ext] = splitExt(src.name);
    if (src.binary) {
      const name = this.uniqueName(`${base}-copy${ext}`);
      const copy: FileRec = { ...src, id: newId(), name, updated: Date.now() };
      this.files.push(copy);
      void this.run(`copy ${basename(src.name)}`, async () => this.ws.writeBytes(name, await this.ws.readBytes(src.name)));
      this.emit();
      return copy;
    }
    const file = this.create(`${base}-copy${ext}`, src.content ?? "");
    if (src.content === null) void this.run(`copy ${basename(src.name)}`, async () => {
      file.content = await this.ws.readText(src.name);
      await this.ws.writeText(file.name, file.content);
    });
    file.lang = src.lang;
    return file;
  }

  /** Renames or moves a file; folders in the new path are created. */
  rename(id: string, path: string): void {
    const f = this.get(id);
    if (!f) return;
    const from = f.name;
    if (dirname(from)) this.dirs.add(dirname(from));
    const to = this.uniqueName(normalizePath(path), id);
    if (to === from) return;
    this.commitPendingWrite(f);
    f.name = to;
    f.updated = Date.now();
    this.moveLang(from, to);
    this.openParents(to);
    void this.run(`move ${basename(from)}`, () => this.ws.move(from, to));
    this.saveMeta();
    this.emit();
  }

  /** Renames or moves a folder with everything in it. */
  renameFolder(from: string, to: string): void {
    const dest = normalizePath(to);
    if (!from || dest === from) return;
    const move = (p: string) => (p === from ? dest : isInside(p, from) ? dest + p.slice(from.length) : p);
    for (const f of this.files) {
      if (!isInside(f.name, from)) continue;
      this.commitPendingWrite(f);
      const next = move(f.name);
      this.moveLang(f.name, next);
      f.name = next;
    }
    this.dirs = new Set([...this.dirs].map(move));
    this.expanded = new Set([...this.expanded].map(move));
    this.openParents(dest);
    this.expanded.add(dest);
    void this.run(`move the folder ${basename(from)}`, () => this.ws.move(from, dest));
    this.saveMeta();
    this.emit();
  }

  private moveLang(from: string, to: string): void {
    if (this.langs[from] === undefined) return;
    this.langs[to] = this.langs[from];
    delete this.langs[from];
  }

  setLang(id: string, lang: string): void {
    const f = this.get(id);
    if (!f) return;
    f.lang = lang;
    if (lang) this.langs[f.name] = lang;
    else delete this.langs[f.name];
    this.saveMeta();
    this.emit();
  }

  /** Removes a file. If it was the last text file, a blank one takes its place. */
  remove(id: string): void {
    const f = this.get(id);
    if (!f) return;
    this.cancelPendingWrite(f);
    if (dirname(f.name)) this.dirs.add(dirname(f.name));
    this.files = this.files.filter((x) => x.id !== id);
    delete this.langs[f.name];
    void this.run(`delete ${basename(f.name)}`, () => this.ws.removeFile(f.name));
    this.afterRemove();
  }

  /** Removes a folder and everything in it. */
  removeFolder(folder: string): void {
    for (const f of this.filesIn(folder)) this.cancelPendingWrite(f);
    this.files = this.files.filter((f) => !isInside(f.name, folder));
    const keep = (p: string) => p !== folder && !isInside(p, folder);
    this.dirs = new Set([...this.dirs].filter(keep));
    this.expanded = new Set([...this.expanded].filter(keep));
    if (dirname(folder)) this.dirs.add(dirname(folder));
    void this.run(`delete the folder ${basename(folder)}`, () => this.ws.removeDir(folder));
    this.afterRemove();
  }

  private afterRemove(): void {
    if (!this.get(this.activeId) || this.get(this.activeId)?.binary) {
      const next = this.sorted().find((f) => !f.binary);
      this.activeId = next?.id ?? "";
    }
    if (!this.activeId) this.activeId = this.create("untitled.md").id;
    this.saveMeta();
    this.emit();
  }

  setActive(id: string): void {
    const f = this.get(id);
    if (!f || id === this.activeId) return;
    this.activeId = id;
    this.openParents(f.name);
    this.saveMeta();
    this.emit();
  }

  toggleFolder(folder: string): boolean {
    const open = !this.expanded.has(folder);
    if (open) this.expanded.add(folder);
    else this.expanded.delete(folder);
    this.saveMeta();
    return open;
  }

  /** Called on every edit; writes the file shortly after typing stops. */
  setContent(id: string, content: string): void {
    const f = this.get(id);
    if (!f || f.binary) return;
    if (f.content === content) return;
    f.content = content;
    f.size = content.length;
    f.updated = Date.now();
    clearTimeout(this.writeTimers.get(id));
    this.writeTimers.set(id, window.setTimeout(() => this.commitPendingWrite(f), 500));
  }

  private commitPendingWrite(f: FileRec): void {
    if (!this.writeTimers.has(f.id)) return;
    clearTimeout(this.writeTimers.get(f.id));
    this.writeTimers.delete(f.id);
    const name = f.name;
    const text = f.content ?? "";
    void this.run(`save ${basename(name)}`, async () => {
      await this.ws.writeText(name, text);
      // Our own write is not "changed by another app" on the next refresh.
      f.updated = Date.now();
    });
  }

  private cancelPendingWrite(f: FileRec): void {
    clearTimeout(this.writeTimers.get(f.id));
    this.writeTimers.delete(f.id);
  }

  /** Writes every unsaved change now and waits for storage to finish. */
  async flush(): Promise<void> {
    for (const f of this.files) this.commitPendingWrite(f);
    await this.queue;
  }

  saveMeta(extra: Partial<Meta> = {}): void {
    const prev = loadJSON<Meta>(META_KEY, {});
    saveJSON(META_KEY, {
      ...prev,
      ...extra,
      active: this.get(this.activeId)?.name ?? prev.active,
      expanded: [...this.expanded],
      langs: this.langs,
    } satisfies Meta);
  }
}
