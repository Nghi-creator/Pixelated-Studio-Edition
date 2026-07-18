type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
};

export async function copyTextToClipboard(
  text: string,
  {
    clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined,
    documentRef = typeof document !== "undefined" ? document : undefined,
  }: {
    clipboard?: ClipboardWriter;
    documentRef?: Document;
  } = {},
) {
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through for browsers that expose Clipboard API but deny the call.
    }
  }

  if (!documentRef?.body || typeof documentRef.execCommand !== "function") {
    return false;
  }

  const previouslyFocused = documentRef.activeElement;
  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  documentRef.body.appendChild(textarea);
  textarea.select();

  try {
    return documentRef.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (
      typeof HTMLElement !== "undefined" &&
      previouslyFocused instanceof HTMLElement
    ) {
      previouslyFocused.focus();
    }
  }
}
