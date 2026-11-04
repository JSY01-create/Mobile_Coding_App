// Files a new install starts with, so the editor opens with something to try.

const welcome = `# Welcome to Thumbcode

A code editor built for thumbs. The keyboard below has the
symbols code needs, so you rarely switch layouts.

## Move the cursor

Put a finger on any key and slide. The keys go blank and the
cursor follows your finger, up and down too. Slide fast to
travel further. Turn on shift first to select text instead.

## Keyboard tricks

- Hold a key for more symbols. Hold \`"\` for \`'\` and backticks,
  hold \`!\` for \`?\` and \`!=\`, hold \`:\` for \`;\`.
- Shift shows the small corner symbol of each key:
  \`?  &  ^  ~  |  '  \\  ;  $  @\`
- Double-tap shift for caps lock.
- \`()\` \`[]\` \`{}\` type both brackets. Selected text gets wrapped.
- Tab jumps past a closing bracket or quote, or indents.
  Shift + tab outdents.
- Hold copy for cut, select line and select all.
- The bar above the keys has arrows, line start and end,
  comment toggle, find and replace, and a button to hide the keys.
- Pinch the code to zoom.

## Suggestions and shortcuts

Suggestions appear as you type. Tap one, or press tab or return.

Shortcuts expand into code with blanks to fill in. Press tab
to jump to the next blank.

- HTML: \`!\` for a full page, \`link:css\`, \`ul>li*3\`, \`div.card\`
  and every other Emmet abbreviation, like in VS Code.
- CSS: \`m10\` \`p8\` \`df\` \`jcc\` \`w100p\`, plus \`media\`, \`flexc\`, \`kf\`.
- JavaScript: \`log\` \`fn\` \`afn\` \`ael\` \`qs\` \`fetch\` \`timeout\`
- Python: \`main\` \`pr\` \`forr\` \`init\` \`dc\` \`tryex\` \`readf\`
- Java \`sout\` \`psvm\`, C/C++ \`main\` \`pf\` \`cout\`, Go \`iferr\` \`fp\`,
  Rust \`pln\` \`match\`, SQL \`sel\` \`ins\` \`ct\`, and more for
  C#, Kotlin, Swift, PHP, Ruby, Dart, Shell, Markdown and Lua.

## Files

Tap the menu at the top left to switch files. A new file picks
its language from the name: .py, .js, .ts, .rs, .go, .java,
.c, .cpp, .kt, .swift, .rb, .php, .sql and over 100 more.
Tap the language name at the top to change it.

Everything saves on this device as you type.
`;

const python = `# A tiny inventory report
from dataclasses import dataclass


@dataclass
class Item:
    name: str
    qty: int
    price: float

    @property
    def total(self) -> float:
        return self.qty * self.price


def report(items: list[Item]) -> str:
    lines = [f"{i.name:<10}{i.qty:>4} x {i.price:>6.2f}" for i in items]
    grand = sum(i.total for i in items)
    lines.append(f"{'Total':<10}{grand:>17.2f}")
    return "\\n".join(lines)


if __name__ == "__main__":
    stock = [Item("bolts", 120, 0.15), Item("hinges", 8, 3.40)]
    print(report(stock))
`;

const javascript = `// Run fn only after calls stop for \`wait\` ms
export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const search = document.querySelector("#search");
const results = document.querySelector("#results");

search?.addEventListener(
  "input",
  debounce(async (event) => {
    const q = event.target.value.trim();
    if (!q) return (results.textContent = "");
    const res = await fetch(\`/api/search?q=\${encodeURIComponent(q)}\`);
    const { items } = await res.json();
    results.innerHTML = items.map((it) => \`<li>\${it.title}</li>\`).join("");
  }, 250)
);
`;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Pocket page</title>
    <style>
      body { font-family: system-ui; margin: 2rem; }
      .card { padding: 1rem; border-radius: 12px; background: #f2f2f7; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Hello from my phone</h1>
      <p>Written in Thumbcode.</p>
    </div>
  </body>
</html>
`;

export const sampleFiles: { name: string; content: string }[] = [
  { name: "welcome.md", content: welcome },
  { name: "inventory.py", content: python },
  { name: "debounce.js", content: javascript },
  { name: "index.html", content: html },
];
