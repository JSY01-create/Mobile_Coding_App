// The system clipboard is not always reachable (permissions, embedded
// frames). An in-app copy keeps copy and paste working inside the editor.
let internal = "";

export async function writeClipboard(text: string): Promise<boolean> {
  internal = text;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readClipboard(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) return text;
  } catch {
    // Fall through to the in-app copy.
  }
  return internal;
}
