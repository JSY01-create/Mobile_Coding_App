// class="" suggestions: class names from the project's CSS files and <style> blocks.
import type { Completion, CompletionSource } from "@codemirror/autocomplete";

let cssTexts: () => Promise<string[]> = async () => [];

export function setCssProvider(fn: () => Promise<string[]>): void {
  cssTexts = fn;
}

const CLASS_RE = /\.(-?[_a-zA-Z][\w-]*)/g;

function classesIn(css: string, into: Set<string>): void {
  // Drop comments and strings so "url(a.png)" or "/* .old */" don't count.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, '""');
  for (const block of clean.split("{")) {
    const selector = block.slice(block.lastIndexOf("}") + 1);
    for (const m of selector.matchAll(CLASS_RE)) into.add(m[1]);
  }
}

export const classSource: CompletionSource = async (ctx) => {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = ctx.state.sliceDoc(line.from, ctx.pos);
  const m = before.match(/\bclass(?:Name)?\s*=\s*["']([^"']*)$/);
  if (!m) return null;
  const word = m[1].match(/[\w-]*$/)?.[0] ?? "";
  const names = new Set<string>();
  for (const css of await cssTexts()) classesIn(css, names);
  const doc = ctx.state.doc.toString();
  for (const style of doc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) classesIn(style[1], names);
  if (ctx.aborted || !names.size) return null;
  const used = new Set(m[1].split(/\s+/));
  const options: Completion[] = [...names].filter((n) => !used.has(n) || n === word).map((label) => ({ label, type: "class", detail: "class" }));
  return { from: ctx.pos - word.length, options, validFor: /^[\w-]*$/ };
};
