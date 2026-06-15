"use client";

import { Check, Copy, Download, ExternalLink, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type React from "react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  buildPDFDownloadFilename,
  canWritePDFClipboardItem,
  fetchPDFBlob,
  startPDFDownload,
} from "@/lib/pdf-file-actions";
import type {
  PDFPageContext,
  PDFScrollCommand,
  PDFViewState,
} from "@/lib/pdf-context";

type PDFJS = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 3.5;
const ZOOM_STEP = 0.15;
const ZOOM_COMMIT_DELAY = 180;
const FLOAT_TRANSITION_MS = 320;
const FLOAT_INSET = 16;

type FloatState = "inline" | "opening" | "open" | "closing";
type PDFCopyStatus = "idle" | "copying" | "copied-file" | "downloaded" | "failed";

export function PDFDocumentViewer({
  allowFloat = false,
  courseId,
  embedded = false,
  externalUrl,
  expanded = false,
  materialId,
  onExpandedChange,
  scrollCommand,
  title,
  url,
  onStateChange,
}: {
  // Lets the viewer expand into a floating modal in place (same instance, no
  // reload) instead of delegating expansion to the parent.
  allowFloat?: boolean;
  courseId: string | null;
  // Hides the built-in title chrome for hosts that render their own header
  // (e.g. mobile bottom sheets).
  embedded?: boolean;
  externalUrl?: string;
  expanded?: boolean;
  materialId: string;
  onExpandedChange?: (expanded: boolean) => void;
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
  // `zoom` is the scale pdf.js rendered at; `visualZoom` is what the user sees.
  // Gestures only move `visualZoom` via cheap CSS zoom and commit to a crisp
  // re-render shortly after the gesture settles.
  const [zoom, setZoom] = useState(1);
  const [visualZoom, setVisualZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [floatState, setFloatState] = useState<FloatState>("inline");
  const [floatVisible, setFloatVisible] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>(undefined);
  const [copyStatus, setCopyStatus] = useState<PDFCopyStatus>("idle");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const zoomRef = useRef(zoom);
  const visualZoomRef = useRef(1);
  const gestureBaseZoomRef = useRef(1);
  const zoomCommitTimeoutRef = useRef<number | null>(null);
  const fitWidthTimeoutRef = useRef<number | null>(null);
  const floatTimeoutRef = useRef<number | null>(null);
  const copyStatusTimeoutRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    scrollLeft: number;
    scrollTop: number;
    x: number;
    y: number;
  } | null>(null);
  const captureTimeoutRef = useRef<number | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const downloadFilename = useMemo(() => buildPDFDownloadFilename(title), [title]);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setPageCount(0);
    setCurrentPage(1);
    setPages({});
    setCurrentViewImageDataURL(null);
    setZoom(1);
    setVisualZoom(1);
    zoomRef.current = 1;
    visualZoomRef.current = 1;
    setPanning(false);
    setError(null);
    setCopyStatus("idle");
    onStateChangeRef.current(null);

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
    // Only the document URL should trigger a reload; callback identity must not.
  }, [url]);

  useEffect(() => {
    if (!pageCount) {
      return;
    }

    onStateChangeRef.current({
      courseId,
      materialId,
      title,
      currentPage,
      pageCount,
      currentViewImageDataURL,
      pages: Object.values(pages).sort((left, right) => left.page - right.page),
    });
  }, [courseId, currentPage, currentViewImageDataURL, materialId, pageCount, pages, title]);

  // Keep the rendered pages fitted to the container; also refits after the
  // floating transition resizes the viewer.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    setFitWidth(container.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (!width) {
        return;
      }
      if (fitWidthTimeoutRef.current) {
        window.clearTimeout(fitWidthTimeoutRef.current);
      }
      fitWidthTimeoutRef.current = window.setTimeout(() => {
        setFitWidth((current) => (Math.abs(current - width) > 2 ? width : current));
      }, 140);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (fitWidthTimeoutRef.current) {
        window.clearTimeout(fitWidthTimeoutRef.current);
      }
    };
  }, [pdf]);

  const syncCurrentPageFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    let nextPage: number | null = null;
    let nextDistance = Number.POSITIVE_INFINITY;

    Object.entries(pageRefs.current).forEach(([page, element]) => {
      if (!element) {
        return;
      }

      const pageRect = element.getBoundingClientRect();
      const visible = pageRect.bottom > containerRect.top && pageRect.top < containerRect.bottom;
      if (!visible) {
        return;
      }

      const distance = Math.abs(pageRect.top - containerRect.top);
      if (distance < nextDistance) {
        nextDistance = distance;
        nextPage = Number(page);
      }
    });

    if (nextPage) {
      setCurrentPage(nextPage);
    }
  }, []);

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

  const scrollToPage = useCallback((page: number): boolean => {
    const container = containerRef.current;
    const pageElement = pageRefs.current[page];
    if (!container || !pageElement) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    container.scrollTop += pageRect.top - containerRect.top;
    setCurrentPage(page);
    scheduleCurrentViewCapture();
    return true;
  }, [scheduleCurrentViewCapture]);

  useEffect(() => {
    if (!scrollCommand || !pageCount) {
      return;
    }

    const page = Math.min(Math.max(scrollCommand.page, 1), pageCount);
    let attempts = 0;
    let animationFrame = 0;

    const run = () => {
      attempts += 1;
      if (scrollToPage(page) || attempts >= 10) {
        return;
      }
      animationFrame = window.requestAnimationFrame(run);
    };

    animationFrame = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [pageCount, scrollCommand, scrollToPage]);

  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) {
        window.clearTimeout(captureTimeoutRef.current);
      }
      if (zoomCommitTimeoutRef.current) {
        window.clearTimeout(zoomCommitTimeoutRef.current);
      }
      if (floatTimeoutRef.current) {
        window.clearTimeout(floatTimeoutRef.current);
      }
      if (copyStatusTimeoutRef.current) {
        window.clearTimeout(copyStatusTimeoutRef.current);
      }
    };
  }, []);

  const scheduleCopyStatusReset = useCallback(() => {
    if (copyStatusTimeoutRef.current) {
      window.clearTimeout(copyStatusTimeoutRef.current);
    }
    copyStatusTimeoutRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 2200);
  }, []);

  const copyPDF = useCallback(async () => {
    setCopyStatus("copying");
    try {
      if (!navigator.clipboard?.write || !canWritePDFClipboardItem(window.ClipboardItem)) {
        throw new Error("PDF clipboard is not supported.");
      }
      const blob = await fetchPDFBlob(url);
      await navigator.clipboard.write([new window.ClipboardItem({ "application/pdf": blob })]);
      setCopyStatus("copied-file");
    } catch {
      try {
        startPDFDownload(url, downloadFilename);
        setCopyStatus("downloaded");
      } catch {
        setCopyStatus("failed");
      }
    } finally {
      scheduleCopyStatusReset();
    }
  }, [downloadFilename, scheduleCopyStatusReset, url]);

  const scheduleZoomCommit = useCallback(() => {
    if (zoomCommitTimeoutRef.current) {
      window.clearTimeout(zoomCommitTimeoutRef.current);
    }
    zoomCommitTimeoutRef.current = window.setTimeout(() => {
      const next = visualZoomRef.current;
      zoomRef.current = next;
      setZoom(next);
      scheduleCurrentViewCapture();
    }, ZOOM_COMMIT_DELAY);
  }, [scheduleCurrentViewCapture]);

  // Cheap visual zoom (CSS) so trackpad pinches stay buttery; the crisp
  // pdf.js re-render happens in scheduleZoomCommit once the gesture settles.
  const applyVisualZoom = useCallback(
    (nextZoom: number, anchor?: { x: number; y: number }) => {
      const container = containerRef.current;
      const content = contentRef.current;
      const previous = visualZoomRef.current;
      const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(clamped - previous) < 0.0005) {
        return;
      }

      visualZoomRef.current = clamped;
      if (content) {
        content.style.zoom = String(clamped / zoomRef.current);
      }
      if (container && anchor) {
        const rect = container.getBoundingClientRect();
        const offsetX = anchor.x - rect.left;
        const offsetY = anchor.y - rect.top;
        const ratio = clamped / previous;
        container.scrollLeft = (container.scrollLeft + offsetX) * ratio - offsetX;
        container.scrollTop = (container.scrollTop + offsetY) * ratio - offsetY;
      }
      setVisualZoom(clamped);
      scheduleZoomCommit();
    },
    [scheduleZoomCommit],
  );

  // Once the committed render catches up, the CSS zoom compensation collapses
  // back to 1 in the same layout pass as the resized canvases.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content) {
      content.style.zoom = String(visualZoomRef.current / zoom);
    }
  }, [zoom]);

  const applyVisualZoomAtCenter = useCallback(
    (nextZoom: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      applyVisualZoom(
        nextZoom,
        rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined,
      );
    },
    [applyVisualZoom],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pdf) {
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
      applyVisualZoom(visualZoomRef.current * zoomFactor, { x: event.clientX, y: event.clientY });
    }

    function handleGestureStart(event: Event) {
      event.preventDefault();
      gestureBaseZoomRef.current = visualZoomRef.current;
    }

    function handleGestureChange(event: Event) {
      const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
      event.preventDefault();
      const rect = viewer.getBoundingClientRect();
      applyVisualZoom(gestureBaseZoomRef.current * (gesture.scale ?? 1), {
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
  }, [applyVisualZoom, pdf]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyVisualZoomAtCenter(visualZoomRef.current + ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        applyVisualZoomAtCenter(visualZoomRef.current - ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        applyVisualZoomAtCenter(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [applyVisualZoomAtCenter]);

  // iOS/macOS-style float transition: the same viewer instance animates from
  // its inline frame to a centered modal, so nothing reloads.
  const floating = floatState !== "inline";

  const floatTargetStyle = useCallback((): CSSProperties => {
    return {
      top: FLOAT_INSET,
      left: FLOAT_INSET,
      width: window.innerWidth - FLOAT_INSET * 2,
      height: window.innerHeight - FLOAT_INSET * 2,
    };
  }, []);

  const openFloat = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || floatState !== "inline") {
      return;
    }
    const rect = shell.getBoundingClientRect();
    setFloatState("opening");
    setPanelStyle({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setFloatVisible(true);
        setPanelStyle(floatTargetStyle());
      });
    });
    if (floatTimeoutRef.current) {
      window.clearTimeout(floatTimeoutRef.current);
    }
    floatTimeoutRef.current = window.setTimeout(() => setFloatState("open"), FLOAT_TRANSITION_MS);
  }, [floatState, floatTargetStyle]);

  const closeFloat = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || (floatState !== "open" && floatState !== "opening")) {
      return;
    }
    const rect = shell.getBoundingClientRect();
    setFloatState("closing");
    setFloatVisible(false);
    setPanelStyle({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    if (floatTimeoutRef.current) {
      window.clearTimeout(floatTimeoutRef.current);
    }
    floatTimeoutRef.current = window.setTimeout(() => {
      setFloatState("inline");
      setPanelStyle(undefined);
    }, FLOAT_TRANSITION_MS);
  }, [floatState]);

  useEffect(() => {
    if (floatState !== "open") {
      return;
    }
    function handleResize() {
      setPanelStyle(floatTargetStyle());
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeFloat();
      }
    }
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleEscape, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [closeFloat, floatState, floatTargetStyle]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || visualZoomRef.current <= 1.01) {
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
    <div ref={shellRef} className="relative h-full min-h-0">
      {floating ? (
        <>
          <div
            aria-hidden
            className={cn(
              "fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300",
              floatVisible ? "opacity-100" : "opacity-0",
            )}
            onClick={closeFloat}
          />
          <button
            className="absolute inset-0 grid w-full place-items-center bg-muted text-xs text-muted-foreground"
            onClick={closeFloat}
            type="button"
          >
            PDF ist in der Großansicht geöffnet
          </button>
        </>
      ) : null}

      <div
        className={cn(
          "flex min-h-0 flex-col bg-muted",
          floating
            ? "fixed z-[60] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-border transition-[top,left,width,height,border-radius] duration-300 ease-[cubic-bezier(0.32,0.72,0.36,1)]"
            : "relative h-full",
        )}
        style={floating ? panelStyle : undefined}
      >
        {!embedded ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-muted via-muted/70 to-transparent"
            />
            <div className={cn("pointer-events-none absolute inset-x-0 top-0 z-20 flex items-baseline gap-2 px-4 pt-3", floating && "pr-14")}>
              <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">{title}</h3>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {currentPage} / {pageCount}
              </span>
            </div>
          </>
        ) : null}
        {floating ? (
          <button
            aria-label="Großansicht schließen"
            className="absolute right-3 top-2.5 z-30 grid size-8 place-items-center rounded-full bg-background/90 text-muted-foreground shadow-md backdrop-blur-md transition-colors hover:text-foreground"
            onClick={closeFloat}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}

        <div
          ref={containerRef}
          className={cn(
            "min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-16 [-webkit-overflow-scrolling:touch] data-[pannable=true]:cursor-grab data-[panning=true]:cursor-grabbing sm:px-4",
            embedded ? "pt-3" : "pt-12",
            visualZoom > 1.01 ? "[touch-action:none]" : "[touch-action:pan-y_pinch-zoom]",
          )}
          data-pannable={visualZoom > 1.01}
          data-panning={panning}
          onPointerCancel={stopDragging}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onScroll={() => {
            syncCurrentPageFromScroll();
            scheduleCurrentViewCapture();
          }}
        >
          <div ref={contentRef} className="mx-auto flex w-fit min-w-full flex-col items-center gap-5">
            {pageNumbers.map((page) => (
              <PDFPageCanvas
                key={page}
                fitWidth={fitWidth}
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

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full bg-background/90 p-1 shadow-lg ring-1 ring-border/60 backdrop-blur-md">
            <Button
              aria-label="Kleiner zoomen"
              disabled={visualZoom <= MIN_ZOOM}
              onClick={() => applyVisualZoomAtCenter(visualZoomRef.current - ZOOM_STEP)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Minus aria-hidden />
            </Button>
            <button
              aria-label="Zoom zurücksetzen"
              className="min-w-13 rounded-full px-1.5 text-center text-sm font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => applyVisualZoomAtCenter(1)}
              type="button"
            >
              {Math.round(visualZoom * 100)}%
            </button>
            <Button
              aria-label="Größer zoomen"
              disabled={visualZoom >= MAX_ZOOM}
              onClick={() => applyVisualZoomAtCenter(visualZoomRef.current + ZOOM_STEP)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus aria-hidden />
            </Button>
            {allowFloat || onExpandedChange ? (
              <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
            ) : null}
            {allowFloat ? (
              <Button
                aria-label={floating ? "Großansicht schließen" : "Großansicht öffnen"}
                onClick={() => (floating ? closeFloat() : openFloat())}
                size="icon"
                type="button"
                variant="ghost"
              >
                {floating ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              </Button>
            ) : onExpandedChange ? (
              <Button
                aria-label={expanded ? "Popup verkleinern" : "Popup maximieren"}
                onClick={() => onExpandedChange(!expanded)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              </Button>
            ) : null}
            <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
            <Button asChild aria-label="PDF herunterladen" size="icon" title="PDF herunterladen" variant="ghost">
              <a download={downloadFilename} href={url}>
                <Download aria-hidden />
              </a>
            </Button>
            <Button
              aria-label={copyButtonAriaLabel(copyStatus)}
              disabled={copyStatus === "copying"}
              onClick={() => void copyPDF()}
              size="icon"
              title={copyButtonTitle(copyStatus)}
              type="button"
              variant="ghost"
            >
              {copyStatus === "copied-file" || copyStatus === "downloaded" ? (
                <Check aria-hidden />
              ) : (
                <Copy aria-hidden />
              )}
            </Button>
            {externalUrl ? (
              <Button asChild aria-label="In Moodle öffnen" size="icon" variant="ghost">
                <a href={externalUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function copyButtonAriaLabel(status: PDFCopyStatus): string {
  switch (status) {
    case "copying":
      return "PDF wird kopiert";
    case "copied-file":
      return "PDF kopiert";
    case "downloaded":
      return "PDF-Download gestartet";
    case "failed":
      return "PDF konnte nicht kopiert werden";
    default:
      return "PDF kopieren";
  }
}

function copyButtonTitle(status: PDFCopyStatus): string {
  switch (status) {
    case "copying":
      return "PDF wird kopiert";
    case "copied-file":
      return "PDF kopiert";
    case "downloaded":
      return "Browser erlaubt kein PDF-Clipboard, Download gestartet";
    case "failed":
      return "PDF konnte nicht kopiert werden";
    default:
      return "PDF kopieren";
  }
}

function PDFPageCanvas({
  fitWidth,
  onRendered,
  pageNumber,
  pdf,
  setPageRef,
  zoom,
}: {
  fitWidth: number;
  onRendered: (page: PDFPageContext) => void;
  pageNumber: number;
  pdf: PDFDocumentProxy;
  setPageRef: (element: HTMLDivElement | null) => void;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const baseSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setPageRef(pageRef.current);
    return () => setPageRef(null);
  }, [setPageRef]);

  // Pre-size the canvas synchronously from the last known page dimensions so
  // a zoom commit swaps in without a visible size jump while pdf.js renders.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const base = baseSizeRef.current;
    if (!canvas || !base || !fitWidth) {
      return;
    }
    const availableWidth = Math.max(fitWidth - 32, 320);
    const scale = (availableWidth / base.width) * zoom;
    canvas.style.width = `${Math.floor(base.width * scale)}px`;
    canvas.style.height = `${Math.floor(base.height * scale)}px`;
  }, [fitWidth, zoom]);

  useEffect(() => {
    if (!fitWidth) {
      return;
    }
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
      baseSizeRef.current = { width: defaultViewport.width, height: defaultViewport.height };
      const availableWidth = Math.max(fitWidth - 32, 320);
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
      const text = await readPageText(page);

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
        console.warn(`Could not render PDF page ${pageNumber}.`, renderError);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [fitWidth, onRendered, pageNumber, pdf, zoom]);

  return (
    <div ref={pageRef} className="mx-auto w-fit rounded-sm bg-card shadow-sm">
      <canvas ref={canvasRef} className="block max-w-none" />
    </div>
  );
}

async function readPageText(page: PDFPageProxy): Promise<string> {
  try {
    const textContent = await page.getTextContent();
    return textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (textError) {
    console.warn("Could not read PDF page text.", textError);
    return "";
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
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
    <div className="relative h-full min-h-[520px] bg-muted p-3">
      <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full bg-background/92 px-3 py-2 text-sm text-muted-foreground shadow-lg backdrop-blur-md">
        <Spinner aria-hidden />
        Loading PDF
      </div>
      <Skeleton className="h-full min-h-[496px] rounded-[1.5rem]" />
    </div>
  );
}
