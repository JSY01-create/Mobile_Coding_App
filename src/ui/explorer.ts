// The file tree (like VS Code's Explorer): folders, files, and everything you can do with them.
import { strToU8, unzipSync, zipSync } from "fflate";
import { IMAGE_EXT, isBinaryName, type FileRec, type FileStore } from "../files";
import { extTag, languageFor, PLAIN } from "../languages";
import { isNative, nativeShareBytes, nativeShareFile } from "../native";
import { ancestors, basename, dirname, isInside, joinPath, normalizePath, pathProblem, splitExt } from "../paths";
import { h, icon, icons } from "./dom";
import { menuList, type Handle, type Overlays } from "./overlay";

export interface ExplorerHost {
  readonly files: FileStore;
  /** Where files are kept, e.g. "Documents/Thumbcode". */
  storageLabel(): string;
  /** True when the files are in the phone's shared storage. */
  storageShared(): boolean;
  /** Offers to move files to Documents/Thumbcode (Android only). */
  canUsePhoneStorage(): boolean;
  usePhoneStorage(): Promise<void>;
  /** Re-reads the folder to pick up files other apps added. */
  refresh(): Promise<void>;
  overlays: Overlays;
  currentId(): string;
  /** Saves the open file's text into the store right away. */
  flushSave(): void;
  openFile(id: string): void;
  /** Files were renamed or moved (their language may have changed). */
  pathsChanged(ids: string[]): void;
  /** Files were deleted; switch the editor if the open one is gone. */
  filesRemoved(ids: string[]): void;
  toast(message: string, ms?: number): void;
}

const MAX_IMPORT = 20_000_000;

export class Explorer {
  /** Folder new files and folders go into ("" is the top level). */
  private selected = "";
  private drawer: Handle | null = null;
  private tree: HTMLElement | null = null;
  private input: HTMLInputElement;

  constructor(private host: ExplorerHost) {
    this.input = h("input.hidden-input", { type: "file", multiple: true, "aria-hidden": "true", tabindex: "-1" });
    document.body.append(this.input);
    this.input.addEventListener("change", () => void this.importPicked());
  }

  private get files(): FileStore {
    return this.host.files;
  }

  // ---- Tree --------------------------------------------------------------------

  open(): void {
    this.host.flushSave();
    const current = this.files.get(this.host.currentId());
    if (current && !this.files.isFolder(this.selected)) this.selected = dirname(current.name);
    if (current) for (const a of ancestors(current.name)) this.files.expanded.add(a);

    const tool = (label: string, ic: string, run: () => void) => {
      const b = h("button.icon-btn.tool", { type: "button", "aria-label": label, title: label }, icon(ic, { size: 21 }));
      b.addEventListener("click", run);
      return b;
    };
    const title = h("button.explorer-title", { type: "button", "aria-label": "Select the top level" }, "Files");
    title.addEventListener("click", () => {
      this.selected = "";
      this.render();
    });
    this.tree = h("div.tree", { role: "tree", "aria-label": "Files and folders" });
    const body = h(
      "div.drawer-inner",
      {},
      h(
        "div.explorer-head",
        {},
        title,
        h(
          "div.explorer-tools",
          {},
          tool("New file", icons.filePlus, () => this.closeThen(() => this.newFile(this.selected))),
          tool("New folder", icons.folderPlus, () => this.closeThen(() => this.newFolder(this.selected))),
          tool("Open files or a .zip from your phone", icons.upload, () => this.closeThen(() => this.input.click())),
          tool("Save everything as a .zip", icons.zip, () => this.closeThen(() => this.saveZip(""))),
          tool("Refresh", icons.refresh, () => void this.host.refresh().then(() => this.render()))
        )
      ),
      this.tree,
      this.footer()
    );
    this.drawer = this.host.overlays.drawer(body, "Files");
    this.render();
    this.tree.querySelector(".tree-row.active")?.scrollIntoView({ block: "nearest" });
  }

  private footer(): HTMLElement {
    const where = h("p.drawer-foot", {}, `Saved in ${this.host.storageLabel()}.`);
    if (this.host.storageShared()) {
      where.append(" Other apps, like Files and Gallery, can add files there too.");
    } else if (this.host.canUsePhoneStorage()) {
      const btn = h("button.btn.small.primary", { type: "button" }, "Use phone storage");
      btn.addEventListener("click", () => this.closeThen(() => void this.host.usePhoneStorage()));
      where.append(" Keep projects in Documents/Thumbcode so you can add images with other apps.", h("br"), btn);
    }
    return h("div.drawer-foot-wrap", {}, h("p.drawer-tip", {}, "New files go into the highlighted folder. Type a path like src/app.js to make folders as you go."), where);
  }

  /** Re-draws the tree if the panel is open (after files change elsewhere). */
  update(): void {
    this.render();
  }

  private closeThen(fn: () => void): void {
    this.drawer?.close();
    this.drawer = null;
    fn();
  }

  private render(): void {
    if (!this.tree) return;
    const current = this.host.currentId();
    const rows: HTMLElement[] = [];
    const folders = this.files.folders();

    const childFolders = (parent: string) => folders.filter((f) => dirname(f) === parent);
    const childFiles = (parent: string) =>
      this.files.files.filter((f) => dirname(f.name) === parent).sort((a, b) => basename(a.name).localeCompare(basename(b.name)));

    const walk = (parent: string, depth: number) => {
      for (const folder of childFolders(parent)) {
        const open = this.files.expanded.has(folder);
        const count = this.files.filesIn(folder).length;
        const row = h(
          `button.tree-row.folder${folder === this.selected ? ".selected" : ""}` as "button",
          { type: "button", role: "treeitem", "aria-expanded": String(open), style: `--depth: ${depth}` },
          h(`span.tree-chev${open ? ".open" : ""}` as "span", {}, icon(icons.chevronRightSmall, { size: 16 })),
          icon(open ? icons.folderOpen : icons.folder, { size: 20 }),
          h("span.tree-name", {}, basename(folder)),
          count ? h("span.tree-count", {}, String(count)) : null
        );
        row.addEventListener("click", () => {
          this.selected = folder;
          this.files.toggleFolder(folder);
          this.render();
        });
        rows.push(this.item(row, () => this.closeThen(() => this.folderActions(folder)), `Actions for folder ${basename(folder)}`));
        if (open) walk(folder, depth + 1);
      }
      for (const file of childFiles(parent)) {
        const tag = IMAGE_EXT.test(file.name) && file.binary ? "img" : extTag(file.name);
        const row = h(
          `button.tree-row.file${file.id === current ? ".active" : ""}` as "button",
          { type: "button", role: "treeitem", style: `--depth: ${depth}` },
          h("span.tree-chev"),
          h("span.badge.small", { "data-ext": tag }, tag),
          h("span.tree-name", {}, basename(file.name))
        );
        row.addEventListener("click", () => {
          this.selected = dirname(file.name);
          this.closeThen(() => (file.binary ? void this.preview(file) : this.host.openFile(file.id)));
        });
        rows.push(this.item(row, () => this.closeThen(() => this.fileActions(file)), `Actions for ${basename(file.name)}`));
      }
    };
    walk("", 0);
    this.tree.replaceChildren(...rows);
    this.tree.parentElement?.querySelector(".explorer-title")?.classList.toggle("selected", this.selected === "");
  }

  private item(row: HTMLElement, more: () => void, label: string): HTMLElement {
    const btn = h("button.icon-btn.tree-more", { type: "button", "aria-label": label }, icon(icons.more, { size: 18 }));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      more();
    });
    return h("div.tree-item", {}, row, btn);
  }

  // ---- Create, rename, delete ----------------------------------------------------

  private validate(path: string, exceptId?: string, exceptFolder?: string): string | null {
    return pathProblem(path) ?? this.files.conflict(path, exceptId, exceptFolder);
  }

  async newFile(folder = this.selected): Promise<void> {
    const active = this.files.get(this.host.currentId());
    const ext = active ? splitExt(active.name)[1] || ".txt" : ".txt";
    const suggestion = this.files.uniqueName(joinPath(folder, `untitled${ext}`));
    const start = folder ? folder.length + 1 : 0;
    const path = await this.host.overlays.prompt({
      title: folder ? `New file in ${basename(folder)}` : "New file",
      value: suggestion,
      placeholder: "src/app.js",
      ok: "Create",
      select: [start, splitExt(suggestion)[0].length],
      validate: (v) => this.validate(normalizePath(v)),
    });
    if (!path) return;
    const file = this.files.create(normalizePath(path));
    this.selected = dirname(file.name);
    this.host.openFile(file.id);
    const lang = languageFor(file);
    this.host.toast(lang ? `${lang.name} file` : "Plain text file. Add an extension like .py for highlighting.", 2200);
  }

  async newFolder(parent = this.selected): Promise<void> {
    const suggestion = this.uniqueFolder(joinPath(parent, "new-folder"));
    const path = await this.host.overlays.prompt({
      title: parent ? `New folder in ${basename(parent)}` : "New folder",
      value: suggestion,
      placeholder: "src",
      ok: "Create",
      select: [parent ? parent.length + 1 : 0, suggestion.length],
      validate: (v) => this.validate(normalizePath(v)),
    });
    if (!path) return;
    this.selected = this.files.createFolder(normalizePath(path));
    this.open();
  }

  private uniqueFolder(path: string): string {
    if (!this.files.conflict(path)) return path;
    for (let i = 2; ; i++) if (!this.files.conflict(`${path}-${i}`)) return `${path}-${i}`;
  }

  /** Rename or move a file: the path can include folders. */
  async renameFile(file: FileRec): Promise<void> {
    const dir = dirname(file.name);
    const path = await this.host.overlays.prompt({
      title: "Rename or move",
      value: file.name,
      ok: "Save",
      select: [dir ? dir.length + 1 : 0, splitExt(file.name)[0].length],
      validate: (v) => this.validate(normalizePath(v), file.id),
    });
    const dest = path && normalizePath(path);
    if (!dest || dest === file.name) return;
    this.files.rename(file.id, dest);
    this.host.pathsChanged([file.id]);
  }

  async renameFolder(folder: string): Promise<void> {
    const parent = dirname(folder);
    const path = await this.host.overlays.prompt({
      title: "Rename or move folder",
      value: folder,
      ok: "Save",
      select: [parent ? parent.length + 1 : 0, folder.length],
      validate: (v) => {
        const dest = normalizePath(v);
        if (isInside(dest, folder)) return "A folder can't go inside itself.";
        return dest === folder ? null : this.validate(dest, undefined, folder);
      },
    });
    const dest = path && normalizePath(path);
    if (!dest || dest === folder) return;
    const moved = this.files.filesIn(folder).map((f) => f.id);
    this.files.renameFolder(folder, dest);
    if (this.selected === folder || isInside(this.selected, folder)) this.selected = dest + this.selected.slice(folder.length);
    this.host.pathsChanged(moved);
    this.open();
  }

  async deleteFile(file: FileRec): Promise<void> {
    const ok = await this.host.overlays.confirm({
      title: `Delete ${basename(file.name)}?`,
      message: "It is removed from this device. This can't be undone.",
      ok: "Delete",
      danger: true,
    });
    if (!ok) return;
    this.files.remove(file.id);
    this.host.filesRemoved([file.id]);
    this.host.toast(`Deleted ${basename(file.name)}`);
  }

  async deleteFolder(folder: string): Promise<void> {
    const inside = this.files.filesIn(folder);
    const ok = await this.host.overlays.confirm({
      title: `Delete ${basename(folder)}?`,
      message: inside.length
        ? `The folder and the ${inside.length === 1 ? "file" : `${inside.length} files`} in it are removed from this device. This can't be undone.`
        : "The empty folder is removed.",
      ok: "Delete",
      danger: true,
    });
    if (!ok) return;
    this.files.removeFolder(folder);
    if (this.selected === folder || isInside(this.selected, folder)) this.selected = dirname(folder);
    this.host.filesRemoved(inside.map((f) => f.id));
    this.host.toast(`Deleted ${basename(folder)}`);
  }

  duplicate(file: FileRec): void {
    if (file.id === this.host.currentId()) this.host.flushSave();
    const copy = this.files.duplicate(file.id);
    if (copy) {
      this.files.setActive(this.host.currentId());
      this.host.openFile(copy.id);
    }
  }

  // ---- Menus ---------------------------------------------------------------------

  /** Shows an image (or details for other non-text files) with its actions. */
  async preview(file: FileRec): Promise<void> {
    const body = h("div.img-preview");
    const info = h("p.sheet-note", {}, `${dirname(file.name) ? dirname(file.name) + "/ · " : ""}${formatSize(file.size)}`);
    let url = "";
    if (IMAGE_EXT.test(file.name)) {
      const img = h("img.preview-img", { alt: basename(file.name) });
      body.append(h("div.preview-frame", {}, img));
      try {
        const bytes = await this.files.readBytes(file);
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFor(file.name) }));
        img.src = url;
        img.addEventListener("load", () => info.append(` · ${img.naturalWidth} × ${img.naturalHeight} px`), { once: true });
      } catch {
        body.replaceChildren(h("p.empty", {}, "This image couldn't be read."));
      }
    } else {
      body.append(h("p.empty", {}, "Thumbcode can't show this kind of file, but you can move, share or delete it."));
    }
    const path = h("p.preview-path", {}, `Its path is ${file.name}. In src="" and url(), suggestions fill in the right path for you.`);
    const sheet = this.host.overlays.sheet({
      title: basename(file.name),
      className: "tall",
      onClose: () => url && URL.revokeObjectURL(url),
      body: h(
        "div",
        {},
        info,
        body,
        IMAGE_EXT.test(file.name) ? path : null,
        menuList([
          { label: "Rename or move", icon: icons.pencil, run: () => { sheet.close(); void this.renameFile(file); } },
          { label: "Duplicate", icon: icons.copy, run: () => { sheet.close(); this.files.duplicate(file.id); } },
          { label: "Save to device", icon: icons.download, run: () => { sheet.close(); void this.exportFile(file); } },
          null,
          { label: "Delete", icon: icons.trash, danger: true, run: () => { sheet.close(); void this.deleteFile(file); } },
        ])
      ),
    });
  }

  fileActions(file: FileRec): void {
    const lang = languageFor(file)?.name ?? PLAIN;
    const sheet = this.host.overlays.sheet({
      title: basename(file.name),
      body: h(
        "div",
        {},
        h("p.sheet-note", {}, `${dirname(file.name) ? dirname(file.name) + "/ · " : ""}${lang}`),
        menuList([
          { label: "Rename or move", icon: icons.pencil, run: () => { sheet.close(); void this.renameFile(file); } },
          { label: "Duplicate", icon: icons.copy, run: () => { sheet.close(); this.duplicate(file); } },
          { label: "Save to device", icon: icons.download, run: () => { sheet.close(); void this.exportFile(file); } },
          null,
          { label: "Delete", icon: icons.trash, danger: true, run: () => { sheet.close(); void this.deleteFile(file); } },
        ])
      ),
    });
  }

  folderActions(folder: string): void {
    const name = basename(folder);
    const sheet = this.host.overlays.sheet({
      title: `${name}/`,
      body: menuList([
        { label: `New file in ${name}`, icon: icons.filePlus, run: () => { sheet.close(); void this.newFile(folder); } },
        { label: `New folder in ${name}`, icon: icons.folderPlus, run: () => { sheet.close(); void this.newFolder(folder); } },
        { label: `Add files to ${name}`, icon: icons.upload, run: () => { sheet.close(); this.selected = folder; this.input.click(); } },
        { label: "Rename or move", icon: icons.pencil, run: () => { sheet.close(); void this.renameFolder(folder); } },
        { label: "Save folder as .zip", icon: icons.zip, run: () => { sheet.close(); void this.saveZip(folder); } },
        null,
        { label: "Delete folder", icon: icons.trash, danger: true, run: () => { sheet.close(); void this.deleteFolder(folder); } },
      ]),
    });
  }

  // ---- Import and export ---------------------------------------------------------

  pickFiles(): void {
    this.input.click();
  }

  private async importPicked(): Promise<void> {
    const picked = [...(this.input.files ?? [])];
    this.input.value = "";
    const into = this.selected;
    const current = this.host.currentId();
    let first: FileRec | null = null;
    let firstOther: FileRec | null = null;
    let added = 0;
    let skipped = 0;
    for (const f of picked) {
      if (f.size > MAX_IMPORT) {
        this.host.toast(`${f.name} is too large (20 MB limit).`, 2600);
        continue;
      }
      if (/\.zip$/i.test(f.name)) {
        const res = this.importZip(new Uint8Array(await f.arrayBuffer()), into);
        added += res.added;
        skipped += res.skipped;
        first ??= res.first;
        continue;
      }
      const path = joinPath(into, f.name);
      const bytes = new Uint8Array(await f.arrayBuffer());
      const text = isBinaryName(f.name) ? null : decodeText(bytes);
      const file = text === null ? this.files.addBytes(path, bytes) : this.files.create(path, text);
      if (text !== null) first ??= file;
      else firstOther ??= file;
      added++;
    }
    this.files.setActive(current);
    if (first) this.host.openFile(first.id);
    else if (firstOther && picked.length === 1) void this.preview(firstOther);
    if (added) this.host.toast(`Added ${added} ${added === 1 ? "file" : "files"}${into ? ` to ${basename(into)}` : ""}`, 2600);
    else if (skipped) this.host.toast("Nothing could be added.", 2600);
  }

  private importZip(data: Uint8Array, into: string): { added: number; skipped: number; first: FileRec | null } {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(data);
    } catch {
      this.host.toast("That .zip file couldn't be read.");
      return { added: 0, skipped: 0, first: null };
    }
    let added = 0;
    let skipped = 0;
    let first: FileRec | null = null;
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.startsWith("__MACOSX/") || basename(name) === ".DS_Store") continue;
      const path = joinPath(into, name);
      if (name.endsWith("/")) {
        if (path && !this.files.isFolder(path)) this.files.createFolder(path);
        continue;
      }
      if (pathProblem(path)) {
        skipped++;
        continue;
      }
      const text = isBinaryName(name) ? null : decodeText(bytes);
      // A name that is taken gets a number (index-2.html), so nothing is overwritten.
      const file = text === null ? this.files.addBytes(path, bytes) : this.files.create(path, text);
      if (text !== null) first ??= file;
      added++;
    }
    return { added, skipped, first };
  }

  async exportFile(file: FileRec): Promise<void> {
    if (file.id === this.host.currentId()) this.host.flushSave();
    const name = basename(file.name);
    try {
      if (file.binary) {
        const bytes = await this.files.readBytes(file);
        if (isNative) await nativeShareBytes(name, bytes);
        else await webSave(new Blob([bytes as BlobPart], { type: mimeFor(name) }), name, mimeFor(name));
        return;
      }
      const text = (await this.files.ensureContent(file.id))?.content ?? "";
      if (isNative) await nativeShareFile(name, text);
      else await webSave(new Blob([text], { type: "text/plain" }), name, "text/plain");
    } catch {
      this.host.toast(`Couldn't save ${name}.`);
    }
  }

  /** Saves a folder (or everything, for "") as a .zip. */
  async saveZip(folder: string): Promise<void> {
    this.host.flushSave();
    const list = this.files.filesIn(folder);
    if (!list.length) {
      this.host.toast("This folder is empty.");
      return;
    }
    // Keep the folder itself in the zip, e.g. website/index.html.
    const strip = folder ? dirname(folder) : "";
    const entries: Record<string, Uint8Array> = {};
    await this.files.flush();
    for (const f of list) {
      const key = strip ? f.name.slice(strip.length + 1) : f.name;
      try {
        entries[key] = f.binary ? await this.files.readBytes(f) : strToU8((await this.files.ensureContent(f.id))?.content ?? "");
      } catch {
        this.host.toast(`Skipped ${basename(f.name)}: it couldn't be read.`);
      }
    }
    const zipped = zipSync(entries, { level: 6 });
    const name = `${folder ? basename(folder) : "thumbcode-files"}.zip`;
    if (isNative) {
      try {
        await nativeShareBytes(name, zipped);
      } catch {
        this.host.toast(`Couldn't save ${name}.`);
      }
      return;
    }
    await webSave(new Blob([zipped as BlobPart], { type: "application/zip" }), name, "application/zip");
  }
}

/** Text from bytes, or null when they aren't text (not UTF-8, or contain NUL bytes). */
function decodeText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.slice(0, 8000).includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif", svg: "image/svg+xml", pdf: "application/pdf", zip: "application/zip",
};

function mimeFor(name: string): string {
  return MIME[splitExt(name)[1].slice(1).toLowerCase()] ?? "application/octet-stream";
}

async function webSave(blob: Blob, name: string, type: string): Promise<void> {
  try {
    const shared = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [shared] })) {
      await navigator.share({ files: [shared], title: name });
      return;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
  }
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
