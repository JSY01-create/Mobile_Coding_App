// Paths inside the workspace look like "src/app.js": no leading slash, "/" between folders.

export function normalizePath(path: string): string {
  return path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** "src/app.test.js" -> ["src/app.test", ".js"]; dotfiles keep their name. */
export function splitExt(path: string): [string, string] {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return [path, ""];
  const cut = path.length - base.length + dot;
  return [path.slice(0, cut), path.slice(cut)];
}

export function joinPath(dir: string, name: string): string {
  return normalizePath(dir ? `${dir}/${name}` : name);
}

/** Every folder above a path: "a/b/c.js" -> ["a", "a/b"]. */
export function ancestors(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

export function isInside(path: string, folder: string): boolean {
  return !folder || path.startsWith(folder + "/");
}

/** Path to `target` as seen from files in `fromDir`, e.g. "../css/site.css". */
export function relativePath(fromDir: string, target: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const to = target.split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return "../".repeat(from.length - i) + to.slice(i).join("/");
}

/** Problem with a typed path, or null when it is fine. */
export function pathProblem(path: string): string | null {
  if (!path) return "Enter a name.";
  if (path.includes("\\")) return "Use / between folders, e.g. src/app.js";
  const parts = path.split("/");
  if (parts.some((s) => s === "." || s === "..")) return "Names can't be . or ..";
  if (parts.some((s) => s.length > 100) || path.length > 240) return "Use a shorter name.";
  return null;
}
