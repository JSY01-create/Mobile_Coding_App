// Values that fit the CSS property being written: "display: " -> flex, grid, block...
import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import { pickColorAt } from "../color/swatches";
import { syntaxTree } from "@codemirror/language";

const align = "stretch flex-start flex-end center baseline start end self-start self-end";
const distribute = "flex-start flex-end center space-between space-around space-evenly start end stretch";
const overflow = "visible hidden scroll auto clip";
const border = "none solid dashed dotted double groove ridge inset outset";
const timing = "ease linear ease-in ease-out ease-in-out step-start step-end cubic-bezier()";
const size = "auto 100% fit-content max-content min-content 0";

const VALUES: Record<string, string> = {
  display: "block inline inline-block flex inline-flex grid inline-grid none contents flow-root table list-item",
  position: "static relative absolute fixed sticky",
  "flex-direction": "row row-reverse column column-reverse",
  "flex-wrap": "nowrap wrap wrap-reverse",
  "flex-flow": "row column wrap nowrap",
  flex: "1 auto none 0 1 auto",
  "justify-content": distribute,
  "justify-items": "start end center stretch",
  "justify-self": "start end center stretch auto",
  "align-items": align,
  "align-self": `auto ${align}`,
  "align-content": distribute,
  "place-items": "center start end stretch",
  "place-content": "center start end space-between space-around stretch",
  "text-align": "left right center justify start end",
  "vertical-align": "baseline middle top bottom text-top text-bottom sub super",
  "font-weight": "normal bold bolder lighter 100 200 300 400 500 600 700 800 900",
  "font-style": "normal italic oblique",
  "font-family": "system-ui sans-serif serif monospace cursive Arial Helvetica Georgia \"Times New Roman\" \"Courier New\" Verdana",
  "font-size": "12px 14px 16px 1rem 1.25rem 1.5rem 2rem small medium large x-large smaller larger",
  "text-decoration": "none underline overline line-through",
  "text-transform": "none uppercase lowercase capitalize",
  "text-overflow": "clip ellipsis",
  "white-space": "normal nowrap pre pre-wrap pre-line break-spaces",
  "word-break": "normal break-all keep-all break-word",
  "overflow-wrap": "normal break-word anywhere",
  overflow,
  "overflow-x": overflow,
  "overflow-y": overflow,
  visibility: "visible hidden collapse",
  "box-sizing": "border-box content-box",
  float: "left right none",
  clear: "left right both none",
  border: `1px ${border}`,
  "border-style": border,
  "border-top": `1px ${border}`,
  "border-bottom": `1px ${border}`,
  outline: `none 2px ${border}`,
  "border-radius": "4px 8px 12px 50% 999px",
  cursor: "pointer default text move not-allowed grab grabbing crosshair wait help progress zoom-in zoom-out",
  "pointer-events": "auto none",
  "user-select": "auto none text all",
  "object-fit": "fill contain cover none scale-down",
  "object-position": "center top bottom left right",
  "background-size": "auto cover contain",
  "background-repeat": "repeat no-repeat repeat-x repeat-y space round",
  "background-position": "center top bottom left right",
  "background-attachment": "scroll fixed local",
  "background-clip": "border-box padding-box content-box text",
  "list-style": "none disc circle square decimal inside outside",
  "list-style-type": "none disc circle square decimal lower-alpha upper-alpha lower-roman upper-roman",
  transition: "all 0.2s ease, none",
  "transition-timing-function": timing,
  "animation-timing-function": timing,
  "animation-direction": "normal reverse alternate alternate-reverse",
  "animation-fill-mode": "none forwards backwards both",
  "animation-iteration-count": "infinite 1 2",
  "animation-play-state": "running paused",
  resize: "none both horizontal vertical",
  "grid-template-columns": "repeat(3, 1fr) 1fr 1fr auto minmax(0, 1fr) repeat(auto-fill, minmax(200px, 1fr))",
  "grid-template-rows": "auto 1fr repeat(2, 1fr) min-content",
  "grid-auto-flow": "row column dense row dense",
  width: size,
  height: size,
  "max-width": "100% none 960px 1200px 65ch",
  "min-height": "100vh 100dvh 0 auto",
  margin: "0 auto 0 auto 1rem",
  padding: "0 8px 16px 1rem",
  gap: "8px 16px 1rem",
  "z-index": "0 1 10 100 auto -1",
  opacity: "0 0.5 1",
  "aspect-ratio": "1 / 1 16 / 9 4 / 3 auto",
  content: '"" none',
  "scroll-behavior": "auto smooth",
  "touch-action": "auto none manipulation pan-x pan-y",
  "mix-blend-mode": "normal multiply screen overlay darken lighten difference",
  isolation: "auto isolate",
  "will-change": "auto transform opacity",
  appearance: "none auto",
  "color-scheme": "light dark light dark",
  filter: "none blur(4px) grayscale(1) brightness(0.8) drop-shadow()",
  transform: "none translate() scale() rotate() translateX() translateY()",
};

const COLOR_PROPS = /(^|-)(color|background|fill|stroke)$/;
const COLORS = "transparent currentColor white black #000 #fff rgb() hsl() red green blue gray orange purple";
const GLOBAL = "inherit initial unset revert";

export const cssValueSource: CompletionSource = (ctx) => {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = ctx.state.sliceDoc(line.from, ctx.pos);
  const m = before.match(/(?:^|[\s;{"'])(-?[a-z][a-z-]*)\s*:\s*([^;:{}"']*)$/i);
  if (!m) return null;
  // Only inside CSS: a stylesheet, <style>, or a style="" attribute.
  let inCss = false;
  for (let n: { name: string; parent: unknown } | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent as typeof n) {
    if (/^(StyleSheet|Block|Styles|Declaration)$/.test(n.name)) inCss = true;
    if (n.name === "Attribute" && /\bstyle\s*=\s*["'][^"']*$/i.test(before)) inCss = true;
  }
  if (!inCss && !/\bstyle\s*=\s*["'][^"']*$/i.test(before)) return null;
  const prop = m[1].toLowerCase();
  let list = VALUES[prop];
  if (!list && COLOR_PROPS.test(prop)) list = COLORS;
  if (!list) return null;
  const word = m[2].match(/[\w#().-]*$/)?.[0] ?? "";
  const options: Completion[] = [];
  const seen = new Set<string>();
  const add = (label: string, boost: number) => {
    if (seen.has(label)) return;
    seen.add(label);
    const fn = label.endsWith("()");
    options.push({
      label,
      type: "keyword",
      boost,
      // Functions put the cursor between the parentheses.
      apply: fn ? (view, _c, from, to) => {
        view.dispatch({ changes: { from, to, insert: label }, selection: { anchor: from + label.length - 1 } });
      } : undefined,
    });
  };
  // Multi-word values such as "1px solid" or "repeat(3, 1fr)" stay together.
  for (const v of list.match(/repeat\([^)]*\)\)?|minmax\([^)]*\)|"[^"]+"|\d+ \/ \d+|[^\s]+/g) ?? []) add(v, 2);
  for (const v of GLOBAL.split(" ")) add(v, -1);
  if (COLOR_PROPS.test(prop)) {
    options.unshift({
      label: "pick color",
      detail: "opens the color picker",
      type: "color",
      boost: 99,
      apply: (view, _c, from, to) => pickColorAt(view, from, to),
    });
  }
  return { from: ctx.pos - word.length, options, validFor: /^[\w#().-]*$/ };
};
