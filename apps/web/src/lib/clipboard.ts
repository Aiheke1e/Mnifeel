export async function readClipboardText(): Promise<string> {
  return navigator.clipboard.readText();
}

export async function writeClipboardText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
