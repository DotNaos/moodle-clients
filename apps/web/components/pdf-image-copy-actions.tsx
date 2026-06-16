"use client";

import { Camera, Check, Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { canvasToPNGBlob, writePNGBlobToClipboard } from "@/lib/pdf-file-actions";

type PNGCopyStatus = "idle" | "copying" | "copied" | "failed";

export function PDFImageCopyActions({
  getCurrentPageCanvas,
}: {
  getCurrentPageCanvas: () => HTMLCanvasElement | null;
}) {
  const [pageImageCopyStatus, setPageImageCopyStatus] = useState<PNGCopyStatus>("idle");
  const [viewportCopyStatus, setViewportCopyStatus] = useState<PNGCopyStatus>("idle");
  const pageImageCopyStatusTimeoutRef = useRef<number | null>(null);
  const viewportCopyStatusTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pageImageCopyStatusTimeoutRef.current) {
        window.clearTimeout(pageImageCopyStatusTimeoutRef.current);
      }
      if (viewportCopyStatusTimeoutRef.current) {
        window.clearTimeout(viewportCopyStatusTimeoutRef.current);
      }
    };
  }, []);

  const schedulePageImageCopyStatusReset = useCallback(() => {
    if (pageImageCopyStatusTimeoutRef.current) {
      window.clearTimeout(pageImageCopyStatusTimeoutRef.current);
    }
    pageImageCopyStatusTimeoutRef.current = window.setTimeout(() => {
      setPageImageCopyStatus("idle");
    }, 2200);
  }, []);

  const scheduleViewportCopyStatusReset = useCallback(() => {
    if (viewportCopyStatusTimeoutRef.current) {
      window.clearTimeout(viewportCopyStatusTimeoutRef.current);
    }
    viewportCopyStatusTimeoutRef.current = window.setTimeout(() => {
      setViewportCopyStatus("idle");
    }, 2200);
  }, []);

  const copyCurrentPDFPageImage = useCallback(async () => {
    setPageImageCopyStatus("copying");
    try {
      const canvas = getCurrentPageCanvas();
      if (!canvas) {
        throw new Error("Current PDF page is not rendered.");
      }
      const blob = await canvasToPNGBlob(canvas);
      await writePNGBlobToClipboard(blob);
      setPageImageCopyStatus("copied");
    } catch (copyError) {
      console.warn("Could not copy current PDF page image.", copyError);
      setPageImageCopyStatus("failed");
    } finally {
      schedulePageImageCopyStatusReset();
    }
  }, [getCurrentPageCanvas, schedulePageImageCopyStatusReset]);

  const copyViewportImage = useCallback(async () => {
    setViewportCopyStatus("copying");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(document.body, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        height: window.innerHeight,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        style: {
          height: `${window.innerHeight}px`,
          overflow: "hidden",
          width: `${window.innerWidth}px`,
        },
        width: window.innerWidth,
      });
      if (!blob) {
        throw new Error("Could not create viewport image.");
      }
      await writePNGBlobToClipboard(blob);
      setViewportCopyStatus("copied");
    } catch (copyError) {
      console.warn("Could not copy viewport image.", copyError);
      setViewportCopyStatus("failed");
    } finally {
      scheduleViewportCopyStatusReset();
    }
  }, [scheduleViewportCopyStatusReset]);

  return (
    <>
      <Button
        aria-label={pngCopyButtonAriaLabel(pageImageCopyStatus, "Aktuelle PDF-Seite als PNG kopieren")}
        disabled={pageImageCopyStatus === "copying"}
        onClick={() => void copyCurrentPDFPageImage()}
        size="icon"
        title={pngCopyButtonTitle(pageImageCopyStatus, "Aktuelle PDF-Seite als PNG kopieren")}
        type="button"
        variant="ghost"
      >
        {pageImageCopyStatus === "copied" ? <Check aria-hidden /> : <ImageIcon aria-hidden />}
      </Button>
      <Button
        aria-label={pngCopyButtonAriaLabel(viewportCopyStatus, "Website-Viewport als PNG kopieren")}
        disabled={viewportCopyStatus === "copying"}
        onClick={() => void copyViewportImage()}
        size="icon"
        title={pngCopyButtonTitle(viewportCopyStatus, "Website-Viewport als PNG kopieren")}
        type="button"
        variant="ghost"
      >
        {viewportCopyStatus === "copied" ? <Check aria-hidden /> : <Camera aria-hidden />}
      </Button>
    </>
  );
}

function pngCopyButtonAriaLabel(status: PNGCopyStatus, idleLabel: string): string {
  switch (status) {
    case "copying":
      return "PNG wird kopiert";
    case "copied":
      return "PNG kopiert";
    case "failed":
      return "PNG konnte nicht kopiert werden";
    default:
      return idleLabel;
  }
}

function pngCopyButtonTitle(status: PNGCopyStatus, idleLabel: string): string {
  switch (status) {
    case "copying":
      return "PNG wird kopiert";
    case "copied":
      return "PNG kopiert";
    case "failed":
      return "PNG konnte nicht kopiert werden";
    default:
      return idleLabel;
  }
}
