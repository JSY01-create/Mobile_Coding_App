// Shortcuts per language. Type the label and pick it from the suggestions,
// or press tab right after it. Template syntax (CodeMirror snippets):
//   ${name}  a tab stop with placeholder text; the same name twice is edited together
//   ${}      an empty tab stop; tab stops are visited in the order they appear
//   \t       one indent step, \n a new line (kept at the current indentation)
// Avoid placeholders that are only digits: CodeMirror reads ${3} as "tab stop 3".

export interface SnippetDef {
  label: string;
  detail: string;
  template: string;
}

type Table = [label: string, detail: string, template: string][];

const js: Table = [
  ["log", "console.log", "console.log(${});"],
  ["logv", "log a variable", 'console.log("${name}:", ${name});'],
  ["warn", "console.warn", "console.warn(${});"],
  ["err", "console.error", "console.error(${});"],
  ["fn", "arrow function", "const ${name} = (${params}) => {\n\t${}\n};"],
  ["afn", "async arrow function", "const ${name} = async (${params}) => {\n\t${}\n};"],
  ["asyncf", "async function", "async function ${name}(${params}) {\n\t${}\n}"],
  ["arrow", "inline arrow", "(${params}) => ${}"],
  ["iife", "run immediately", "(() => {\n\t${}\n})();"],
  ["forin", "for...in loop", "for (const ${key} in ${object}) {\n\t${}\n}"],
  ["foreach", "array.forEach", "${array}.forEach((${item}) => {\n\t${}\n});"],
  ["map", "array.map", "${array}.map((${item}) => ${})"],
  ["filter", "array.filter", "${array}.filter((${item}) => ${})"],
  ["reduce", "array.reduce", "${array}.reduce((${acc}, ${item}) => ${}, ${initial})"],
  ["find", "array.find", "${array}.find((${item}) => ${})"],
  ["switch", "switch statement", "switch (${value}) {\n\tcase ${a}:\n\t\t${}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}"],
  ["tryf", "try / catch / finally", "try {\n\t${}\n} catch (${error}) {\n\tconsole.error(${error});\n} finally {\n\t\n}"],
  ["tern", "ternary", "${condition} ? ${yes} : ${no}"],
  ["ael", "addEventListener", '${element}.addEventListener("${click}", (${event}) => {\n\t${}\n});'],
  ["qs", "querySelector", 'document.querySelector("${selector}")'],
  ["qsa", "querySelectorAll", 'document.querySelectorAll("${selector}")'],
  ["gid", "getElementById", 'document.getElementById("${id}")'],
  ["ce", "createElement", 'document.createElement("${div}")'],
  ["fetch", "fetch JSON", "const ${res} = await fetch(${url});\nconst ${data} = await ${res}.json();\n${}"],
  ["timeout", "setTimeout", "setTimeout(() => {\n\t${}\n}, ${delay});"],
  ["interval", "setInterval", "setInterval(() => {\n\t${}\n}, ${delay});"],
  ["promise", "new Promise", "new Promise((resolve, reject) => {\n\t${}\n})"],
  ["expf", "export function", "export function ${name}(${params}) {\n\t${}\n}"],
  ["expc", "export const", "export const ${name} = ${};"],
  ["expd", "export default", "export default ${};"],
  ["req", "require", 'const ${name} = require("${module}");'],
  ["json", "JSON.stringify", "JSON.stringify(${value}, null, 2)"],
  ["parse", "JSON.parse", "JSON.parse(${text})"],
  ["desc", "test suite", 'describe("${name}", () => {\n\t${}\n});'],
  ["test", "test case", 'test("${does something}", () => {\n\t${}\n});'],
  ["todo", "TODO comment", "// TODO: ${}"],
];

const ts: Table = [
  ["tfn", "typed function", "function ${name}(${param}: ${type}): ${void} {\n\t${}\n}"],
  ["tafn", "typed async function", "async function ${name}(${param}: ${type}): Promise<${void}> {\n\t${}\n}"],
  ["union", "union type", "type ${Name} = ${A} | ${B};"],
  ["record", "Record type", "Record<${string}, ${unknown}>"],
  ["guard", "type guard", "function is${Name}(value: unknown): value is ${Name} {\n\treturn ${};\n}"],
];

const react: Table = [
  ["rfc", "React component", "export default function ${Component}() {\n\treturn (\n\t\t<div>\n\t\t\t${}\n\t\t</div>\n\t);\n}"],
  ["us", "useState", "const [${state}, ${setState}] = useState(${initial});"],
  ["ue", "useEffect", "useEffect(() => {\n\t${}\n}, [${deps}]);"],
  ["ur", "useRef", "const ${ref} = useRef(${null});"],
  ["um", "useMemo", "const ${value} = useMemo(() => ${}, [${deps}]);"],
  ["uc", "useCallback", "const ${handler} = useCallback((${}) => {\n\t\n}, [${deps}]);"],
  ["imr", "import React hooks", 'import { ${useState} } from "react";'],
];

const python: Table = [
  ["main", "main function", 'def main():\n\t${pass}\n\n\nif __name__ == "__main__":\n\tmain()'],
  ["ifmain", "if __name__ == ...", 'if __name__ == "__main__":\n\t${main()}'],
  ["pr", "print", "print(${})"],
  ["prf", "print f-string", 'print(f"${}")'],
  ["init", "__init__ method", "def __init__(self${, args}):\n\t${pass}"],
  ["defm", "method", "def ${name}(self${}):\n\t${pass}"],
  ["adef", "async def", "async def ${name}(${params}):\n\t${pass}"],
  ["dc", "dataclass", "@dataclass\nclass ${Name}:\n\t${field}: ${int}"],
  ["prop", "property", "@property\ndef ${name}(self):\n\treturn self._${name}"],
  ["forr", "for in range", "for ${i} in range(${n}):\n\t${pass}"],
  ["fore", "for with enumerate", "for ${i}, ${item} in enumerate(${items}):\n\t${pass}"],
  ["ford", "for over dict items", "for ${key}, ${value} in ${data}.items():\n\t${pass}"],
  ["wt", "while True", "while True:\n\t${pass}"],
  ["lc", "list comprehension", "[${x} for ${x} in ${items}]"],
  ["lci", "list comprehension with if", "[${x} for ${x} in ${items} if ${condition}]"],
  ["dcomp", "dict comprehension", "{${k}: ${v} for ${k}, ${v} in ${pairs}}"],
  ["lam", "lambda", "lambda ${x}: ${}"],
  ["tryex", "try / except", "try:\n\t${pass}\nexcept ${Exception} as ${e}:\n\t${raise}"],
  ["tryf", "try / finally", "try:\n\t${pass}\nfinally:\n\t${pass}"],
  ["readf", "read a file", 'with open(${path}, encoding="utf-8") as f:\n\t${text} = f.read()'],
  ["writef", "write a file", 'with open(${path}, "w", encoding="utf-8") as f:\n\tf.write(${text})'],
  ["enum", "Enum class", "from enum import Enum\n\n\nclass ${Name}(Enum):\n\t${A} = 1"],
  ["argp", "argparse setup", 'import argparse\n\nparser = argparse.ArgumentParser(description="${}")\nparser.add_argument("${name}")\nargs = parser.parse_args()'],
  ["reqget", "requests GET", "import requests\n\nres = requests.get(${url})\nres.raise_for_status()\n${data} = res.json()"],
  ["test", "pytest test", "def test_${name}():\n\tassert ${}"],
  ["docs", "docstring", '"""${Summary.}"""'],
  ["shebang", "#!/usr/bin/env python3", "#!/usr/bin/env python3\n${}"],
];

const css: Table = [
  ["media", "@media query", "@media (max-width: ${768px}) {\n\t${}\n}"],
  ["dark", "dark mode query", "@media (prefers-color-scheme: dark) {\n\t${}\n}"],
  ["flexc", "flex center", "display: flex;\nalign-items: center;\njustify-content: center;"],
  ["gridc", "grid columns", "display: grid;\ngrid-template-columns: repeat(${columns}, 1fr);\ngap: ${16px};"],
  ["center", "absolute center", "position: absolute;\ntop: 50%;\nleft: 50%;\ntransform: translate(-50%, -50%);"],
  ["kf", "@keyframes", "@keyframes ${name} {\n\tfrom {\n\t\t${}\n\t}\n\tto {\n\t\t\n\t}\n}"],
  ["root", ":root variables", ":root {\n\t--${name}: ${value};\n}"],
  ["var", "var()", "var(--${name})"],
  ["fontface", "@font-face", '@font-face {\n\tfont-family: "${Name}";\n\tsrc: url("${font.woff2}") format("woff2");\n}'],
  ["import", "@import", '@import url("${}");'],
  ["transition", "transition", "transition: ${all} ${0.2s} ${ease};"],
  ["reset", "box-sizing reset", "*,\n*::before,\n*::after {\n\tbox-sizing: border-box;\n\tmargin: 0;\n}"],
  ["hover", ":hover rule", "&:hover {\n\t${}\n}"],
];

const java: Table = [
  ["main", "main method", "public static void main(String[] args) {\n\t${}\n}"],
  ["psvm", "main method", "public static void main(String[] args) {\n\t${}\n}"],
  ["sout", "System.out.println", "System.out.println(${});"],
  ["souf", "System.out.printf", 'System.out.printf("${}%n");'],
  ["serr", "System.err.println", "System.err.println(${});"],
  ["class", "class", "public class ${Name} {\n\t${}\n}"],
  ["ctor", "constructor", "public ${Name}(${}) {\n\t\n}"],
  ["meth", "method", "public ${void} ${name}(${}) {\n\t\n}"],
  ["fori", "for loop", "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}"],
  ["fore", "for-each loop", "for (${String} ${item} : ${items}) {\n\t${}\n}"],
  ["if", "if", "if (${condition}) {\n\t${}\n}"],
  ["ife", "if / else", "if (${condition}) {\n\t${}\n} else {\n\t\n}"],
  ["while", "while loop", "while (${condition}) {\n\t${}\n}"],
  ["switch", "switch", "switch (${value}) {\n\tcase ${a} -> ${};\n\tdefault -> {}\n}"],
  ["try", "try / catch", "try {\n\t${}\n} catch (${Exception} e) {\n\te.printStackTrace();\n}"],
  ["list", "ArrayList", "List<${String}> ${list} = new ArrayList<>();"],
  ["map", "HashMap", "Map<${String}, ${Integer}> ${map} = new HashMap<>();"],
  ["scan", "Scanner from stdin", "Scanner ${sc} = new Scanner(System.in);"],
  ["record", "record", "public record ${Name}(${}) {}"],
  ["intf", "interface", "public interface ${Name} {\n\t${}\n}"],
];

const cCommon: Table = [
  ["inc", "#include <...>", "#include <${stdio.h}>"],
  ["incl", '#include "..."', '#include "${header.h}"'],
  ["def", "#define", "#define ${NAME} ${value}"],
  ["guard", "include guard", "#ifndef ${NAME}_H\n#define ${NAME}_H\n\n${}\n\n#endif"],
  ["fori", "for loop", "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}"],
  ["if", "if", "if (${condition}) {\n\t${}\n}"],
  ["ife", "if / else", "if (${condition}) {\n\t${}\n} else {\n\t\n}"],
  ["while", "while loop", "while (${condition}) {\n\t${}\n}"],
  ["dowhile", "do / while", "do {\n\t${}\n} while (${condition});"],
  ["switch", "switch", "switch (${value}) {\ncase ${a}:\n\t${}\n\tbreak;\ndefault:\n\tbreak;\n}"],
  ["func", "function", "${int} ${name}(${}) {\n\t\n}"],
];

const c: Table = [
  ["main", "main function", "int main(int argc, char *argv[]) {\n\t${}\n\treturn 0;\n}"],
  ["pf", "printf", 'printf("${}\\n");'],
  ["sf", "scanf", 'scanf("${%d}", &${x});'],
  ["struct", "typedef struct", "typedef struct {\n\t${}\n} ${Name};"],
  ["malloc", "malloc array", "${int} *${p} = malloc(${n} * sizeof(${int}));"],
];

const cpp: Table = [
  ["main", "main function", "int main() {\n\t${}\n\treturn 0;\n}"],
  ["cout", "std::cout", "std::cout << ${} << std::endl;"],
  ["cin", "std::cin", "std::cin >> ${x};"],
  ["incio", "#include <iostream>", "#include <iostream>\n${}"],
  ["uns", "using namespace std", "using namespace std;"],
  ["vec", "std::vector", "std::vector<${int}> ${v};"],
  ["forr", "range for", "for (const auto& ${item} : ${items}) {\n\t${}\n}"],
  ["class", "class", "class ${Name} {\npublic:\n\t${Name}();\n\t~${Name}();\n\nprivate:\n\t${}\n};"],
  ["struct", "struct", "struct ${Name} {\n\t${}\n};"],
  ["ns", "namespace", "namespace ${name} {\n\n${}\n\n}"],
  ["tmpl", "template", "template <typename ${T}>"],
  ["lambda", "lambda", "[${&}](${}) {\n\t\n}"],
  ["uptr", "std::make_unique", "auto ${p} = std::make_unique<${T}>(${});"],
];

const csharp: Table = [
  ["cw", "Console.WriteLine", "Console.WriteLine(${});"],
  ["cr", "Console.ReadLine", "Console.ReadLine()"],
  ["svm", "Main method", "static void Main(string[] args)\n{\n\t${}\n}"],
  ["class", "class", "public class ${Name}\n{\n\t${}\n}"],
  ["prop", "auto property", "public ${int} ${Name} { get; set; }"],
  ["ctor", "constructor", "public ${Name}()\n{\n\t${}\n}"],
  ["for", "for loop", "for (int ${i} = 0; ${i} < ${n}; ${i}++)\n{\n\t${}\n}"],
  ["foreach", "foreach loop", "foreach (var ${item} in ${items})\n{\n\t${}\n}"],
  ["if", "if", "if (${condition})\n{\n\t${}\n}"],
  ["try", "try / catch", "try\n{\n\t${}\n}\ncatch (${Exception} ex)\n{\n\tConsole.WriteLine(ex.Message);\n}"],
  ["async", "async method", "public async Task ${Name}Async()\n{\n\t${}\n}"],
  ["list", "List", "var ${list} = new List<${int}>();"],
];

const go: Table = [
  ["pkgm", "package main file", 'package main\n\nimport "fmt"\n\nfunc main() {\n\t${}\n}'],
  ["main", "func main", "func main() {\n\t${}\n}"],
  ["fp", "fmt.Println", "fmt.Println(${})"],
  ["fpf", "fmt.Printf", 'fmt.Printf("${%v}\\n", ${})'],
  ["func", "function", "func ${name}(${}) ${error} {\n\t\n}"],
  ["meth", "method", "func (${r} *${Type}) ${Name}(${}) {\n\t\n}"],
  ["iferr", "if err != nil", "if err != nil {\n\treturn ${err}\n}"],
  ["for", "for loop", "for ${i} := 0; ${i} < ${n}; ${i}++ {\n\t${}\n}"],
  ["forr", "for range", "for ${_}, ${v} := range ${items} {\n\t${}\n}"],
  ["struct", "struct type", "type ${Name} struct {\n\t${}\n}"],
  ["intf", "interface type", "type ${Name} interface {\n\t${}\n}"],
  ["gof", "goroutine", "go func() {\n\t${}\n}()"],
  ["sel", "select", "select {\ncase ${msg} := <-${ch}:\n\t${}\n}"],
  ["mk", "make map", "${m} := make(map[${string}]${int})"],
  ["handler", "HTTP handler", "func ${handler}(w http.ResponseWriter, r *http.Request) {\n\t${}\n}"],
  ["test", "test function", "func Test${Name}(t *testing.T) {\n\t${}\n}"],
];

const rust: Table = [
  ["main", "fn main", "fn main() {\n\t${}\n}"],
  ["fn", "function", "fn ${name}(${}) -> ${Type} {\n\t\n}"],
  ["pln", "println!", 'println!("${}");'],
  ["plnv", "println! debug value", 'println!("{:?}", ${value});'],
  ["struct", "struct", "#[derive(Debug)]\nstruct ${Name} {\n\t${}\n}"],
  ["impl", "impl block", "impl ${Name} {\n\t${}\n}"],
  ["new", "new constructor", "pub fn new(${}) -> Self {\n\tSelf {  }\n}"],
  ["enum", "enum", "enum ${Name} {\n\t${}\n}"],
  ["trait", "trait", "trait ${Name} {\n\t${}\n}"],
  ["match", "match", "match ${value} {\n\t${pattern} => ${},\n\t_ => {}\n}"],
  ["iflet", "if let Some", "if let Some(${x}) = ${option} {\n\t${}\n}"],
  ["for", "for loop", "for ${item} in ${items} {\n\t${}\n}"],
  ["vec", "Vec::new", "let ${v}: Vec<${i32}> = Vec::new();"],
  ["res", "fn returning Result", "fn ${name}() -> Result<(), Box<dyn std::error::Error>> {\n\t${}\n\tOk(())\n}"],
  ["test", "test function", "#[test]\nfn ${name}() {\n\t${}\n}"],
];

const kotlin: Table = [
  ["main", "fun main", "fun main() {\n\t${}\n}"],
  ["fun", "function", "fun ${name}(${}): ${Unit} {\n\t\n}"],
  ["pl", "println", "println(${})"],
  ["data", "data class", "data class ${Name}(val ${id}: ${Int})"],
  ["class", "class", "class ${Name}(${}) {\n\t\n}"],
  ["obj", "object", "object ${Name} {\n\t${}\n}"],
  ["when", "when", "when (${value}) {\n\t${a} -> ${}\n\telse -> {}\n}"],
  ["for", "for loop", "for (${item} in ${items}) {\n\t${}\n}"],
  ["fori", "for in range", "for (${i} in 0 until ${n}) {\n\t${}\n}"],
  ["if", "if", "if (${condition}) {\n\t${}\n}"],
  ["lazy", "by lazy", "val ${name} by lazy { ${} }"],
];

const swift: Table = [
  ["pr", "print", "print(${})"],
  ["func", "function", "func ${name}(${}) -> ${Void} {\n\t\n}"],
  ["struct", "struct", "struct ${Name} {\n\t${}\n}"],
  ["class", "class", "class ${Name} {\n\tinit() {\n\t\t${}\n\t}\n}"],
  ["enum", "enum", "enum ${Name} {\n\tcase ${a}\n}"],
  ["guard", "guard let", "guard let ${value} = ${optional} else {\n\treturn\n}"],
  ["iflet", "if let", "if let ${value} = ${optional} {\n\t${}\n}"],
  ["for", "for in", "for ${item} in ${items} {\n\t${}\n}"],
  ["switch", "switch", "switch ${value} {\ncase ${a}:\n\t${}\ndefault:\n\tbreak\n}"],
  ["view", "SwiftUI view", 'struct ${ContentView}: View {\n\tvar body: some View {\n\t\t${Text("Hello")}\n\t}\n}'],
];

const php: Table = [
  ["php", "<?php tag", "<?php\n\n${}"],
  ["echo", "echo", "echo ${};"],
  ["dump", "var_dump", "var_dump(${});"],
  ["func", "function", "function ${name}(${}) {\n\t\n}"],
  ["class", "class", "class ${Name}\n{\n\tpublic function __construct(${})\n\t{\n\t\t\n\t}\n}"],
  ["foreach", "foreach", "foreach (${$items} as ${$item}) {\n\t${}\n}"],
  ["foreachk", "foreach with keys", "foreach (${$items} as ${$key} => ${$value}) {\n\t${}\n}"],
  ["if", "if", "if (${condition}) {\n\t${}\n}"],
  ["ife", "if / else", "if (${condition}) {\n\t${}\n} else {\n\t\n}"],
  ["arr", "array", "$${name} = [${}];"],
  ["json", "json_encode", "json_encode(${}, JSON_PRETTY_PRINT)"],
];

const ruby: Table = [
  ["def", "method", "def ${name}(${})\n\t${}\nend"],
  ["class", "class", "class ${Name}\n\tdef initialize(${})\n\t\t${}\n\tend\nend"],
  ["mod", "module", "module ${Name}\n\t${}\nend"],
  ["each", "each block", "${items}.each do |${item}|\n\t${}\nend"],
  ["map", "map block", "${items}.map { |${x}| ${} }"],
  ["times", "n.times", "${n}.times do |${i}|\n\t${}\nend"],
  ["if", "if", "if ${condition}\n\t${}\nend"],
  ["unless", "unless", "unless ${condition}\n\t${}\nend"],
  ["case", "case / when", "case ${value}\nwhen ${a}\n\t${}\nelse\n\t\nend"],
  ["puts", "puts", "puts ${}"],
  ["attr", "attr_accessor", "attr_accessor :${name}"],
];

const dart: Table = [
  ["main", "main function", "void main() {\n\t${}\n}"],
  ["pr", "print", "print(${});"],
  ["fn", "function", "${void} ${name}(${}) {\n\t\n}"],
  ["afn", "async function", "Future<${void}> ${name}() async {\n\t${}\n}"],
  ["class", "class", "class ${Name} {\n\t${}\n}"],
  ["for", "for loop", "for (var ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}"],
  ["forin", "for in", "for (final ${item} in ${items}) {\n\t${}\n}"],
  ["stless", "StatelessWidget", "class ${MyWidget} extends StatelessWidget {\n\tconst ${MyWidget}({super.key});\n\n\t@override\n\tWidget build(BuildContext context) {\n\t\treturn ${Container()};\n\t}\n}"],
  ["stful", "StatefulWidget", "class ${MyWidget} extends StatefulWidget {\n\tconst ${MyWidget}({super.key});\n\n\t@override\n\tState<${MyWidget}> createState() => _${MyWidget}State();\n}\n\nclass _${MyWidget}State extends State<${MyWidget}> {\n\t@override\n\tWidget build(BuildContext context) {\n\t\treturn ${Container()};\n\t}\n}"],
];

const sql: Table = [
  ["sel", "SELECT ... WHERE", "SELECT ${*}\nFROM ${table}\nWHERE ${condition};"],
  ["selj", "SELECT with JOIN", "SELECT ${columns}\nFROM ${a}\nJOIN ${b} ON ${a}.${id} = ${b}.${a_id};"],
  ["ins", "INSERT", "INSERT INTO ${table} (${columns})\nVALUES (${values});"],
  ["upd", "UPDATE", "UPDATE ${table}\nSET ${column} = ${value}\nWHERE ${condition};"],
  ["del", "DELETE", "DELETE FROM ${table}\nWHERE ${condition};"],
  ["ct", "CREATE TABLE", "CREATE TABLE ${name} (\n\tid INTEGER PRIMARY KEY,\n\t${}\n);"],
  ["idx", "CREATE INDEX", "CREATE INDEX ${idx_name} ON ${table} (${column});"],
  ["grp", "GROUP BY count", "SELECT ${column}, COUNT(*)\nFROM ${table}\nGROUP BY ${column}\nORDER BY COUNT(*) DESC;"],
  ["cte", "WITH (CTE)", "WITH ${name} AS (\n\t${SELECT 1}\n)\nSELECT * FROM ${name};"],
  ["case", "CASE WHEN", "CASE\n\tWHEN ${condition} THEN ${result}\n\tELSE ${other}\nEND"],
];

const shell: Table = [
  ["shebang", "bash script header", "#!/usr/bin/env bash\nset -euo pipefail\n\n${}"],
  ["if", "if", "if [[ ${condition} ]]; then\n\t${}\nfi"],
  ["ife", "if / else", "if [[ ${condition} ]]; then\n\t${}\nelse\n\t\nfi"],
  ["for", "for in", "for ${item} in ${items}; do\n\t${}\ndone"],
  ["fori", "counting for", "for ((${i} = 0; ${i} < ${n}; ${i}++)); do\n\t${}\ndone"],
  ["while", "while", "while ${condition}; do\n\t${}\ndone"],
  ["func", "function", "${name}() {\n\t${}\n}"],
  ["case", "case", 'case "$${var}" in\n\t${pattern})\n\t\t${}\n\t\t;;\n\t*)\n\t\t;;\nesac'],
  ["readl", "read file lines", 'while IFS= read -r ${line}; do\n\t${}\ndone < "${file}"'],
  ["usage", "argument check", 'if [[ $# -lt 1 ]]; then\n\techo "Usage: $0 ${args}" >&2\n\texit 1\nfi'],
];

const markdown: Table = [
  ["link", "link", "[${text}](${url})"],
  ["img", "image", "![${alt}](${url})"],
  ["code", "code block", "```${lang}\n${}\n```"],
  ["table", "table", "| ${Column} | ${Column 2} |\n| --- | --- |\n| ${} |  |"],
  ["todo", "task item", "- [ ] ${}"],
  ["bold", "bold", "**${text}**"],
  ["italic", "italic", "_${text}_"],
  ["details", "collapsible section", "<details>\n<summary>${Summary}</summary>\n\n${}\n\n</details>"],
];

const lua: Table = [
  ["func", "function", "function ${name}(${})\n\t${}\nend"],
  ["lfunc", "local function", "local function ${name}(${})\n\t${}\nend"],
  ["for", "numeric for", "for ${i} = 1, ${n} do\n\t${}\nend"],
  ["forp", "for pairs", "for ${k}, ${v} in pairs(${t}) do\n\t${}\nend"],
  ["fori", "for ipairs", "for ${i}, ${v} in ipairs(${t}) do\n\t${}\nend"],
  ["if", "if", "if ${condition} then\n\t${}\nend"],
  ["pr", "print", "print(${})"],
  ["req", "require", 'local ${name} = require("${name}")'],
];

const toDefs = (...tables: Table[]): SnippetDef[] => {
  const seen = new Set<string>();
  const out: SnippetDef[] = [];
  for (const table of tables)
    for (const [label, detail, template] of table) {
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label, detail, template });
    }
  return out;
};

export type Context =
  | "js" | "jsx" | "ts" | "tsx" | "python" | "html" | "xml" | "php"
  | "css" | "scss" | "less" | "sass" | "stylus"
  | "java" | "c" | "cpp" | "csharp" | "go" | "rust" | "kotlin" | "swift"
  | "ruby" | "dart" | "sql" | "shell" | "markdown" | "lua";

const css3 = toDefs(css);

export const snippetsByContext: Record<Context, SnippetDef[]> = {
  js: toDefs(js),
  jsx: toDefs(react, js),
  ts: toDefs(ts, js),
  tsx: toDefs(react, ts, js),
  python: toDefs(python),
  html: [],
  xml: [],
  php: toDefs(php),
  css: css3,
  scss: css3,
  less: css3,
  sass: css3,
  stylus: css3,
  java: toDefs(java),
  c: toDefs(c, cCommon),
  cpp: toDefs(cpp, cCommon),
  csharp: toDefs(csharp),
  go: toDefs(go),
  rust: toDefs(rust),
  kotlin: toDefs(kotlin),
  swift: toDefs(swift),
  ruby: toDefs(ruby),
  dart: toDefs(dart),
  sql: toDefs(sql),
  shell: toDefs(shell),
  markdown: toDefs(markdown),
  lua: toDefs(lua),
};

/** Which shortcut set a file uses, by its language name. */
export const contextForLanguage: Record<string, Context> = {
  JavaScript: "js", JSX: "jsx", TypeScript: "ts", TSX: "tsx",
  Python: "python", Cython: "python",
  HTML: "html", Vue: "html", "Angular Template": "html", XML: "xml", PHP: "php",
  CSS: "css", SCSS: "scss", LESS: "less", Sass: "sass", Stylus: "stylus",
  Java: "java", C: "c", "Objective-C": "c", "C++": "cpp", "Objective-C++": "cpp", "C#": "csharp",
  Go: "go", Rust: "rust", Kotlin: "kotlin", Swift: "swift", Ruby: "ruby", Dart: "dart",
  SQL: "sql", MySQL: "sql", PostgreSQL: "sql", SQLite: "sql", "MS SQL": "sql", "MariaDB SQL": "sql", PLSQL: "sql",
  Shell: "shell", Markdown: "markdown", Lua: "lua",
};
