import { ancestors, basename, dirname, isInside, normalizePath, splitExt } from "./paths";
import { sampleFiles } from "./samples";
import { loadJSON, saveJSON } from "./storage";

export interface FileRec {
  id: string;
  /** Full path in the workspace, e.g. "src/app.js". */
  name: string;
  content: string;
  /** Language name chosen by the user. Empty means "detect from the file name". */
  lang: string;
  updated: number;
}

interface Saved {
  files: FileRec[];
  active: string;
  /** Folders created by the user (folders holding files exist on their own). */
  folders?: string[];
  /** Folders open in the file tree. */
  expanded?: string[];
}

const KEY = "thumbcode.files";

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class FileStore {
  files: FileRec[];
  activeId: string;
  /** Empty folders the user made; folders with files are derived from file paths. */
  private emptyFolders: Set<string>;
  expanded: Set<string>;
  private saveTimer = 0;
  private listeners: (() => void)[] = [];

  constructor() {
    const saved = loadJSON<Saved | null>(KEY, null);
    if (saved && Array.isArray(saved.files) && saved.files.length) {
      this.files = saved.files.map((f) => ({ ...f, name: normalizePath(f.name) || "untitled.txt", lang: f.lang ?? "" }));
      this.activeId = this.files.some((f) => f.id === saved.active) ? saved.active : this.files[0].id;
      this.emptyFolders = new Set(saved.folders ?? []);
      this.expanded = new Set(saved.expanded ?? []);
    } else {
      const now = Date.now();
      this.files = sampleFiles.map((f, i) => ({ id: newId() + i, name: f.name, content: f.content, lang: "", updated: now - i * 60000 }));
      this.activeId = this.files[0].id;
      this.emptyFolders = new Set();
      this.expanded = new Set(this.folders());
      this.persist();
    }
  }

  onChange(l: () => void): void {
    this.listeners.push(l);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

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

  /** Every folder, sorted: ones the user made plus the ones that hold files. */
  folders(): string[] {
    const all = new Set<string>();
    for (const f of this.emptyFolders) {
      all.add(f);
      for (const a of ancestors(f)) all.add(a);
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

  private openParents(path: string): void {
    for (const a of ancestors(path)) this.expanded.add(a);
  }

  create(path: string, content = ""): FileRec {
    const name = this.uniqueName(normalizePath(path));
    const file: FileRec = { id: newId(), name, content, lang: "", updated: Date.now() };
    this.files.push(file);
    for (const a of ancestors(name)) this.emptyFolders.delete(a);
    this.openParents(name);
    this.activeId = file.id;
    this.persist();
    this.emit();
    return file;
  }

  createFolder(path: string): string {
    const folder = normalizePath(path);
    this.emptyFolders.add(folder);
    this.expanded.add(folder);
    this.openParents(folder);
    this.persist();
    this.emit();
    return folder;
  }

  duplicate(id: string): FileRec | undefined {
    const src = this.get(id);
    if (!src) return;
    const [base, ext] = splitExt(src.name);
    const file = this.create(`${base}-copy${ext}`, src.content);
    file.lang = src.lang;
    this.persist();
    return file;
  }

  /** Renames or moves a file; a new folder in the path is created. */
  rename(id: string, path: string): void {
    const f = this.get(id);
    if (!f) return;
    // Keep the folder it came from, even if it is now empty (like VS Code).
    if (dirname(f.name)) this.emptyFolders.add(dirname(f.name));
    f.name = this.uniqueName(normalizePath(path), id);
    f.updated = Date.now();
    this.openParents(f.name);
    this.persist();
    this.emit();
  }

  /** Renames or moves a folder with everything in it. */
  renameFolder(from: string, to: string): void {
    const dest = normalizePath(to);
    if (!from || dest === from) return;
    const move = (p: string) => (p === from ? dest : isInside(p, from) ? dest + p.slice(from.length) : p);
    for (const f of this.files) f.name = move(f.name);
    this.emptyFolders = new Set([...this.emptyFolders].map(move));
    this.expanded = new Set([...this.expanded].map(move));
    this.openParents(dest);
    this.expanded.add(dest);
    this.persist();
    this.emit();
  }

  setLang(id: string, lang: string): void {
    const f = this.get(id);
    if (!f) return;
    f.lang = lang;
    this.persist();
    this.emit();
  }

  /** Removes a file. Returns false when it is the last one (there is always one open file). */
  remove(id: string): boolean {
    if (this.files.length <= 1) return false;
    const f = this.get(id);
    if (f && dirname(f.name)) this.emptyFolders.add(dirname(f.name));
    this.files = this.files.filter((x) => x.id !== id);
    if (this.activeId === id) this.activeId = this.sorted()[0].id;
    this.persist();
    this.emit();
    return true;
  }

  /** Removes a folder and everything in it. A blank file is made if nothing would be left. */
  removeFolder(folder: string): void {
    this.files = this.files.filter((f) => !isInside(f.name, folder));
    const keep = (p: string) => p !== folder && !isInside(p, folder);
    this.emptyFolders = new Set([...this.emptyFolders].filter(keep));
    this.expanded = new Set([...this.expanded].filter(keep));
    const parent = dirname(folder);
    if (parent) this.emptyFolders.add(parent);
    if (!this.files.length) this.files.push({ id: newId(), name: "untitled.md", content: "", lang: "", updated: Date.now() });
    if (!this.get(this.activeId)) this.activeId = this.sorted()[0].id;
    this.persist();
    this.emit();
  }

  /** Most recently edited first. */
  sorted(): FileRec[] {
    return [...this.files].sort((a, b) => b.updated - a.updated);
  }

  setActive(id: string): void {
    if (!this.get(id) || id === this.activeId) return;
    this.activeId = id;
    this.openParents(this.get(id)!.name);
    this.persist();
    this.emit();
  }

  toggleFolder(folder: string): boolean {
    const open = !this.expanded.has(folder);
    if (open) this.expanded.add(folder);
    else this.expanded.delete(folder);
    this.persist();
    return open;
  }

  /** Called on every edit; writes to storage shortly after typing stops. */
  setContent(id: string, content: string): void {
    const f = this.get(id);
    if (!f) return;
    f.content = content;
    f.updated = Date.now();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 400);
  }

  persist(): void {
    clearTimeout(this.saveTimer);
    // Drop "empty" folders that now hold files.
    const used = new Set(this.files.flatMap((f) => ancestors(f.name)));
    for (const f of this.emptyFolders) if (used.has(f)) this.emptyFolders.delete(f);
    saveJSON(KEY, {
      files: this.files,
      active: this.activeId,
      folders: [...this.emptyFolders],
      expanded: [...this.expanded],
    } satisfies Saved);
  }
}
