// Small color squares in CSS (like VS Code). Tapping one opens the color picker.
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { cssOf, parseColor } from "./color";

/** Opens the picker for the text between from and to (empty text = insert a new color). */
type Opener = (view: EditorView, from: number, to: number, text: string) => void;

let opener: Opener = () => {};

export function setColorOpener(fn: Opener): void {
  opener = fn;
}

export function pickColorAt(view: EditorView, from: number, to: number): void {
  opener(view, from, to, view.state.sliceDoc(from, to));
}

const COLOR_FN = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/i;

/** A color written at [from, to): its text, or "" for an empty rgb() waiting for a value. */
function colorAt(state: EditorState, name: string, from: number, to: number): { css: string | null } | null {
  const text = state.sliceDoc(from, to);
  if (name === "ColorLiteral" || name === "ValueName" || name === "CallExpression") {
    if (name === "CallExpression" && !COLOR_FN.test(text)) return null;
    if (name === "CallExpression" && /\(\s*\)$/.test(text)) return { css: null };
    const c = parseColor(text);
    return c ? { css: cssOf(c) } : null;
  }
  return null;
}

class Swatch extends WidgetType {
  constructor(readonly css: string | null, readonly from: number, readonly to: number) {
    super();
  }

  eq(other: Swatch): boolean {
    return other.css === this.css && other.from === this.from && other.to === this.to;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = this.css ? "cm-color-swatch" : "cm-color-swatch cm-color-new";
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", this.css ? "Change color" : "Pick a color");
    if (this.css) el.style.setProperty("--c", this.css);
    el.dataset.from = String(this.from);
    el.dataset.to = String(this.to);
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const found = colorAt(view.state, node.name, node.from, node.to);
        if (!found) return;
        builder.add(node.from, node.from, Decoration.widget({ widget: new Swatch(found.css, node.from, node.to), side: -1 }));
        // Don't look inside rgb(...) again.
        return false;
      },
    });
  }
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) this.decorations = build(u.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(e, view) {
        const el = (e.target as HTMLElement).closest?.(".cm-color-swatch") as HTMLElement | null;
        if (!el) return false;
        e.preventDefault();
        const from = Number(el.dataset.from);
        const to = Number(el.dataset.to);
        if (to <= view.state.doc.length) pickColorAt(view, from, to);
        return true;
      },
    },
  }
);

const theme = EditorView.baseTheme({
  ".cm-color-swatch": {
    position: "relative",
    display: "inline-block",
    width: "0.8em",
    height: "0.8em",
    marginRight: "0.3em",
    verticalAlign: "-0.06em",
    borderRadius: "3px",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.45)",
    cursor: "pointer",
    // The color over a checkerboard, so transparency shows.
    background: "linear-gradient(var(--c), var(--c)), repeating-conic-gradient(#8e8e93 0% 25%, #e5e5ea 0% 50%) 50% / 6px 6px",
  },
  // A bigger area to tap than the square itself.
  ".cm-color-swatch::after": { content: '""', position: "absolute", inset: "-9px -6px" },
  // The "pick a color" dot for an empty rgb(): half the size of a color square.
  ".cm-color-swatch.cm-color-new": {
    width: "0.4em",
    height: "0.4em",
    verticalAlign: "0.14em",
    marginRight: "0.35em",
    background: "conic-gradient(#ff3b30, #ffcc00, #34c759, #32ade6, #5856d6, #ff2d55, #ff3b30)",
    borderRadius: "50%",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.35)",
  },
  // Same easy tap area as the bigger squares.
  ".cm-color-swatch.cm-color-new::after": { inset: "-11px -9px" },
});

/** Color squares for CSS, <style> blocks and style="" attributes. */
export const colorSwatches = [plugin, theme];

/** The color written at the cursor, in CSS or as a hex/rgb()/hsl() anywhere in code. */
export function colorRangeAt(state: EditorState, pos: number): { from: number; to: number } | null {
  for (const side of [-1, 1] as const) {
    for (let n: { name: string; from: number; to: number; parent: unknown } | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent as typeof n) {
      if (colorAt(state, n.name, n.from, n.to)) return { from: n.from, to: n.to };
    }
  }
  const line = state.doc.lineAt(pos);
  for (const m of line.text.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^()]*\)/gi)) {
    const from = line.from + (m.index ?? 0);
    const to = from + m[0].length;
    if (pos >= from && pos <= to && parseColor(m[0])) return { from, to };
  }
  return null;
}
