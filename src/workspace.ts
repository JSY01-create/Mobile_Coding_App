// Where project files are kept. One API over Capacitor's Filesystem:
// - Android with file access: real folders in Documents/Thumbcode (other apps can see them)
// - Android without it: the app's private storage
// - Browser: IndexedDB (no size limit like localStorage, and binary files work)
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { registerPlugin } from "@capacitor/core";
import { isNative } from "./native";

export interface Entry {
  path: string;
  kind: "file" | "dir";
  size: number;
  mtime: number;
}

/** Folders not worth listing (huge, and not edited by hand). */
const SKIP_DIRS = new Set([".git", "node_modules", ".gradle", "build", "dist", "__pycache__", ".venv", ".idea"]);
const MAX_ENTRIES = 5000;

export class Workspace {
  constructor(
    private directory: Directory,
    private root: string,
    /** Shown to people, e.g. "Documents/Thumbcode". */
    readonly label: string,
    /** True when other apps (Files, Gallery) can see the files. */
    readonly shared: boolean
  ) {}

  private p(path: string): string {
    return path ? `${this.root}/${path}` : this.root;
  }

  /** file:// address of the workspace folder (Android), for serving files to the preview. */
  async rootUri(): Promise<string> {
    return (await Filesystem.getUri({ path: this.root, directory: this.directory })).uri;
  }

  async ensureRoot(): Promise<void> {
    try {
      await Filesystem.mkdir({ path: this.root, directory: this.directory, recursive: true });
    } catch {
      // Already there.
    }
  }

  /** Every file and folder, depth first. Skips heavy folders like .git and node_modules. */
  async list(): Promise<Entry[]> {
    const out: Entry[] = [];
    const walk = async (dir: string) => {
      let res;
      try {
        res = await Filesystem.readdir({ path: this.p(dir), directory: this.directory });
      } catch {
        return;
      }
      for (const f of res.files) {
        if (out.length >= MAX_ENTRIES) return;
        const path = dir ? `${dir}/${f.name}` : f.name;
        const mtime = typeof f.mtime === "number" ? f.mtime : Number(f.mtime) || 0;
        if (f.type === "directory") {
          out.push({ path, kind: "dir", size: 0, mtime });
          if (!SKIP_DIRS.has(f.name)) await walk(path);
        } else {
          out.push({ path, kind: "file", size: f.size ?? 0, mtime });
        }
      }
    };
    await walk("");
    return out;
  }

  async readText(path: string): Promise<string> {
    const { data } = await Filesystem.readFile({ path: this.p(path), directory: this.directory, encoding: Encoding.UTF8 });
    return typeof data === "string" ? data : await data.text();
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const { data } = await Filesystem.readFile({ path: this.p(path), directory: this.directory });
    if (typeof data !== "string") return new Uint8Array(await data.arrayBuffer());
    return base64ToBytes(data);
  }

  async writeText(path: string, text: string): Promise<void> {
    await Filesystem.writeFile({ path: this.p(path), directory: this.directory, data: text, encoding: Encoding.UTF8, recursive: true });
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    await Filesystem.writeFile({ path: this.p(path), directory: this.directory, data: bytesToBase64(bytes), recursive: true });
  }

  async mkdir(path: string): Promise<void> {
    try {
      await Filesystem.mkdir({ path: this.p(path), directory: this.directory, recursive: true });
    } catch (e) {
      if (!/exist/i.test(String((e as Error)?.message ?? e))) throw e;
    }
  }

  /** Moves a file or folder; creates the destination's parent folders. */
  async move(from: string, to: string): Promise<void> {
    const parent = to.includes("/") ? to.slice(0, to.lastIndexOf("/")) : "";
    if (parent) await this.mkdir(parent);
    await Filesystem.rename({ from: this.p(from), to: this.p(to), directory: this.directory, toDirectory: this.directory });
  }

  async removeFile(path: string): Promise<void> {
    await Filesystem.deleteFile({ path: this.p(path), directory: this.directory });
  }

  async removeDir(path: string): Promise<void> {
    await Filesystem.rmdir({ path: this.p(path), directory: this.directory, recursive: true });
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]*,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- Android file access --------------------------------------------------------

interface StorageAccessPlugin {
  check(): Promise<{ granted: boolean }>;
  request(): Promise<{ granted: boolean }>;
}

/** Native plugin in android/app (StorageAccessPlugin.java). */
const StorageAccess = registerPlugin<StorageAccessPlugin>("StorageAccess");

export async function hasPhoneStorage(): Promise<boolean> {
  if (!isNative) return false;
  try {
    return (await StorageAccess.check()).granted;
  } catch {
    return false;
  }
}

/** Opens Android's "Allow access to manage all files" screen (or the older permission prompt). */
export async function requestPhoneStorage(): Promise<boolean> {
  if (!isNative) return false;
  try {
    return (await StorageAccess.request()).granted;
  } catch {
    return false;
  }
}

export const phoneWorkspace = () => new Workspace(Directory.Documents, "Thumbcode", "Documents/Thumbcode", true);
export const appWorkspace = () =>
  new Workspace(Directory.Data, "workspace", isNative ? "inside the app" : "this browser", false);

/** The phone folder when Thumbcode may use it, otherwise private storage. */
export async function chooseWorkspace(): Promise<Workspace> {
  return (await hasPhoneStorage()) ? phoneWorkspace() : appWorkspace();
}

/** Copies everything from one workspace into another, skipping paths that already exist. */
export async function copyWorkspace(from: Workspace, to: Workspace): Promise<number> {
  await to.ensureRoot();
  const existing = new Set((await to.list()).map((e) => e.path.toLowerCase()));
  let copied = 0;
  for (const e of await from.list()) {
    if (existing.has(e.path.toLowerCase())) continue;
    if (e.kind === "dir") await to.mkdir(e.path);
    else {
      await to.writeBytes(e.path, await from.readBytes(e.path));
      copied++;
    }
  }
  return copied;
}
