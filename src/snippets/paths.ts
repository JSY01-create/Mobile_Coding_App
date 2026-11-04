// Suggests workspace files inside path strings: href="", src="", import "./", url(), ](...) and more.
import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import { dirname, relativePath } from "../paths";

export interface Workspace {
  /** Every file path, e.g. "website/css/site.css". */
  files(): string[];
  /** Path of the open file. */
  current(): string;
}

let workspace: Workspace | null = null;

export function setWorkspace(w: Workspace): void {
  workspace = w;
}

/** Text before the cursor that starts a path, and whether it is a JS-style import (needs "./"). */
const CONTEXTS: { re: RegExp; module?: boolean }[] = [
  { re: /\b(?:src|href|action|poster|data-src)\s*=\s*["']([^"'\s]*)$/i },
  { re: /\burl\(\s*["']?([^"')\s]*)$/i },
  { re: /@import\s+["']([^"'\s]*)$/ },
  { re: /\b(?:from|import)\s+["']([^"'\s]*)$/, module: true },
  { re: /\b(?:require|import)\(\s*["']([^"'\s]*)$/, module: true },
  { re: /\]\(([^)\s]*)$/ },
  { re: /\bopen\(\s*["']([^"'\s]*)$/ },
];

export const pathSource: CompletionSource = (ctx) => {
  if (!workspace) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = ctx.state.sliceDoc(line.from, ctx.pos);
  let typed: string | null = null;
  let module = false;
  for (const c of CONTEXTS) {
    const m = before.match(c.re);
    if (m) {
      typed = m[1];
      module = !!c.module;
      break;
    }
  }
  if (typed === null || /^(?:[a-z]+:|#|\/\/)/i.test(typed)) return null;
  // Bare package names ("react") are not files.
  if (module && typed && !typed.startsWith(".")) return null;

  const current = workspace.current();
  const fromDir = dirname(current);
  // Files that fit the tag come first: stylesheets for <link>, scripts for <script>, pages for <a>.
  const want = /<link\b/i.test(before) ? /\.css$/i : /<script\b/i.test(before) ? /\.[mc]?[jt]sx?$/i : /<a\b/i.test(before) ? /\.html?$/i : null;
  const options: Completion[] = [];
  for (const path of workspace.files()) {
    if (path === current) continue;
    let rel = relativePath(fromDir, path);
    if (module && !rel.startsWith(".")) rel = "./" + rel;
    // Nearby files first: each "../" or extra folder level ranks lower.
    const up = (rel.match(/\.\.\//g) ?? []).length;
    const down = rel.replace(/^(\.\.?\/)+/, "").split("/").length - 1;
    const boost = (want?.test(path) ? 20 : 0) - up * 3 - down;
    options.push({ label: rel, type: "file", detail: "file", boost });
  }
  if (!options.length) return null;
  // Replace the whole path under the cursor, e.g. "style.css" after an Emmet expansion.
  const after = ctx.state.sliceDoc(ctx.pos, line.to).match(/^[\w.\-/]*/)?.[0] ?? "";
  return { from: ctx.pos - typed.length, to: ctx.pos + after.length, options, validFor: /^[\w.\-/]*$/ };
};
