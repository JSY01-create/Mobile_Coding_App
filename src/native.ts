// Android app (Capacitor) integrations. In a browser these all fall back to web APIs.
import { App } from "@capacitor/app";
import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Share } from "@capacitor/share";

export const isNative = Capacitor.isNativePlatform();

export async function nativeCopy(text: string): Promise<boolean> {
  if (!isNative) return false;
  try {
    await Clipboard.write({ string: text });
    return true;
  } catch {
    return false;
  }
}

/** Text on the system clipboard, or null when it can't be read. */
export async function nativePaste(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const { type, value } = await Clipboard.read();
    return type.startsWith("text") ? value : null;
  } catch {
    return null;
  }
}

/** Saves a copy of the file and opens the share sheet (save to Files, Drive, send...). */
export async function nativeShareFile(name: string, content: string): Promise<boolean> {
  if (!isNative) return false;
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: `Save or send ${name}` });
  } catch (e) {
    // Closing the share sheet without picking anything is not an error.
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
  }
  return true;
}

/** Like nativeShareFile, for binary data such as a zip. */
export async function nativeShareBytes(name: string, bytes: Uint8Array): Promise<boolean> {
  if (!isNative) return false;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const { uri } = await Filesystem.writeFile({ path: name, data: btoa(bin), directory: Directory.Cache });
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: `Save or send ${name}` });
  } catch (e) {
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
  }
  return true;
}

export function nativeTap(): void {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Android back button: run `handler`; when it returns false, the app goes to the background. */
export function onBackButton(handler: () => boolean): void {
  if (!isNative) return;
  void App.addListener("backButton", () => {
    if (!handler()) void App.minimizeApp();
  });
}
