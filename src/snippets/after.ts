// What happens right after a suggestion is picked, like in VS Code:
//   HTML attribute  src   -> src="|"   and the suggestions open again (files, values)
//   CSS property    color -> color: |; and the value suggestions open
import { pickedCompletion, startCompletion } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

/** Attributes that are on or off and take no value. */
const BOOLEAN_ATTRS = new Set(
  "allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected".split(" ")
);

export const afterCompletion = EditorView.updateListener.of((update) => {
  for (const tr of update.transactions) {
    const picked = tr.annotation(pickedCompletion);
    if (!picked || picked.type !== "property") continue;
    const view = update.view;
    const { state } = update;
    const pos = state.selection.main.head;
    if (state.selection.ranges.length > 1) return;
    const next = state.sliceDoc(pos, pos + 1);

    // CSS: lang-css inserts "name: ". Add the closing ";" and show values.
    if (typeof picked.apply === "string" && picked.apply.endsWith(": ")) {
      const rest = state.sliceDoc(pos, state.doc.lineAt(pos).to);
      const needSemi = !/^\s*[;"']/.test(rest);
      // Dispatched as typing, so the list opens with values (not property names).
      queueMicrotask(() => {
        view.dispatch({
          changes: needSemi ? { from: pos, insert: ";" } : undefined,
          selection: { anchor: pos },
          userEvent: "input.type",
        });
      });
      return;
    }

    // HTML: an attribute name was picked.
    const node = syntaxTree(state).resolveInner(pos, -1);
    if (node.name !== "AttributeName") return;
    if (BOOLEAN_ATTRS.has(picked.label.toLowerCase()) || next === "=") return;
    queueMicrotask(() => {
      view.dispatch({ changes: { from: pos, insert: '=""' }, selection: { anchor: pos + 2 }, userEvent: "input.complete" });
      startCompletion(view);
    });
    return;
  }
});
