export type ClipboardItemConstructor = {
  new (items: Record<string, Blob>): ClipboardItem;
  supports?: (type: string) => boolean;
};

export function buildPDFDownloadFilename(title: string): string {
  const withoutExtension = title.replace(/\.pdf$/i, "");
  const cleaned = withoutExtension
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = cleaned.replace(/\s/g, "-").slice(0, 96);
  return `${compact || "moodle-pdf"}.pdf`;
}

export function canWritePDFClipboardItem(
  ClipboardItemCtor: ClipboardItemConstructor | undefined = globalThis.ClipboardItem,
): ClipboardItemCtor is ClipboardItemConstructor {
  if (!ClipboardItemCtor) {
    return false;
  }
  return typeof ClipboardItemCtor.supports !== "function" || ClipboardItemCtor.supports("application/pdf");
}

export async function fetchPDFBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`PDF request failed with ${response.status}`);
  }
  const blob = await response.blob();
  return blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
}

export function startPDFDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
