import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import { h, icon, icons, kbInput, keepFocus } from "./dom";

const MAX_COUNT = 999;

/** Find & replace bar shown at the top of the editor. */
export function createSearchPanel(view: EditorView): Panel {
  const start = getSearchQuery(view.state);
  let caseSensitive = start.caseSensitive;
  let regexp = start.regexp;

  const find = kbInput(h("input.sp-input", { type: "text", placeholder: "Find", "aria-label": "Find", "main-field": "true" }));
  const replace = kbInput(h("input.sp-input", { type: "text", placeholder: "Replace with", "aria-label": "Replace with" }));
  find.value = start.search;
  replace.value = start.replace;

  const count = h("span.sp-count", { "aria-live": "polite" });
  const btn = (label: string | SVGSVGElement, title: string, run: () => void, cls = "") => {
    const b = keepFocus(h(`button.sp-btn${cls ? "." + cls : ""}` as "button", { type: "button", title, "aria-label": title }, label));
    b.addEventListener("click", run);
    return b;
  };

  const caseBtn = btn("Aa", "Match case", () => {
    caseSensitive = !caseSensitive;
    caseBtn.classList.toggle("on", caseSensitive);
    commit();
  });
  const regexBtn = btn(".*", "Regular expression", () => {
    regexp = !regexp;
    regexBtn.classList.toggle("on", regexp);
    commit();
  });
  caseBtn.classList.toggle("on", caseSensitive);
  regexBtn.classList.toggle("on", regexp);

  function query() {
    return new SearchQuery({ search: find.value, replace: replace.value, caseSensitive, regexp });
  }

  function commit() {
    const q = query();
    if (!q.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(q) });
    updateCount();
  }

  function updateCount() {
    const q = getSearchQuery(view.state);
    find.classList.toggle("bad", !!q.search && !q.valid);
    if (!q.search || !q.valid) {
      count.textContent = "";
      return;
    }
    const sel = view.state.selection.main;
    const cursor = q.getCursor(view.state);
    let total = 0;
    let current = 0;
    for (let r = cursor.next(); !r.done; r = cursor.next()) {
      total++;
      if (r.value.from === sel.from && r.value.to === sel.to) current = total;
      if (total > MAX_COUNT) break;
    }
    count.textContent = total > MAX_COUNT ? `${MAX_COUNT}+` : current ? `${current}/${total}` : String(total);
  }

  find.addEventListener("input", commit);
  replace.addEventListener("input", commit);
  find.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit();
    (e.shiftKey ? findPrevious : findNext)(view);
  });
  replace.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit();
    replaceNext(view);
  });
  for (const input of [find, replace]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearchPanel(view);
        view.focus();
      }
    });
  }

  const dom = h(
    "div.search-panel",
    { role: "search" },
    h(
      "div.sp-row",
      {},
      h("div.sp-field", {}, find, count),
      btn(icon(icons.chevronLeft, { size: 18 }), "Previous match", () => {
        commit();
        findPrevious(view);
      }),
      btn(icon(icons.chevronRight, { size: 18 }), "Next match", () => {
        commit();
        findNext(view);
      }),
      caseBtn,
      regexBtn,
      btn(icon(icons.close, { size: 18 }), "Close find", () => {
        closeSearchPanel(view);
        view.focus();
      })
    ),
    h(
      "div.sp-row",
      {},
      h("div.sp-field", {}, replace),
      btn("Replace", "Replace this match", () => {
        commit();
        replaceNext(view);
      }, "text"),
      btn("All", "Replace all matches", () => {
        commit();
        replaceAll(view);
      }, "text")
    )
  );

  return {
    dom,
    top: true,
    mount() {
      find.focus();
      find.select();
      updateCount();
    },
    update(update: ViewUpdate) {
      const q = getSearchQuery(update.state);
      if (update.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))) {
        if (q.search !== find.value) find.value = q.search;
        if (q.replace !== replace.value) replace.value = q.replace;
      }
      if (update.docChanged || update.selectionSet || update.transactions.length) updateCount();
    },
  };
}
