// The key layout. Rows follow the reference design:
//   ! % * - [] + " < > / {}
//   1 2 3 4 5 6 7 8 9 0 =
//   q w e r t y u i o p
//   a s d f g h j k l ()
//   shift z x c v b n m backspace
//   tab _ : space , . enter
//   undo redo # copy paste
// Every symbol key has a shift symbol (shown small in the corner) and a
// long-press menu with more options.

export type Cmd =
  | "shift" | "backspace" | "tab" | "outdent" | "enter"
  | "undo" | "redo" | "copy" | "cut" | "paste" | "selectAll" | "selectLine"
  | "left" | "right" | "up" | "down" | "home" | "end"
  | "comment" | "search" | "hide";

export type Action =
  | { kind: "text"; text: string }
  | { kind: "pair"; open: string; close: string }
  | { kind: "cmd"; cmd: Cmd };

export interface Alt {
  label: string;
  action: Action;
}

export type Tone = "sym" | "num" | "letter" | "mod" | "acc";

export interface KeyDef {
  id: string;
  label: string;
  /** Name of an icon drawn instead of the label. */
  icon?: IconName;
  action: Action;
  /** What the key types while shift is on. Letters become uppercase on their own. */
  shift?: Alt;
  /** Long-press menu. */
  alts?: Alt[];
  /** Width in grid columns. */
  span: number;
  tone: Tone;
  /** Fires on press and repeats while held. */
  repeat?: boolean;
  /** Shows an enlarged preview above the finger. */
  balloon?: boolean;
  letter?: boolean;
  word?: boolean;
}

export interface RowDef {
  cols: number;
  keys: KeyDef[];
  className?: string;
}

export type IconName =
  | "shift" | "shiftOn" | "capsLock" | "backspace" | "tab" | "enter"
  | "left" | "right" | "up" | "down" | "home" | "end" | "search" | "hide" | "comment";

const text = (s: string): Action => ({ kind: "text", text: s });
const cmd = (c: Cmd): Action => ({ kind: "cmd", cmd: c });
const alt = (label: string, action: Action = text(label)): Alt => ({ label, action });

let n = 0;
const uid = (base: string) => `${base}-${n++}`;

function sym(label: string, o: { shift?: string; alts?: string[]; tone?: Tone; span?: number } = {}): KeyDef {
  return {
    id: uid("sym"),
    label,
    action: text(label),
    shift: o.shift ? alt(o.shift) : undefined,
    alts: o.alts?.map((a) => alt(a)),
    span: o.span ?? 1,
    tone: o.tone ?? "sym",
    balloon: true,
  };
}

function pair(open: string, close: string, o: { span?: number; tone?: Tone } = {}): KeyDef {
  return {
    id: uid("pair"),
    label: open + close,
    action: { kind: "pair", open, close },
    shift: alt(close),
    alts: [alt(open), alt(close)],
    span: o.span ?? 1,
    tone: o.tone ?? "sym",
    balloon: true,
  };
}

function letter(ch: string, accents = ""): KeyDef {
  return {
    id: `key-${ch}`,
    label: ch,
    action: text(ch),
    // Long-press: the capital letter, then accented letters.
    alts: [alt(ch.toUpperCase()), ...[...accents].map((a) => alt(a))],
    span: 2,
    tone: "letter",
    balloon: true,
    letter: true,
  };
}

const digitAlts: Record<string, string> = { "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")" };

function digit(d: string): KeyDef {
  return { id: `key-${d}`, label: d, action: text(d), alts: [alt(digitAlts[d])], span: 1, tone: "num", balloon: true };
}

function action(id: string, label: string, c: Cmd, o: Partial<KeyDef> = {}): KeyDef {
  return { id, label, action: cmd(c), span: 2, tone: "mod", ...o };
}

export type LetterLayout = "qwerty" | "qwertz" | "azerty" | "colemak";

export const letterLayouts: { id: LetterLayout; label: string }[] = [
  { id: "qwerty", label: "QWERTY" },
  { id: "qwertz", label: "QWERTZ" },
  { id: "azerty", label: "AZERTY" },
  { id: "colemak", label: "Colemak" },
];

/** Accented letters on long-press, most used first. */
const ACCENTS: Record<string, string> = {
  a: "äàáâãåæ", c: "çćč", e: "éèêëē", i: "íìîï", n: "ñń", o: "öóòôõøœ", s: "ßšś", u: "üúùû", y: "ýÿ", z: "žźż", l: "ł", g: "ğ",
};
/** French keyboards put these first. */
const ACCENTS_FR: Record<string, string> = {
  a: "àâäæáã", c: "çćč", e: "éèêëē", i: "îïíì", o: "ôöœóò", u: "ùûüú", y: "ÿý",
};

/** The three letter rows (20 columns each). The ( ) key goes wherever a row has room. */
function letterRows(layout: LetterLayout): RowDef[] {
  const accents = layout === "azerty" ? { ...ACCENTS, ...ACCENTS_FR } : ACCENTS;
  const letters = (row: string) => row.split("").map((ch) => letter(ch, accents[ch]));
  const parens = () => pair("(", ")", { span: 2 });
  const shiftKey = () => action("shift", "shift", "shift", { icon: "shift", span: 3 });
  const backspaceKey = () => action("backspace", "delete", "backspace", { icon: "backspace", span: 3, repeat: true });
  switch (layout) {
    case "qwertz":
      return [
        { cols: 20, keys: letters("qwertzuiop") },
        { cols: 20, keys: [...letters("asdfghjkl"), parens()] },
        { cols: 20, keys: [shiftKey(), ...letters("yxcvbnm"), backspaceKey()] },
      ];
    case "azerty":
      return [
        { cols: 20, keys: letters("azertyuiop") },
        { cols: 20, keys: letters("qsdfghjklm") },
        { cols: 20, keys: [shiftKey(), ...letters("wxcvbn"), parens(), backspaceKey()] },
      ];
    case "colemak":
      return [
        { cols: 20, keys: [...letters("qwfpgjluy"), parens()] },
        { cols: 20, keys: letters("arstdhneio") },
        { cols: 20, keys: [shiftKey(), ...letters("zxcvbkm"), backspaceKey()] },
      ];
    default:
      return [
        { cols: 20, keys: letters("qwertyuiop") },
        { cols: 20, keys: [...letters("asdfghjkl"), parens()] },
        { cols: 20, keys: [shiftKey(), ...letters("zxcvbnm"), backspaceKey()] },
      ];
  }
}

/** All key rows for a letter layout; the symbol, number and bottom rows are the same for every layout. */
export function keyboardRowsFor(layout: LetterLayout): RowDef[] {
  const [top, numbers, ...rest] = baseRows();
  return [top, numbers, ...letterRows(layout), ...rest];
}

const baseRows = (): RowDef[] => [
  {
    cols: 11,
    keys: [
      sym("!", { shift: "?", alts: ["?", "!=", "!=="] }),
      sym("%", { shift: "&", alts: ["&", "&&", "%="] }),
      sym("*", { shift: "^", alts: ["^", "**", "*="] }),
      sym("-", { shift: "~", alts: ["~", "->", "--", "-="] }),
      pair("[", "]"),
      sym("+", { shift: "|", alts: ["|", "||", "++", "+="] }),
      sym('"', { shift: "'", alts: ["'", "`"] }),
      sym("<", { shift: "<=", alts: ["<=", "<<", "</"] }),
      sym(">", { shift: ">=", alts: [">=", "=>", ">>"] }),
      sym("/", { shift: "\\", alts: ["\\", "//", "/*"] }),
      pair("{", "}"),
    ],
  },
  {
    cols: 11,
    keys: [
      ..."1234567890".split("").map(digit),
      sym("=", { shift: "==", alts: ["==", "===", "!=", "=>"] }),
    ],
  },
  {
    cols: 20,
    keys: [
      action("tab", "tab", "tab", { icon: "tab", span: 3, alts: [alt("outdent", cmd("outdent"))] }),
      sym("_", { shift: "$", alts: ["$", "-"], span: 2 }),
      sym(":", { shift: ";", alts: [";", "::"], span: 2 }),
      { id: "space", label: "", action: text(" "), span: 6, tone: "letter" },
      sym(",", { alts: [";"], span: 2 }),
      sym(".", { alts: ["...", "?.", "->"], span: 2 }),
      action("enter", "return", "enter", { icon: "enter", span: 3 }),
    ],
  },
  {
    cols: 20,
    className: "row-words",
    keys: [
      action("undo", "undo", "undo", { span: 4, repeat: true, word: true }),
      action("redo", "redo", "redo", { span: 4, repeat: true, word: true }),
      { ...sym("#", { shift: "@", alts: ["@", "$", "`"] }), span: 4, tone: "mod" },
      action("copy", "copy", "copy", {
        span: 4,
        word: true,
        alts: [alt("cut", cmd("cut")), alt("line", cmd("selectLine")), alt("all", cmd("selectAll"))],
      }),
      action("paste", "paste", "paste", { span: 4, word: true }),
    ],
  },
];

/** The thin bar above the keys: cursor movement and editor tools. */
export const accessoryRow: RowDef = {
  cols: 9,
  className: "row-accessory",
  keys: [
    action("acc-home", "line start", "home", { icon: "home", span: 1, tone: "acc", repeat: true }),
    action("acc-left", "left", "left", { icon: "left", span: 1, tone: "acc", repeat: true }),
    action("acc-up", "up", "up", { icon: "up", span: 1, tone: "acc", repeat: true }),
    action("acc-down", "down", "down", { icon: "down", span: 1, tone: "acc", repeat: true }),
    action("acc-right", "right", "right", { icon: "right", span: 1, tone: "acc", repeat: true }),
    action("acc-end", "line end", "end", { icon: "end", span: 1, tone: "acc", repeat: true }),
    action("acc-comment", "toggle comment", "comment", { icon: "comment", span: 1, tone: "acc" }),
    action("acc-search", "find", "search", { icon: "search", span: 1, tone: "acc" }),
    action("acc-hide", "hide keyboard", "hide", { icon: "hide", span: 1, tone: "acc" }),
  ],
};

/** SVG markup for key icons (24x24). */
export const keyIcons: Record<IconName, string> = {
  shift: '<path d="M12 4.5L4.5 12.5H9V19.5H15V12.5H19.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  shiftOn: '<path d="M12 4.5L4.5 12.5H9V19.5H15V12.5H19.5Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  capsLock: '<path d="M12 3.5L4.5 11.5H9V16H15V11.5H19.5Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="9" y="18.5" width="6" height="2.5" rx="0.6" fill="currentColor"/>',
  backspace: '<path d="M8.6 5H19.5A1.8 1.8 0 0 1 21.3 6.8V17.2A1.8 1.8 0 0 1 19.5 19H8.6L2.5 12Z" fill="currentColor"/><path d="M11 9L16.6 15M16.6 9L11 15" stroke="var(--kbg)" stroke-width="2.4" stroke-linecap="round"/>',
  tab: '<path d="M3 12H16.5M11.5 7L16.5 12L11.5 17M20.5 6V18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  enter: '<path d="M19.5 6V11.5A2 2 0 0 1 17.5 13.5H5.5M9.5 9.5L5.5 13.5L9.5 17.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  left: '<path d="M15 6L9 12L15 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M9 6L15 12L9 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  up: '<path d="M6 15L12 9L18 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="M6 9L12 15L18 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  home: '<path d="M5 5.5V18.5M17.5 7L12 12L17.5 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  end: '<path d="M19 5.5V18.5M6.5 7L12 12L6.5 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15L19.5 19.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  hide: '<rect x="3" y="4" width="18" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.5 8H7M10 8H10.5M13.5 8H14M17 8H17.5M8 11.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 18L12 20.5L15 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  comment: '<path d="M9.5 5L5.5 19M16.5 5L12.5 19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};
