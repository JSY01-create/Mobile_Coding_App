// JavaScript suggestions for the browser's own objects, like VS Code:
//   doc            -> document
//   document.      -> addEventListener, querySelector, getElementById, body...
//   console.       -> log, warn, error...
//   addEventListener("  -> keydown, click, input...
//   event.         -> key, code, target, preventDefault... (for event / e / evt parameters)
//   const slots = document.querySelectorAll(".slot");  slots. -> forEach, length...
// Names and members come from a clean hidden page, so they match the real browser.
import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

type Obj = Record<string, unknown>;

let sandbox: (Window & typeof globalThis) | null = null;

/** A fresh window with only the browser's own globals (not this app's). */
function scope(): (Window & typeof globalThis) | null {
  if (!sandbox) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    document.body.append(frame);
    sandbox = frame.contentWindow as (Window & typeof globalThis) | null;
  }
  return sandbox;
}

/** Members people use most, shown first. */
const COMMON = new Set(
  (
    "document window console setTimeout setInterval clearTimeout clearInterval fetch alert prompt confirm localStorage " +
    "sessionStorage Math JSON Array Object String Number Promise Date parseInt parseFloat requestAnimationFrame " +
    "addEventListener removeEventListener querySelector querySelectorAll getElementById getElementsByClassName " +
    "createElement appendChild append prepend remove replaceChildren classList textContent innerText innerHTML " +
    "style value children parentElement dataset setAttribute getAttribute focus click body head title " +
    "log warn error info table key code target preventDefault stopPropagation type " +
    "length push pop shift unshift map filter forEach find findIndex includes indexOf join slice splice sort reverse some every reduce " +
    "split trim toUpperCase toLowerCase replace replaceAll startsWith endsWith padStart repeat at " +
    "then catch finally json text floor ceil round random max min abs parse stringify getItem setItem keys values entries"
  ).split(" ")
);

/** The globals used all the time; they beat other matches (console before confirm). */
const TOP = new Set(["document", "console", "window", "Math", "JSON"]);

const IDENT = /^[a-zA-Z_$][\w$]*$/;

/** Properties and methods of an object, nearest first. Uses descriptors, so getters are never run. */
function members(target: unknown, top = false): Completion[] {
  if (target === null || target === undefined) return [];
  let obj: object | null = typeof target === "object" || typeof target === "function" ? (target as object) : Object(target);
  const out: Completion[] = [];
  const seen = new Set<string>();
  for (let depth = 0; obj && depth < 8; depth++) {
    const isBase = obj === Object.prototype || obj === Function.prototype;
    for (const name of Object.getOwnPropertyNames(obj)) {
      if (!IDENT.test(name) || seen.has(name) || name === "constructor" && !top) continue;
      seen.add(name);
      const desc = Object.getOwnPropertyDescriptor(obj, name);
      const fn = typeof desc?.value === "function";
      const type = fn ? (/^[A-Z]/.test(name) ? "class" : top ? "function" : "method") : top ? "variable" : "property";
      // Nearer members, common ones and normal names first; Object's own members last.
      const boost = (COMMON.has(name) ? 6 : 0) - depth - (isBase ? 10 : 0) - (/^on/.test(name) ? 2 : 0) - (/^webkit|^moz/i.test(name) ? 4 : 0);
      out.push({ label: name, type, boost, detail: fn ? "()" : undefined });
    }
    obj = Object.getPrototypeOf(obj);
  }
  return out;
}

function protoOf(name: string): object | null {
  const w = scope() as unknown as Obj | null;
  const ctor = w?.[name] as { prototype?: object } | undefined;
  return ctor?.prototype ?? null;
}

/** A stand-in for an event, with the members of keyboard, mouse and pointer events. */
function eventLike(): object | null {
  const w = scope();
  if (!w) return null;
  const merged: Obj = {};
  for (const p of [w.PointerEvent?.prototype, w.KeyboardEvent.prototype, w.MouseEvent.prototype, w.InputEvent?.prototype, w.Event.prototype]) {
    if (!p) continue;
    for (let o: object | null = p; o && o !== w.Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const n of Object.getOwnPropertyNames(o)) {
        if (n in merged) continue;
        const d = Object.getOwnPropertyDescriptor(o, n);
        merged[n] = typeof d?.value === "function" ? d.value : "";
      }
    }
  }
  return merged;
}

/** What a variable holds, guessed from how it was declared. */
function guessVariable(text: string, name: string): unknown {
  const w = scope();
  if (!w) return null;
  const esc = name.replace(/\$/g, "\\$");
  const decl = [...text.matchAll(new RegExp(`\\b(?:const|let|var)\\s+${esc}\\s*=\\s*([^;\\n]+)`, "g"))].pop()?.[1]?.trim();
  if (decl) {
    if (/querySelectorAll\(|getElementsBy\w+\(/.test(decl)) return w.document.querySelectorAll("x");
    if (/querySelector\(|getElementById\(|createElement\(|closest\(|\.(?:firstElementChild|parentElement|body)\b/.test(decl)) return w.document.createElement("div");
    if (/^await\s+fetch\(/.test(decl)) return protoOf("Response");
    if (/^fetch\(/.test(decl) || /^new\s+Promise\b/.test(decl)) return protoOf("Promise");
    if (/^["'`]/.test(decl) || /\.(?:toUpperCase|toLowerCase|trim|join|slice)\(\)?$/.test(decl)) return "";
    if (/^\[/.test(decl) || /\.(?:map|filter|split|slice|sort)\(/.test(decl) || /^Array\.from\(/.test(decl)) return [];
    if (/^-?\d/.test(decl)) return 0;
    if (/^\{/.test(decl)) return {};
    const ctor = decl.match(/^new\s+([A-Z][\w$]*)/);
    if (ctor) return protoOf(ctor[1]);
    if (/^JSON\.parse\(/.test(decl)) return {};
    return null;
  }
  // A function parameter: event, e, evt, ev.
  if (/^(event|e|evt|ev)$/.test(name) && new RegExp(`(?:function\\s*\\w*\\s*\\(\\s*|\\(\\s*|,\\s*)${esc}\\s*[,)]|\\b${esc}\\s*=>`).test(text)) return eventLike();
  if (/^(el|element|elem|node|btn|button|slot|cell|tile)$/i.test(name)) return w.document.createElement("div");
  return null;
}

/** The object before the dot: "document.body." -> document.body. */
function resolve(state: EditorState, pos: number, path: string[], before: string): unknown {
  const w = scope() as unknown as Obj | null;
  if (!w) return null;
  let obj: unknown;
  const [first, ...rest] = path;
  if (first === "") {
    // Something like "abc".  or [1, 2].
    if (/["'`]$/.test(before)) obj = "";
    else if (/]$/.test(before)) obj = [];
    else return null;
  } else if (first === "window" || first === "globalThis" || first === "self") {
    obj = w;
  } else {
    const local = guessVariable(state.sliceDoc(0, pos), first);
    obj = local ?? (first in w ? safeGet(w, first) : null);
  }
  for (const name of rest) {
    if (obj === null || obj === undefined) return null;
    obj = safeGet(obj as Obj, name);
  }
  return obj;
}

function safeGet(obj: Obj, name: string): unknown {
  try {
    const v = obj[name];
    // Members on a prototype are reached through a real instance where possible.
    return v;
  } catch {
    return null;
  }
}

/** What a call gives back, for the calls people chain on most. */
function returnOf(fn: string): unknown {
  const w = scope();
  if (!w) return null;
  if (/^(querySelector|getElementById|createElement|closest|cloneNode)$/.test(fn)) return w.document.createElement("div");
  if (/^(querySelectorAll|getElementsByClassName|getElementsByTagName)$/.test(fn)) return w.document.querySelectorAll("x");
  if (/^(split|map|filter|slice|concat|sort|reverse|flat|keys|values|entries|from|fill)$/.test(fn)) return [];
  if (/^(toUpperCase|toLowerCase|trim|join|toString|repeat|padStart|padEnd|replace|replaceAll|substring|toFixed|stringify)$/.test(fn)) return "";
  if (/^(fetch|json|text|then|catch)$/.test(fn)) return protoOf("Promise");
  if (fn === "getContext") return protoOf("CanvasRenderingContext2D");
  return null;
}

/** The object written before the last dot: a name path, a literal, or a call. */
function targetOf(state: EditorState, pos: number, chain: string): unknown {
  const trimmed = chain.replace(/\s+$/, "");
  const call = trimmed.match(/([\w$]+)\s*\([^()]*\)$/);
  if (call) return returnOf(call[1]);
  const path = trimmed.match(/((?:[\w$]+\s*\.\s*)*[\w$]+)$/);
  if (path) {
    const parts = path[1].split(/\s*\.\s*/);
    if (/^\d/.test(parts[0])) return null;
    return resolve(state, pos, parts, trimmed);
  }
  if (/["'`\]]$/.test(trimmed)) return resolve(state, pos, [""], trimmed);
  return null;
}

const EVENTS =
  "click keydown keyup input change submit load DOMContentLoaded resize scroll focus blur " +
  "mousedown mouseup mousemove mouseenter mouseleave pointerdown pointerup pointermove " +
  "touchstart touchend touchmove dblclick contextmenu wheel animationend transitionend beforeunload";

export const jsGlobalSource: CompletionSource = (ctx) => {
  const node = syntaxTree(ctx.state).resolveInner(ctx.pos, -1);
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = ctx.state.sliceDoc(line.from, ctx.pos);

  // Event names inside addEventListener("...").
  const ev = before.match(/(?:add|remove)EventListener\(\s*["'`](\w*)$/);
  if (ev) {
    return {
      from: ctx.pos - ev[1].length,
      options: EVENTS.split(" ").map((label, i) => ({ label, type: "constant", detail: "event", boost: 20 - i })),
      validFor: /^\w*$/,
    };
  }
  if (/Comment|String|TemplateString/.test(node.name)) return null;

  // Member access: something.partial
  const dot = before.match(/\.\s*([\w$]*)$/);
  if (dot) {
    const partial = dot[1];
    const chain = before.slice(0, before.length - dot[0].length);
    const target = targetOf(ctx.state, ctx.pos, chain);
    if (target === null || target === undefined) return null;
    const options = members(target);
    if (!options.length) return null;
    return { from: ctx.pos - partial.length, options, validFor: /^[\w$]*$/ };
  }

  // A plain name: browser globals (document, console, setTimeout...).
  const word = ctx.matchBefore(/[\w$]+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (/\.\s*$/.test(ctx.state.sliceDoc(line.from, word.from))) return null;
  const w = scope();
  if (!w) return null;
  const options = members(w, true)
    .filter((o) => !/^on/.test(o.label))
    .map((o) => ({ ...o, boost: (o.boost ?? 0) + (COMMON.has(o.label) ? 4 : 0) + (TOP.has(o.label) ? 3 : 0) }));
  return { from: word.from, options, validFor: /^[\w$]*$/ };
};
