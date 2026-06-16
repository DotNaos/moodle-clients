import { describe, expect, test } from "bun:test";

import {
  buildPDFDownloadFilename,
  canWritePDFClipboardItem,
  canWritePNGClipboardItem,
  type ClipboardItemConstructor,
} from "@/lib/pdf-file-actions";

describe("PDF file actions", () => {
  test("builds safe download filenames", () => {
    expect(buildPDFDownloadFilename("Aufgabenblatt 01.pdf")).toBe("Aufgabenblatt-01.pdf");
    expect(buildPDFDownloadFilename('Lösung: A/B * final')).toBe("Lösung-A-B-final.pdf");
    expect(buildPDFDownloadFilename("   ")).toBe("moodle-pdf.pdf");
  });

  test("detects whether the browser can write PDF clipboard items", () => {
    const supporting = class {
      static supports(type: string) {
        return type === "application/pdf";
      }
    } as unknown as ClipboardItemConstructor;
    const unsupported = class {
      static supports() {
        return false;
      }
    } as unknown as ClipboardItemConstructor;

    expect(canWritePDFClipboardItem(supporting)).toBe(true);
    expect(canWritePDFClipboardItem(unsupported)).toBe(false);
    expect(canWritePDFClipboardItem(undefined)).toBe(false);
  });

  test("detects whether the browser can write PNG clipboard items", () => {
    const supporting = class {
      static supports(type: string) {
        return type === "image/png";
      }
    } as unknown as ClipboardItemConstructor;
    const unsupported = class {
      static supports() {
        return false;
      }
    } as unknown as ClipboardItemConstructor;

    expect(canWritePNGClipboardItem(supporting)).toBe(true);
    expect(canWritePNGClipboardItem(unsupported)).toBe(false);
    expect(canWritePNGClipboardItem(undefined)).toBe(false);
  });
});
