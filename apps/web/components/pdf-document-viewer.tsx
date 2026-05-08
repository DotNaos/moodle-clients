"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  PDFPageContext,
  PDFScrollCommand,
  PDFViewState,
} from "@/lib/pdf-context";

type PDFJS = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 3.5;
const ZOOM_STEP = 0.15;

export function PDFDocumentViewer({
  courseId,
  materialId,
  scrollCommand,
  title,
  url,
  onStateChange,
}: {
  courseId: string | null;
  materialId: string;
  scrollCommand: PDFScrollCommand | null;
  title: string;
  url: string;
  onStateChange: (state: PDFViewState | null) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState<Record<number, PDFPageContext>>({});
  const [currentViewImageDataURL, setCurrentViewImageDataURL] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const zoomRef = useRef(zoom);
  const gestureBaseZoomRef = useRef(zoom);
  const dragRef = useRef<{
    pointerId: number;
    scrollLeft: number;
    scrollTop: number;
    x: number;
    y: number;
  } | null>(null);
  const captureTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setPageCount(0);
    setCurrentPage(1);
    setPages({});
    setCurrentViewImageDataURL(null);
    setZoom(1);
    setPanning(false);
    setError(null);
    onStateChange(null);

    async function loadPDF() {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
        const document = await pdfjs.getDocument({ url } as Parameters<PDFJS["getDocument"]>[0]).promise;
        if (cancelled) {
          return;
        }
        setPdf(document);
        setPageCount(document.numPages);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load PDF.");
        }
      }
    }

    void loadPDF();

    return () => {
      cancelled = true;
    };
  }, [onStateChange, url]);

  useEffect(() => {
    if (!pageCount) {
      return;
    }

    onStateChange({
      courseId,
      materialId,
      title,
      currentPage,
      pageCount,
      currentViewImageDataURL,
      pages: Object.values(pages).sort((left, right) => left.page - right.page),
    });
  }, [courseId, currentPage, currentViewImageDataURL, materialId, onStateChange, pageCount, pages, title]);

  useEffect(() => {
    if (!scrollCommand || !pageCount) {
      return;
    }

    const page = Math.min(Math.max(scrollCommand.page, 1), pageCount);
    pageRefs.current[page]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(page);
  }, [pageCount, scrollCommand]);

  const captureCurrentView = useCallback(() => {
    const container = containerRef.current;
    const pageElement = pageRefs.current[currentPage];
    const canvas = pageElement?.querySelector("canvas");
    if (!container || !canvas) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const left = Math.max(containerRect.left, canvasRect.left);
    const top = Math.max(containerRect.top, canvasRect.top);
    const right = Math.min(containerRect.right, canvasRect.right);
    const bottom = Math.min(containerRect.bottom, canvasRect.bottom);
    const width = right - left;
    const height = bottom - top;
    if (width < 32 || height < 32) {
      return;
    }

    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const sourceX = Math.max(0, Math.floor((left - canvasRect.left) * scaleX));
    const sourceY = Math.max(0, Math.floor((top - canvasRect.top) * scaleY));
    const sourceWidth = Math.min(canvas.width - sourceX, Math.floor(width * scaleX));
    const sourceHeight = Math.min(canvas.height - sourceY, Math.floor(height * scaleY));
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return;
    }

    const maxWidth = 1200;
    const outputScale = Math.min(1, maxWidth / sourceWidth);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = Math.floor(sourceWidth * outputScale);
    outputCanvas.height = Math.floor(sourceHeight * outputScale);
    const context = outputCanvas.getContext("2d");
    if (!context) {
      return;
    }
    context.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height,
    );
    setCurrentViewImageDataURL(outputCanvas.toDataURL("image/jpeg", 0.68));
  }, [currentPage]);

  useEffect(() => {
    captureCurrentView();
  }, [captureCurrentView, currentPage, pages, zoom]);

  const scheduleCurrentViewCapture = useCallback(() => {
    if (captureTimeoutRef.current) {
      window.clearTimeout(captureTimeoutRef.current);
    }
    captureTimeoutRef.current = window.setTimeout(captureCurrentView, 120);
  }, [captureCurrentView]);

  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) {
        window.clearTimeout(captureTimeoutRef.current);
      }
    };
  }, []);

  const updateZoom = useCallback((nextZoom: number, anchor?: { x: number; y: number }) => {
    const container = containerRef.current;
    const previousZoom = zoom;
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(clampedZoom - previousZoom) < 0.001) {
      return;
    }

    if (!container || !anchor) {
      setZoom(clampedZoom);
      return;
    }

    const rect = container.getBoundingClientRect();
    const offsetX = anchor.x - rect.left;
    const offsetY = anchor.y - rect.top;
    const scrollX = container.scrollLeft + offsetX;
    const scrollY = container.scrollTop + offsetY;
    const ratio = clampedZoom / previousZoom;

    setZoom(clampedZoom);
    window.requestAnimationFrame(() => {
      container.scrollLeft = scrollX * ratio - offsetX;
      container.scrollTop = scrollY * ratio - offsetY;
      scheduleCurrentViewCapture();
    });
  }, [scheduleCurrentViewCapture, zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const viewer = container;

    function handleNativeWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const zoomFactor = Math.exp(-event.deltaY * 0.01);
      updateZoom(zoomRef.current * zoomFactor, { x: event.clientX, y: event.clientY });
    }

    function handleGestureStart(event: Event) {
      event.preventDefault();
      gestureBaseZoomRef.current = zoomRef.current;
    }

    function handleGestureChange(event: Event) {
      const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
      event.preventDefault();
      const rect = viewer.getBoundingClientRect();
      updateZoom(gestureBaseZoomRef.current * (gesture.scale ?? 1), {
        x: gesture.clientX ?? rect.left + rect.width / 2,
        y: gesture.clientY ?? rect.top + rect.height / 2,
      });
    }

    viewer.addEventListener("wheel", handleNativeWheel, { passive: false });
    viewer.addEventListener("gesturestart", handleGestureStart, { passive: false });
    viewer.addEventListener("gesturechange", handleGestureChange, { passive: false });

    return () => {
      viewer.removeEventListener("wheel", handleNativeWheel);
      viewer.removeEventListener("gesturestart", handleGestureStart);
      viewer.removeEventListener("gesturechange", handleGestureChange);
    };
  }, [updateZoom]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || zoom <= 1.01) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      x: event.clientX,
      y: event.clientY,
    };
    setPanning(true);
    container.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    container.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    container.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    scheduleCurrentViewCapture();
  }

  function stopDragging(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setPanning(false);
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
    scheduleCurrentViewCapture();
  }

  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );

  if (error) {
    return (
      <div className="grid h-full min-h-[520px] place-items-center bg-card px-6 text-center">
        <div className="max-w-sm">
          <p className="font-medium">PDF preview unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!pdf) {
    return <PDFLoading />;
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-muted">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-2">
        <p className="text-sm text-muted-foreground">
          Page {currentPage} / {pageCount}
        </p>
        <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
          <Button
            aria-label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => updateZoom(zoom - ZOOM_STEP)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Minus data-icon="icon" aria-hidden />
          </Button>
          <button
            className="min-w-16 rounded-full px-2 text-center text-sm font-medium text-muted-foreground"
            onClick={() => updateZoom(1)}
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            aria-label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => updateZoom(zoom + ZOOM_STEP)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus data-icon="icon" aria-hidden />
          </Button>
          <Button
            aria-label="Fit to width"
            onClick={() => updateZoom(1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Maximize2 data-icon="icon" aria-hidden />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-5 [touch-action:none] data-[pannable=true]:cursor-grab data-[panning=true]:cursor-grabbing"
        data-pannable={zoom > 1.01}
        data-panning={panning}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onScroll={scheduleCurrentViewCapture}
      >
        <div className="mx-auto flex w-fit min-w-full flex-col items-center gap-5">
          {pageNumbers.map((page) => (
            <PDFPageCanvas
              key={page}
              container={containerRef.current}
              onCurrentPage={setCurrentPage}
              onRendered={(pageContext) =>
                setPages((current) => ({ ...current, [pageContext.page]: pageContext }))
              }
              pageNumber={page}
              pdf={pdf}
              setPageRef={(element) => {
                pageRefs.current[page] = element;
              }}
              zoom={zoom}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PDFPageCanvas({
  container,
  onCurrentPage,
  onRendered,
  pageNumber,
  pdf,
  setPageRef,
  zoom,
}: {
  container: HTMLDivElement | null;
  onCurrentPage: (page: number) => void;
  onRendered: (page: PDFPageContext) => void;
  pageNumber: number;
  pdf: PDFDocumentProxy;
  setPageRef: (element: HTMLDivElement | null) => void;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPageRef(pageRef.current);
    return () => setPageRef(null);
  }, [setPageRef]);

  useEffect(() => {
    const element = pageRef.current;
    if (!element || !container) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onCurrentPage(pageNumber);
        }
      },
      { root: container, threshold: 0.55 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [container, onCurrentPage, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const page = await pdf.getPage(pageNumber);
      if (cancelled) {
        return;
      }
      const defaultViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max((container?.clientWidth ?? 900) - 32, 320);
      const fitScale = availableWidth / defaultViewport.width;
      const scale = fitScale * zoom;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cancelled) {
        onRendered({
          page: pageNumber,
          text,
          imageDataURL: capturePageImage(canvas),
        });
      }
    }

    void renderPage().catch((renderError) => {
      if (!cancelled && !isRenderCancelled(renderError)) {
        throw renderError;
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [container, onRendered, pageNumber, pdf, zoom]);

  return (
    <div ref={pageRef} className="mx-auto w-fit rounded-sm bg-card shadow-sm">
      <canvas ref={canvasRef} className="block max-w-none" />
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isRenderCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function capturePageImage(canvas: HTMLCanvasElement): string | null {
  const maxWidth = 1200;
  if (canvas.width <= maxWidth) {
    return canvas.toDataURL("image/jpeg", 0.64);
  }

  const scale = maxWidth / canvas.width;
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = maxWidth;
  previewCanvas.height = Math.floor(canvas.height * scale);
  const context = previewCanvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
  return previewCanvas.toDataURL("image/jpeg", 0.64);
}

function PDFLoading() {
  return (
    <div className="h-full min-h-[520px] bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        Loading PDF
      </div>
      <Skeleton className="h-full min-h-[460px] rounded-2xl" />
    </div>
  );
}
