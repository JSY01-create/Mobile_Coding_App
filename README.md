# Thumbcode

A code editor for phones, with a keyboard laid out for code.

It runs in the phone's browser and installs to the home screen like an app
(a PWA). It works offline once opened, and files are saved on the device.

## The keyboard

```
 !   %   *   -  []   +   "   <   >   /  {}
 1   2   3   4   5   6   7   8   9   0   =
 q   w   e   r   t   y   u   i   o   p
 a   s   d   f   g   h   j   k   l  ()
 ⇧    z   x   c   v   b   n   m    ⌫
 ⇥   _   :    [  space  ]   ,   .    ⏎
 undo   redo    #    copy   paste
```

Above the keys is a bar with line start, ← ↑ ↓ →, line end, comment toggle,
find and replace, and a button to hide the keys.

- **Slide to move the cursor.** Put a finger on any key and slide: the keys go
  blank and the cursor follows, up and down too. Faster slides move further.
  Turn on shift first to select text.
- **Hold a key** for more symbols, e.g. `"` → `'` `` ` ``, `!` → `?` `!=`, `:` → `;`.
- **Shift** shows the small corner symbol of each key: `? & ^ ~ | ' \ ; $ @`.
  Double-tap for caps lock.
- `()` `[]` `{}` type both brackets; selected text gets wrapped.
- **Tab** accepts a suggestion, expands a shortcut, jumps to the next blank,
  jumps past a closing bracket or quote, or indents. Shift + tab outdents.
- Hold **copy** for cut, select line, select all.
- Pinch the code to zoom.

A setting switches to the phone's own keyboard (the arrow bar stays).

## Languages

Syntax highlighting for 140+ languages (CodeMirror 6), picked from the file
extension or chosen from the language button. Suggestions appear as you type:
language-aware ones for JavaScript, TypeScript, Python, HTML, CSS, SQL and
others, and words from the file for the rest.

## Shortcuts

Type a shortcut and pick it from the suggestions (tap, tab or return). Blanks
to fill in are tab stops: press tab to go to the next one.

| Language | Examples |
| --- | --- |
| HTML | Full Emmet, like VS Code: `!`, `link:css`, `script:src`, `ul>li*3`, `div.card>h2+p`, `a:link`, `input:email`, `lorem` |
| CSS | Emmet: `m10`, `p8-16`, `df`, `jcc`, `w100p`, `bgc`; plus `media`, `dark`, `flexc`, `gridc`, `kf`, `root`, `fontface` |
| JavaScript | `log`, `logv`, `fn`, `afn`, `ael`, `qs`, `fetch`, `timeout`, `promise`, `foreach`, `map`, `switch`, `tryf`, `desc`, `test` |
| TypeScript | all JavaScript ones plus `tfn`, `tafn`, `union`, `record`, `guard` |
| React (JSX/TSX) | `rfc`, `us`, `ue`, `ur`, `um`, `uc`, `imr` |
| Python | `main`, `ifmain`, `pr`, `prf`, `init`, `dc`, `prop`, `forr`, `fore`, `lc`, `tryex`, `readf`, `writef`, `argp`, `test` |
| Java | `psvm`/`main`, `sout`, `souf`, `fori`, `fore`, `class`, `ctor`, `try`, `list`, `map`, `scan`, `record` |
| C / C++ | `main`, `inc`, `pf`, `sf`, `fori`, `struct`, `guard`; C++ `cout`, `cin`, `vec`, `forr`, `class`, `uptr` |
| C# | `cw`, `svm`, `class`, `prop`, `ctor`, `foreach`, `try`, `async` |
| Go | `pkgm`, `main`, `fp`, `fpf`, `iferr`, `forr`, `struct`, `gof`, `handler`, `test` |
| Rust | `main`, `fn`, `pln`, `plnv`, `struct`, `impl`, `match`, `iflet`, `res`, `test` |
| Kotlin, Swift, Dart | `main`, `fun`/`func`, `data`, `when`, `guard`, `view` (SwiftUI), `stless`/`stful` (Flutter) |
| PHP, Ruby, Lua | `php`, `foreach`, `dump`; `def`, `each`, `class`; `func`, `forp`, `req` |
| SQL | `sel`, `selj`, `ins`, `upd`, `del`, `ct`, `idx`, `grp`, `cte`, `case` |
| Shell | `shebang`, `if`, `for`, `fori`, `func`, `case`, `readl`, `usage` |
| Markdown | `link`, `img`, `code`, `table`, `todo`, `details` |

Inside an HTML file, CSS shortcuts work in `<style>` and JavaScript ones in
`<script>`. Add your own in `src/snippets/library.ts`.

## Put it on your phone

1. In the repository settings, open **Pages** and set **Source** to
   **GitHub Actions**.
2. Push to `main` (or run the "Deploy to GitHub Pages" workflow). The site is
   published at `https://<user>.github.io/<repo>/`.
3. Open that address on the phone, then use **Add to Home Screen**
   (Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).

## Develop

```sh
npm install
npm run dev          # local server, open the printed address on your phone (same Wi-Fi)
npm run build        # app in dist/
npm run build:single # one self-contained HTML file in dist-single/thumbcode.html
npm run typecheck
```

### Layout of the code

| Path | What it does |
| --- | --- |
| `src/keyboard/layout.ts` | Rows, keys, shift symbols, long-press menus |
| `src/keyboard/keyboard.ts` | Touch handling: taps, long-press, key repeat, shift, slide-to-move-cursor |
| `src/keyboard/targets.ts` | What each key does in the editor or a text field |
| `src/snippets/library.ts` | Shortcuts per language |
| `src/snippets/index.ts` | Emmet and shortcut suggestions, tab expansion |
| `src/editor.ts`, `src/theme.ts` | CodeMirror setup, colors |
| `src/main.ts` | App shell: files, menus, settings |
