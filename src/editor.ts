import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeAnyWord,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension, type StateEffect } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  scrollPastEnd,
  tooltips,
  type ViewUpdate,
} from "@codemirror/view";
import type { Settings } from "./settings";
import { afterCompletion, fileLanguage, shortcutSources } from "./snippets";
import { editorTheme, highlightStyle } from "./theme";
import { createSearchPanel } from "./ui/search";

/** Parts of the editor setup that change with settings or the file's language. */
export const parts = {
  language: new Compartment(),
  font: new Compartment(),
  wrap: new Compartment(),
  tabs: new Compartment(),
  brackets: new Compartment(),
  complete: new Compartment(),
  input: new Compartment(),
};

const NO_WORDS = new Set(["", "Markdown"]);

/** Word completion from the document, for code languages that have no completion of their own. */
const wordFallback: CompletionSource = (ctx) => {
  if (NO_WORDS.has(ctx.state.facet(fileLanguage))) return null;
  const mine = new Set<unknown>([wordFallback, ...shortcutSources]);
  const own = ctx.state.languageDataAt<unknown>("autocomplete", ctx.pos).filter((s) => !mine.has(s));
  return own.length ? null : completeAnyWord(ctx);
};

function settingParts(s: Settings): Record<Exclude<keyof typeof parts, "language">, Extension> {
  return {
    font: EditorView.theme({ "&": { fontSize: `${s.fontSize}px` } }),
    wrap: s.wrap ? EditorView.lineWrapping : [],
    tabs: [EditorState.tabSize.of(s.tabSize), indentUnit.of(" ".repeat(s.tabSize))],
    brackets: s.closeBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [],
    complete: s.autocomplete
      ? autocompletion({ activateOnTyping: true, maxRenderedOptions: 40, closeOnBlur: true, icons: false })
      : [],
    // inputmode=none keeps the phone's own keyboard closed so the custom one is used.
    input: EditorView.contentAttributes.of(s.keyboard === "custom" ? { inputmode: "none" } : { inputmode: "text" }),
  };
}

/** Effects that bring a state's settings up to date (used when switching files). */
export function settingEffects(s: Settings): StateEffect<unknown>[] {
  const p = settingParts(s);
  return (Object.keys(p) as (keyof typeof p)[]).map((k) => parts[k].reconfigure(p[k]));
}

export interface EditorHooks {
  onUpdate(update: ViewUpdate): void;
  tooltipSpace(view: EditorView): { top: number; left: number; bottom: number; right: number };
}

export function createState(doc: string, s: Settings, language: Extension, hooks: EditorHooks): EditorState {
  const p = settingParts(s);
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter({ openText: "▾", closedText: "▸" }),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(highlightStyle),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true, createPanel: createSearchPanel }),
      scrollPastEnd(),
      tooltips({ tooltipSpace: hooks.tooltipSpace }),
      EditorState.languageData.of(() => [{ autocomplete: wordFallback }, ...shortcutSources.map((autocomplete) => ({ autocomplete }))]),
      // Hardware keyboards still work.
      keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
      editorTheme,
      EditorView.contentAttributes.of({ autocapitalize: "off", autocorrect: "off", spellcheck: "false" }),
      parts.language.of(language),
      parts.font.of(p.font),
      parts.wrap.of(p.wrap),
      parts.tabs.of(p.tabs),
      parts.brackets.of(p.brackets),
      parts.complete.of(p.complete),
      parts.input.of(p.input),
      afterCompletion,
      EditorView.updateListener.of(hooks.onUpdate),
    ],
  });
}
