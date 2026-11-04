import {
  acceptCompletion,
  closeCompletion,
  completionStatus,
  deleteBracketPair,
  hasNextSnippetField,
  insertBracket,
  moveCompletionSelection,
  nextSnippetField,
  selectedCompletion,
} from "@codemirror/autocomplete";
import {
  cursorCharLeft,
  cursorCharRight,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  cursorLineDown,
  cursorLineUp,
  deleteCharBackward,
  indentLess,
  indentMore,
  insertNewlineAndIndent,
  redo,
  redoDepth,
  selectAll,
  selectCharLeft,
  selectCharRight,
  selectLine,
  selectLineBoundaryBackward,
  selectLineBoundaryForward,
  selectLineDown,
  selectLineUp,
  toggleComment,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { getIndentUnit } from "@codemirror/language";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expandAtCursor } from "../snippets";
import { readClipboard, writeClipboard } from "./clipboard";

export type Dir = "left" | "right" | "up" | "down";

/** Something the keyboard types into: the code editor or a text field. */
export interface Target {
  insert(text: string): void;
  pair(open: string, close: string): void;
  backspace(): void;
  enter(): void;
  tab(outdent: boolean): void;
  move(dir: Dir, select: boolean): void;
  edge(toEnd: boolean, select: boolean): void;
  undo(): void;
  redo(): void;
  copy(): Promise<boolean>;
  cut(): Promise<boolean>;
  paste(): Promise<void>;
  selectAll(): void;
  selectLine(): void;
  comment(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  hasSelection(): boolean;
}

const CLOSERS = /^[)\]}"'`>]$/;

export class EditorTarget implements Target {
  constructor(
    private getView: () => EditorView,
    private bracketsOn: () => boolean,
    private enterAccepts: () => boolean
  ) {}

  private get view(): EditorView {
    const view = this.getView();
    if (!view.hasFocus) view.focus();
    return view;
  }

  /** Types text the way a key press would, so auto-close, auto-indent and completion all react. */
  insert(text: string): void {
    const view = this.view;
    const { state } = view;
    const { from, to } = state.selection.main;
    const plain = () => state.update(state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.type" });
    for (const handler of state.facet(EditorView.inputHandler)) {
      if (handler(view, from, to, text, plain)) return;
    }
    view.dispatch(plain());
  }

  pair(open: string, close: string): void {
    const view = this.view;
    const { state } = view;
    if (this.bracketsOn()) {
      const tr = insertBracket(state, open);
      if (tr) {
        view.dispatch(tr);
        return;
      }
    }
    view.dispatch(
      state.changeByRange((range) =>
        range.empty
          ? { changes: { from: range.from, insert: open + close }, range: EditorSelection.cursor(range.from + open.length) }
          : {
              changes: [{ from: range.from, insert: open }, { from: range.to, insert: close }],
              range: EditorSelection.range(range.anchor + open.length, range.head + open.length),
            }
      ),
      { scrollIntoView: true, userEvent: "input.type" }
    );
  }

  backspace(): void {
    const view = this.view;
    if (this.bracketsOn() && deleteBracketPair(view)) return;
    deleteCharBackward(view);
  }

  enter(): void {
    const view = this.view;
    const { state } = view;
    if (completionStatus(state) === "active" && this.enterAccepts()) {
      // Accept, unless it is a plain word identical to what is already typed (then Enter is a new line).
      const picked = selectedCompletion(state);
      const pos = state.selection.main.head;
      const typed = state.sliceDoc(state.doc.lineAt(pos).from, pos).match(/[\w$]*$/)?.[0] ?? "";
      const changesNothing = picked && !picked.apply && picked.label === typed;
      if (picked && !changesNothing && acceptCompletion(view)) return;
    }
    if (completionStatus(view.state)) closeCompletion(view);
    insertNewlineAndIndent(view);
  }

  tab(outdent: boolean): void {
    const view = this.view;
    if (outdent) {
      indentLess(view);
      return;
    }
    const { state } = view;
    if (completionStatus(state) === "active" && acceptCompletion(view)) return;
    if (hasNextSnippetField(state)) {
      // Filling in a shortcut's blanks: expand a shortcut typed here, else go to the next blank.
      if (expandAtCursor(view, false) || nextSnippetField(view)) return;
    } else if (expandAtCursor(view)) {
      return;
    }
    if (state.selection.ranges.some((r) => !r.empty)) {
      indentMore(view);
      return;
    }
    // Jump over a closing bracket or quote right after the cursor.
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const next = state.sliceDoc(pos, pos + 1);
    if (state.selection.ranges.length === 1 && CLOSERS.test(next) && /\S/.test(state.sliceDoc(line.from, pos))) {
      view.dispatch({ selection: { anchor: pos + 1 }, scrollIntoView: true, userEvent: "select" });
      return;
    }
    // Insert spaces up to the next tab stop.
    const unit = getIndentUnit(state);
    view.dispatch(
      state.changeByRange((range) => {
        const l = state.doc.lineAt(range.head);
        const col = range.head - l.from;
        const spaces = " ".repeat(unit - (col % unit) || unit);
        return { changes: { from: range.head, insert: spaces }, range: EditorSelection.cursor(range.head + spaces.length) };
      }),
      { scrollIntoView: true, userEvent: "input.type" }
    );
  }

  move(dir: Dir, select: boolean): void {
    const view = this.view;
    if ((dir === "up" || dir === "down") && !select && completionStatus(view.state) === "active") {
      moveCompletionSelection(dir === "down")(view);
      return;
    }
    const commands = {
      left: [cursorCharLeft, selectCharLeft],
      right: [cursorCharRight, selectCharRight],
      up: [cursorLineUp, selectLineUp],
      down: [cursorLineDown, selectLineDown],
    } as const;
    commands[dir][select ? 1 : 0](view);
  }

  edge(toEnd: boolean, select: boolean): void {
    const view = this.view;
    const run = toEnd
      ? select ? selectLineBoundaryForward : cursorLineBoundaryForward
      : select ? selectLineBoundaryBackward : cursorLineBoundaryBackward;
    run(view);
  }

  undo(): void {
    undo(this.view);
  }

  redo(): void {
    redo(this.view);
  }

  private selectedText(): string {
    const { state } = this.getView();
    return state.selection.ranges
      .filter((r) => !r.empty)
      .map((r) => state.sliceDoc(r.from, r.to))
      .join(state.lineBreak);
  }

  async copy(): Promise<boolean> {
    const text = this.selectedText();
    if (!text) return false;
    await writeClipboard(text);
    return true;
  }

  async cut(): Promise<boolean> {
    const text = this.selectedText();
    if (!text) return false;
    const view = this.view;
    view.dispatch(view.state.replaceSelection(""), { scrollIntoView: true, userEvent: "delete.cut" });
    await writeClipboard(text);
    return true;
  }

  async paste(): Promise<void> {
    const text = await readClipboard();
    if (!text) return;
    const view = this.view;
    view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.paste" });
  }

  selectAll(): void {
    selectAll(this.view);
  }

  selectLine(): void {
    selectLine(this.view);
  }

  comment(): void {
    toggleComment(this.view);
  }

  canUndo(): boolean {
    return undoDepth(this.getView().state) > 0;
  }

  canRedo(): boolean {
    return redoDepth(this.getView().state) > 0;
  }

  hasSelection(): boolean {
    return this.getView().state.selection.ranges.some((r) => !r.empty);
  }
}

/** Typing into a plain text field (file names, find & replace, filters). */
export class InputTarget implements Target {
  constructor(private el: HTMLInputElement) {}

  private range(): [number, number] {
    const s = this.el.selectionStart ?? this.el.value.length;
    const e = this.el.selectionEnd ?? s;
    return [s, e];
  }

  private changed(): void {
    this.el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  insert(text: string): void {
    const [s, e] = this.range();
    this.el.setRangeText(text, s, e, "end");
    this.changed();
  }

  pair(open: string, close: string): void {
    const [s, e] = this.range();
    const inner = this.el.value.slice(s, e);
    this.el.setRangeText(open + inner + close, s, e, "end");
    const caret = s + open.length + inner.length;
    this.el.setSelectionRange(inner ? s + open.length : caret, caret);
    this.changed();
  }

  backspace(): void {
    const [s, e] = this.range();
    if (s !== e) this.el.setRangeText("", s, e, "end");
    else if (s > 0) this.el.setRangeText("", s - 1, s, "end");
    else return;
    this.changed();
  }

  enter(): void {
    this.el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  }

  tab(): void {}

  move(dir: Dir, select: boolean): void {
    if (dir === "up" || dir === "down") {
      this.edge(dir === "down", select);
      return;
    }
    const [s, e] = this.range();
    const len = this.el.value.length;
    const backward = this.el.selectionDirection === "backward";
    let anchor = backward ? e : s;
    let head = backward ? s : e;
    if (select) {
      head = Math.max(0, Math.min(len, head + (dir === "left" ? -1 : 1)));
    } else if (s !== e) {
      anchor = head = dir === "left" ? s : e;
    } else {
      anchor = head = Math.max(0, Math.min(len, head + (dir === "left" ? -1 : 1)));
    }
    this.setSel(anchor, head);
  }

  edge(toEnd: boolean, select: boolean): void {
    const [s, e] = this.range();
    const head = toEnd ? this.el.value.length : 0;
    const backward = this.el.selectionDirection === "backward";
    this.setSel(select ? (backward ? e : s) : head, head);
  }

  private setSel(anchor: number, head: number): void {
    if (head < anchor) this.el.setSelectionRange(head, anchor, "backward");
    else this.el.setSelectionRange(anchor, head, "forward");
  }

  undo(): void {}
  redo(): void {}

  async copy(): Promise<boolean> {
    const [s, e] = this.range();
    if (s === e) return false;
    await writeClipboard(this.el.value.slice(s, e));
    return true;
  }

  async cut(): Promise<boolean> {
    const [s, e] = this.range();
    if (s === e) return false;
    const text = this.el.value.slice(s, e);
    this.el.setRangeText("", s, e, "end");
    this.changed();
    await writeClipboard(text);
    return true;
  }

  async paste(): Promise<void> {
    const text = (await readClipboard()).replace(/\r?\n/g, " ");
    if (text) this.insert(text);
  }

  selectAll(): void {
    this.el.select();
  }

  selectLine(): void {
    this.el.select();
  }

  comment(): void {}

  canUndo(): boolean {
    return false;
  }

  canRedo(): boolean {
    return false;
  }

  hasSelection(): boolean {
    const [s, e] = this.range();
    return s !== e;
  }
}
