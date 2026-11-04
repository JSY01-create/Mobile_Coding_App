import { snippet, snippetCompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { Facet, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { contextForLanguage, snippetsByContext, type Context, type SnippetDef } from "./library";
import { classSource } from "./classes";
import { cssValueSource } from "./cssValues";
import { jsGlobalSource } from "./jsGlobals";
import { pathSource } from "./paths";

export { afterCompletion } from "./after";
export { setCssProvider } from "./classes";
export { setWorkspace } from "./paths";

type EmmetModule = typeof import("emmet");

/** The language name of the open file (e.g. "HTML"), set together with its syntax highlighting. */
export const fileLanguage = Facet.define<string, string>({ combine: (values) => values[0] ?? "" });

const MARKUP: Partial<Record<Context, string>> = { html: "html", xml: "xml", php: "html" };
const STYLESHEET: Partial<Record<Context, string>> = { css: "css", scss: "scss", less: "less", sass: "sass", stylus: "stylus" };

function innermostTop(state: EditorState, pos: number): string {
  for (let n: { type: { isTop: boolean; name: string }; parent: unknown } | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent as typeof n) {
    if (n.type.isTop) return n.type.name;
  }
  return "";
}

/** Which shortcut set applies at a position; HTML files switch to CSS or JS inside <style> and <script>. */
export function contextAt(state: EditorState, pos: number): Context | null {
  const base = contextForLanguage[state.facet(fileLanguage)];
  if (!base) return null;
  if (base === "html" || base === "php") {
    const top = innermostTop(state, pos);
    if (top === "StyleSheet") return "css";
    if (top === "Script") return "js";
    if (base === "php") return top === "Template" ? "php" : "html";
  }
  return base;
}

// ---- Emmet ----------------------------------------------------------------

let emmet: EmmetModule | null = null;
let emmetLoading: Promise<EmmetModule> | null = null;
let knownMarkup: Set<string> | null = null;

export function loadEmmet(): Promise<EmmetModule> {
  emmetLoading ??= import("emmet").then((m) => {
    emmet = m;
    return m;
  });
  return emmetLoading;
}

const HTML_TAGS =
  "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr svg";

function isKnownMarkup(name: string): boolean {
  if (!knownMarkup && emmet) {
    const snippets = emmet.resolveConfig({ type: "markup", syntax: "html" }).snippets;
    knownMarkup = new Set([...HTML_TAGS.split(" "), ...Object.keys(snippets)]);
  }
  return !!knownMarkup?.has(name) || /^(lorem|lipsum)\d*$/.test(name);
}

const NOT_IN_MARKUP =
  /^(OpenTag|CloseTag|SelfClosingTag|MismatchedCloseTag|IncompleteCloseTag|TagName|Attribute|AttributeName|AttributeValue|UnquotedAttributeValue|Comment|ProcessingInst|DoctypeDecl|Cdata)$/;

const OPEN = "\u0001";
const CLOSE = "\u0002";

interface Expansion {
  from: number;
  to: number;
  abbreviation: string;
  template: string;
  preview: string;
}

function emmetConfig(type: "markup" | "stylesheet", syntax: string) {
  return {
    type,
    syntax,
    options: {
      "output.field": (index: number, placeholder: string) => {
        // The viewport values in "!" are rarely changed; leave them as text.
        if (placeholder === "device-width" || placeholder === "1.0") return placeholder;
        return `${OPEN}${index}:${placeholder.replace(/[{}\u0001\u0002]/g, "")}${CLOSE}`;
      },
      "output.indent": "\t",
    },
  };
}

/** Converts Emmet output into a CodeMirror snippet template, with a final stop at the end. */
function toTemplate(out: string): string {
  const t = out
    .replace(/[{}]/g, (b) => "\\" + b)
    .replace(/\u0001(\d+):([^\u0002]*)\u0002/g, (_m, i: string, p: string) => "${" + i + (p ? ":" + p : "") + "}");
  return /\$\{0[:}]/.test(t) ? t : t + "${0}";
}

/** Adds an empty last stop so tab after the last blank moves past the inserted code. */
function withEnd(template: string): string {
  return template.endsWith("${}") ? template : template + "${}";
}

function toPreview(out: string): string {
  return out.replace(/\u0001\d+:([^\u0002]*)\u0002/g, "$1").replace(/\t/g, "  ");
}

/**
 * The Emmet abbreviation right before the cursor, expanded.
 * `explicit` (tab key) expands any valid abbreviation; while typing only likely ones are offered.
 */
function emmetAt(state: EditorState, pos: number, ctx: Context, explicit: boolean): Expansion | null {
  if (!emmet) return null;
  const markup = MARKUP[ctx];
  const sheet = STYLESHEET[ctx];
  if (!markup && !sheet) return null;
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  if (!before.trim()) return null;

  const node = syntaxTree(state).resolveInner(pos, -1);
  const ancestors: string[] = [];
  for (let n: typeof node | null = node; n; n = n.parent) ancestors.push(n.name);

  if (markup) {
    // Only in text content: not inside a tag, attribute or comment.
    if (ancestors.some((a) => NOT_IN_MARKUP.test(a))) return null;
  } else {
    // CSS: only where a declaration starts, inside { }. Stylus has no syntax tree to check.
    if (ctx !== "stylus" && !ancestors.includes("Block")) return null;
    if (ancestors.some((a) => /Comment|String/.test(a))) return null;
  }

  let extracted: ReturnType<EmmetModule["extract"]>;
  try {
    extracted = emmet.extract(before, before.length, { type: markup ? "markup" : "stylesheet", lookAhead: false });
  } catch {
    return null;
  }
  if (!extracted?.abbreviation) return null;
  const abbr = extracted.abbreviation;

  if (sheet) {
    const declStart = Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"), before.lastIndexOf("}")) + 1;
    if (before.slice(declStart).trim() !== abbr) return null;
    if (!/^[a-z@-]/i.test(abbr)) return null;
    // Typing a real property name ("font-fa" for font-family): leave it to the property suggestions,
    // instead of Emmet guessing "font: fa;".
    if (startsCssProperty(abbr)) return null;
  } else if (!explicit) {
    const first = abbr.match(/^[a-zA-Z][\w-]*(?::[\w-]+)*/)?.[0];
    if (first ? !isKnownMarkup(first) : !/^[.#!([]/.test(abbr)) return null;
  }

  let out: string;
  try {
    out = emmet.default(abbr, emmetConfig(markup ? "markup" : "stylesheet", markup ?? sheet!));
  } catch {
    return null;
  }
  if (!out || out === abbr) return null;
  // Emmet's answer for an unknown CSS property: "xyz: ;". Not useful.
  if (sheet && new RegExp(`^${abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: \\u0001\\d+:\\u0002;$`).test(out)) return null;

  return {
    from: line.from + extracted.start,
    to: pos,
    abbreviation: abbr,
    template: toTemplate(out),
    preview: toPreview(out),
  };
}

let cssProperties: string[] | null = null;

/** True when some CSS property name starts with `text` (e.g. "font-fa", "pos", "color"). */
function startsCssProperty(text: string): boolean {
  if (!cssProperties) {
    const names = new Set<string>();
    const style = document.documentElement.style as unknown as Record<string, unknown>;
    for (const key in style) {
      if (typeof style[key] !== "string" || !/^[a-z]/i.test(key)) continue;
      names.add(key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/^webkit-/, ""));
    }
    cssProperties = [...names];
  }
  const t = text.toLowerCase();
  return cssProperties.some((p) => p.startsWith(t));
}

/** What the suggestion shows: the result of the abbreviation, so it never just repeats what was typed. */
function emmetLabel(abbr: string, preview: string): string {
  if (abbr === "!" || abbr === "html:5" || abbr === "doc") return "HTML page (<!DOCTYPE html>\u2026)";
  const flat = preview.replace(/\n\s*/g, "");
  return flat.length > 40 ? flat.slice(0, 39) + "\u2026" : flat;
}

const emmetSource: CompletionSource = async (ctx: CompletionContext): Promise<CompletionResult | null> => {
  const context = contextAt(ctx.state, ctx.pos);
  if (!context || (!MARKUP[context] && !STYLESHEET[context])) return null;
  if (!emmet) await loadEmmet();
  if (ctx.aborted) return null;
  const exp = emmetAt(ctx.state, ctx.pos, context, ctx.explicit);
  if (!exp) return null;
  const multiline = exp.preview.includes("\n");
  const option: Completion = {
    label: emmetLabel(exp.abbreviation, exp.preview),
    detail: "Emmet",
    type: "emmet",
    boost: 99,
    // Longer results get a full preview next to the list.
    info: multiline
      ? () => {
          const pre = document.createElement("pre");
          pre.className = "cm-emmet-preview";
          pre.textContent = exp.preview;
          return pre;
        }
      : undefined,
    apply: snippet(exp.template),
  };
  return { from: exp.from, to: exp.to, options: [option], filter: false };
};

// ---- Language shortcuts ----------------------------------------------------

const completionCache = new Map<Context, Completion[]>();

function completionsFor(context: Context): Completion[] {
  let list = completionCache.get(context);
  if (!list) {
    list = snippetsByContext[context].map((s) =>
      snippetCompletion(withEnd(s.template), { label: s.label, detail: s.detail, type: "snippet", boost: -1 })
    );
    completionCache.set(context, list);
  }
  return list;
}

const shortcutSource: CompletionSource = (ctx) => {
  const context = contextAt(ctx.state, ctx.pos);
  if (!context) return null;
  const options = completionsFor(context);
  if (!options.length) return null;
  const word = ctx.matchBefore(/[A-Za-z_][\w]*/);
  if (!word && !ctx.explicit) return null;
  // After a dot (console.l, slots.fo) only members make sense, not shortcuts.
  if (/\.\s*$/.test(ctx.state.sliceDoc(Math.max(0, (word?.from ?? ctx.pos) - 20), word?.from ?? ctx.pos))) return null;
  // Don't offer shortcuts in comments or strings.
  const name = syntaxTree(ctx.state).resolveInner(ctx.pos, -1).name;
  if (/Comment|String/.test(name)) return null;
  return { from: word?.from ?? ctx.pos, options, validFor: /^\w*$/ };
};

/** Browser objects in JavaScript (also inside HTML <script>). */
const browserSource: CompletionSource = (ctx) => {
  const context = contextAt(ctx.state, ctx.pos);
  return context === "js" || context === "jsx" || context === "ts" || context === "tsx" ? jsGlobalSource(ctx) : null;
};

export const shortcutSources: CompletionSource[] = [emmetSource, shortcutSource, pathSource, classSource, cssValueSource, browserSource];

/**
 * Tab key: expand a shortcut (or, with `emmetToo`, an Emmet abbreviation) right before the cursor.
 */
export function expandAtCursor(view: EditorView, emmetToo = true): boolean {
  const { state } = view;
  const sel = state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return false;
  const pos = sel.main.head;
  const context = contextAt(state, pos);
  if (!context) return false;

  const line = state.doc.lineAt(pos);
  const word = state.sliceDoc(line.from, pos).match(/[A-Za-z_]\w*$/)?.[0];
  if (word) {
    const def: SnippetDef | undefined = snippetsByContext[context].find((s) => s.label === word);
    if (def) {
      snippet(withEnd(def.template))(view, null, pos - word.length, pos);
      return true;
    }
  }
  if (!emmetToo) return false;
  const exp = emmetAt(state, pos, context, true);
  if (exp) {
    snippet(exp.template)(view, null, exp.from, exp.to);
    return true;
  }
  return false;
}

/** Starts loading Emmet when a file that uses it is opened, so tab expansion is ready. */
export function prepareFor(languageName: string): void {
  const ctx = contextForLanguage[languageName];
  if (ctx && (MARKUP[ctx] || STYLESHEET[ctx])) void loadEmmet();
}
