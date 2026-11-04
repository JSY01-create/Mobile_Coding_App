import { sampleFiles } from "./samples";
import { loadJSON, saveJSON } from "./storage";

export interface FileRec {
  id: string;
  name: string;
  content: string;
  /** Language name chosen by the user. Empty means "detect from the file name". */
  lang: string;
  updated: number;
}

interface Saved {
  files: FileRec[];
  active: string;
}

const KEY = "thumbcode.files";

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class FileStore {
  files: FileRec[];
  activeId: string;
  private saveTimer = 0;
  private listeners: (() => void)[] = [];

  constructor() {
    const saved = loadJSON<Saved | null>(KEY, null);
    if (saved && Array.isArray(saved.files) && saved.files.length) {
      this.files = saved.files.map((f) => ({ ...f, lang: f.lang ?? "" }));
      this.activeId = this.files.some((f) => f.id === saved.active) ? saved.active : this.files[0].id;
    } else {
      const now = Date.now();
      this.files = sampleFiles.map((f, i) => ({ id: newId() + i, name: f.name, content: f.content, lang: "", updated: now - i * 60000 }));
      this.activeId = this.files[0].id;
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

  /** Most recently edited first. */
  sorted(): FileRec[] {
    return [...this.files].sort((a, b) => b.updated - a.updated);
  }

  uniqueName(name: string, exceptId?: string): string {
    const taken = new Set(this.files.filter((f) => f.id !== exceptId).map((f) => f.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let i = 2; ; i++) {
      const candidate = `${base}-${i}${ext}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  create(name: string, content = ""): FileRec {
    const file: FileRec = { id: newId(), name: this.uniqueName(name), content, lang: "", updated: Date.now() };
    this.files.push(file);
    this.activeId = file.id;
    this.persist();
    this.emit();
    return file;
  }

  duplicate(id: string): FileRec | undefined {
    const src = this.get(id);
    if (!src) return;
    const dot = src.name.lastIndexOf(".");
    const copyName = dot > 0 ? `${src.name.slice(0, dot)}-copy${src.name.slice(dot)}` : `${src.name}-copy`;
    const file = this.create(copyName, src.content);
    file.lang = src.lang;
    this.persist();
    return file;
  }

  rename(id: string, name: string): void {
    const f = this.get(id);
    if (!f) return;
    f.name = this.uniqueName(name, id);
    f.updated = Date.now();
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
    this.files = this.files.filter((f) => f.id !== id);
    if (this.activeId === id) this.activeId = this.sorted()[0].id;
    this.persist();
    this.emit();
    return true;
  }

  setActive(id: string): void {
    if (!this.get(id) || id === this.activeId) return;
    this.activeId = id;
    this.persist();
    this.emit();
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
    saveJSON(KEY, { files: this.files, active: this.activeId } satisfies Saved);
  }
}
