type FileSystemWritable = {
  close: () => Promise<void>;
  write: (data: Blob) => Promise<void>;
};

type SaveFilePickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{
        accept: Record<string, string[]>;
        description: string;
      }>;
    }) => Promise<{
      createWritable: () => Promise<FileSystemWritable>;
    }>;
  };

export type DownloadResult = "cancelled" | "downloaded" | "saved";

function getFileExtension(filename: string) {
  const match = filename.match(/(\.[a-zA-Z0-9]+)$/);
  return match?.[1] || "";
}

function getBlobMimeType(blob: Blob) {
  return blob.type.split(";")[0] || "application/octet-stream";
}

async function saveBlobWithPicker(filename: string, blob: Blob) {
  const pickerWindow = window as SaveFilePickerWindow;
  if (!pickerWindow.showSaveFilePicker) return null;

  const fileHandle = await pickerWindow.showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        accept: {
          [getBlobMimeType(blob)]: [getFileExtension(filename)].filter(Boolean),
        },
        description: "Download file",
      },
    ],
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return "saved" as const;
}

function downloadBlobWithAnchor(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
  return "downloaded" as const;
}

export async function downloadBlob(
  filename: string,
  blob: Blob,
): Promise<DownloadResult> {
  try {
    const pickerResult = await saveBlobWithPicker(filename, blob);
    if (pickerResult) return pickerResult;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return "cancelled";
    }
  }

  return downloadBlobWithAnchor(filename, blob);
}

export function downloadText(filename: string, text: string, type: string) {
  return downloadBlob(filename, new Blob([text], { type }));
}
