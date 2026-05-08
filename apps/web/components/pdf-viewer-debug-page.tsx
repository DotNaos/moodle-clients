"use client";

import { FileText } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { PDFDocumentViewer } from "@/components/pdf-document-viewer";
import { Button } from "@/components/ui/button";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";

const MOCK_PDFS = [
  {
    id: "portrait-text",
    name: "Portrait Text Fixture",
    url: "/mock-pdfs/portrait-text.pdf",
  },
  {
    id: "wide-slide",
    name: "Wide Slide Fixture",
    url: "/mock-pdfs/wide-slide.pdf",
  },
] as const;

export function PDFViewerDebugPage() {
  useHideClerkDevOverlay();

  const [selectedId, setSelectedId] = useState<(typeof MOCK_PDFS)[number]["id"]>("portrait-text");
  const [pdfState, setPDFState] = useState<PDFViewState | null>(null);
  const [scrollCommand, setScrollCommand] = useState<PDFScrollCommand | null>(null);

  const selectedPDF = useMemo(
    () => MOCK_PDFS.find((pdf) => pdf.id === selectedId) ?? MOCK_PDFS[0],
    [selectedId],
  );

  return (
    <main className="flex h-dvh min-h-0 flex-col bg-background p-4">
      <header className="flex shrink-0 items-center justify-between gap-4 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText data-icon="inline-start" aria-hidden />
            <h1 className="truncate text-xl font-semibold tracking-tight">PDF viewer debug</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Local fixture page for zoom, pan, screenshots, and page tracking.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {MOCK_PDFS.map((pdf) => (
            <Button
              key={pdf.id}
              onClick={() => setSelectedId(pdf.id)}
              type="button"
              variant={selectedPDF.id === pdf.id ? "default" : "secondary"}
            >
              {pdf.name}
            </Button>
          ))}
        </div>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_18rem] gap-4">
        <div className="min-h-0 overflow-hidden rounded-[2rem] bg-card">
          <PDFDocumentViewer
            key={selectedPDF.id}
            courseId="mock-course"
            materialId={selectedPDF.id}
            onStateChange={setPDFState}
            scrollCommand={scrollCommand}
            title={selectedPDF.name}
            url={selectedPDF.url}
          />
        </div>

        <aside className="flex min-h-0 flex-col rounded-[2rem] bg-card p-4">
          <h2 className="text-sm font-semibold tracking-tight">Debug state</h2>
          <div className="mt-4 flex flex-col gap-2">
            {[1, 2, 3, 4].map((page) => (
              <Button
                key={page}
                disabled={!pdfState || page > pdfState.pageCount}
                onClick={() => setScrollCommand({ id: Date.now(), page })}
                type="button"
                variant="secondary"
              >
                Scroll to page {page}
              </Button>
            ))}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <StateLabel>Current page</StateLabel>
            <StateValue>{pdfState?.currentPage ?? "-"}</StateValue>
            <StateLabel>Pages</StateLabel>
            <StateValue>{pdfState?.pageCount ?? "-"}</StateValue>
            <StateLabel>Captured view</StateLabel>
            <StateValue>{pdfState?.currentViewImageDataURL ? "yes" : "no"}</StateValue>
            <StateLabel>Page text</StateLabel>
            <StateValue>{pdfState?.pages.length ?? 0}</StateValue>
          </dl>
          <div className="mt-5 min-h-0 flex-1 overflow-auto rounded-[1.25rem] bg-secondary p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
              {JSON.stringify(
                {
                  title: pdfState?.title,
                  currentPage: pdfState?.currentPage,
                  pageCount: pdfState?.pageCount,
                  pages: pdfState?.pages.map((page) => ({
                    page: page.page,
                    text: page.text.slice(0, 120),
                    hasImage: Boolean(page.imageDataURL),
                  })),
                },
                null,
                2,
              )}
            </pre>
          </div>
        </aside>
      </section>
    </main>
  );
}

function useHideClerkDevOverlay() {
  useEffect(() => {
    function hideOverlay() {
      const element = document.getElementById("clerk-components");
      if (!element) {
        return;
      }
      element.style.display = "none";
      element.style.pointerEvents = "none";
    }

    hideOverlay();
    const observer = new MutationObserver(hideOverlay);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

function StateLabel({ children }: { children: React.ReactNode }) {
  return <dt className="text-muted-foreground">{children}</dt>;
}

function StateValue({ children }: { children: React.ReactNode }) {
  return <dd className="text-right font-medium text-foreground">{children}</dd>;
}
