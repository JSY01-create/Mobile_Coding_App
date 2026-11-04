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

## Files and folders

The menu at the top left opens the file tree, like the Explorer in VS Code.

- Folders open and close with a tap. Buttons at the top make a new file or
  folder in the highlighted folder, open files or a `.zip` from the phone, and
  save everything as a `.zip`.
- Type a path such as `src/lib/util.py` to create the folders on the way.
- The ⋯ next to a file renames or moves it (renaming to a new path moves it),
  duplicates, saves or deletes it. The ⋯ next to a folder adds a file or
  folder inside it, renames or moves it with everything in it, saves it as a
  `.zip`, or deletes it.
- Images and other non-text files can be added to any folder. Tapping an
  image shows it; non-text files can be moved, shared and deleted.
- Imported `.zip` files keep their folders and images.

### Where files are saved

- **Android app:** in **Documents/Thumbcode** on the phone, after you allow
  "All files access" (the app offers this on first start, and in Settings).
  Files you put there with the Files or Gallery app appear in the tree when
  you come back to the app, or with the refresh button. Without the
  permission, files stay inside the app.
- **Browser:** in the browser's storage on this device (IndexedDB).
- Code can point at other files in the project: in `href="…"`, `src="…"`,
  `import … from "./…"`, `require("./…")`, CSS `url(…)` and Markdown links,
  suggestions list the project's files with the right relative path.

## Run your code

The green ▶ in the top bar runs the open file.

- **HTML** opens a live preview of the page. CSS, scripts, ES module imports,
  images and `fetch()` load from the project's folders as if from a web server
  (in the Android app, Capacitor's local server reads them from storage; in the
  browser, the service worker serves them). Links to other pages of the project
  open in the preview. Running a `.css` or `.js` file opens the page that uses it.
- **JavaScript** files that no page uses run on their own.
- **Python** runs on the phone with [Pyodide](https://pyodide.org) (Python 3.14).
  The first run downloads it (about 10 MB). Other `.py` files and small data
  files in the project can be imported and opened, `input()` asks with a dialog,
  and packages such as numpy load when imported.

Mobile browsers have no developer tools, so the preview brings its own:

- **Console** under the page: `console.log/info/warn/error`, uncaught errors and
  failed loads with file and line (tap to jump to the code), expandable objects,
  and a command line that runs JavaScript in the page (or Python after a Python
  run).
- **Inspect** adds [Eruda](https://github.com/liriliri/eruda): elements and
  styles, network, storage, sources.
- **Desktop width** shows the page at 1280 px, scaled to fit.

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

## Android app (APK)

Every push builds an APK and posts it as the **latest-apk** release:

**https://github.com/JSY01-create/Mobile_Coding_App/releases/download/latest-apk/thumbcode.apk**

Open that link on the phone, then open the downloaded file. Android asks once
to allow installs from your browser or Files app. New versions install over
the old one and keep your files.

The app has the editor built in, so it works offline. Inside the app, copy and
paste use the phone's clipboard, "Save to device" opens the share sheet, and
the back button closes menus.

Build it yourself (needs JDK 21 and the Android SDK):

```sh
npm run apk   # APK in android/app/build/outputs/apk/release/app-release.apk
```

### Signing

Android only installs an update over an app signed with the same key. The key
is never stored in git:

- Local builds read it from `android/keystore.properties` (ignored by git):
  `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
- The GitHub workflow reads it from two repository secrets:
  `ANDROID_KEYSTORE_BASE64` (the key file in base64) and
  `ANDROID_KEYSTORE_PASSWORD`, with the key alias `thumbcode`.
- Without a key, the APK is signed with a throwaway key. It installs fine, but
  the next build can't update it: you have to uninstall first, which deletes
  the files saved in the app.

## Put it on your phone as a web app

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
| `src/main.ts` | App shell: menus, settings |
| `src/files.ts`, `src/paths.ts` | Files and folders in memory, saved through the workspace |
| `src/workspace.ts` | Storage: Documents/Thumbcode, app storage, or IndexedDB |
| `android/app/src/main/java/.../StorageAccessPlugin.java` | Asks Android for file access |
| `src/ui/explorer.ts` | File tree, create/rename/move/delete, zip import and export |
| `src/snippets/paths.ts` | File path suggestions |
| `src/snippets/after.ts`, `cssValues.ts`, `classes.ts` | `=""` after attributes, CSS values per property, class names from CSS |
| `src/run/` | Run: preview page, console, Python, serving project files |
| `src/native.ts` | Android app extras: clipboard, share sheet, back button, haptics |
| `android/` | Android project (Capacitor) |
