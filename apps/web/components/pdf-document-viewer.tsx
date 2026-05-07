"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  PDFPageContext,
  PDFScrollCommand,
  PDFViewState,
} from "@/lib/pdf-context";

type PDFJS = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

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
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setPageCount(0);
    setCurrentPage(1);
    setPages({});
    setError(null);
    onStateChange(null);

    async function loadPDF() {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const document = await pdfjs.getDocument({ url, disableWorker: true } as Parameters<PDFJS["getDocument"]>[0]).promise;
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
      pages: Object.values(pages).sort((left, right) => left.page - right.page),
    });
  }, [courseId, currentPage, materialId, onStateChange, pageCount, pages, title]);

  useEffect(() => {
    if (!scrollCommand || !pageCount) {
      return;
    }

    const page = Math.min(Math.max(scrollCommand.page, 1), pageCount);
    pageRefs.current[page]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(page);
  }, [pageCount, scrollCommand]);

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
    <div ref={containerRef} className="h-full min-h-[520px] overflow-auto bg-muted px-4 py-5">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
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
          />
        ))}
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
}: {
  container: HTMLDivElement | null;
  onCurrentPage: (page: number) => void;
  onRendered: (page: PDFPageContext) => void;
  pageNumber: number;
  pdf: PDFDocumentProxy;
  setPageRef: (element: HTMLDivElement | null) => void;
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

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const page = await pdf.getPage(pageNumber);
      const defaultViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max((container?.clientWidth ?? 900) - 32, 320);
      const scale = Math.min(1.6, availableWidth / defaultViewport.width);
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

      await page.render({ canvas, canvasContext: context, viewport }).promise;
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

    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [container, onRendered, pageNumber, pdf]);

  return (
    <div ref={pageRef} className="mx-auto w-fit rounded-sm bg-card shadow-sm">
      <canvas ref={canvasRef} className="block max-w-full" />
    </div>
  );
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
