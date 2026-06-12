"use client";

import { AlertCircle, Boxes, CheckCircle2, FileImage, Gauge, ImageOff, RefreshCw, ScrollText, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PDFDocumentViewer } from "@/components/pdf-document-viewer";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { PDFScrollCommand } from "@/lib/pdf-context";
import { cn } from "@/lib/utils";

export type ExtractedDocumentsResponse = {
  courseId: string;
  runId: string;
  generatedAt: string;
  engine: string;
  artifactRoot?: string;
  summary: ExtractedDocumentsSummary;
  documents: PDFDocumentStructure[];
};

export type ExtractedDocumentsSummary = {
  totalDocuments: number;
  totalPages: number;
  totalBlocks: number;
  pagePreviewAssets: number;
  embeddedImageAssets: number;
  warnings: number;
  unknownBlocks: number;
};

export type PDFDocumentStructure = {
  id: string;
  resource: ExtractedDocumentResource;
  runId: string;
  engine: string;
  status: string;
  sourcePath?: string;
  extractedPath?: string;
  pages: PDFPageStructure[];
  assets: DocumentAsset[];
  diagnostics: ExtractedDocumentDiagnostics;
};

export type ExtractedDocumentResource = {
  id: string;
  name: string;
  type: string;
  resourceType?: string;
  fileType?: string;
  sectionId?: string;
  sectionName?: string;
};

export type PDFPageStructure = {
  id: string;
  pageNumber: number;
  text?: string;
  markdown?: string;
  previewAssetId?: string;
  blocks: DocumentBlock[];
  diagnostics?: PageDiagnostics;
};

export type DocumentBlock = {
  id: string;
  pageNumber: number;
  type: string;
  label?: string;
  text?: string;
  markdown?: string;
  assetId?: string;
  source?: string;
  confidence?: number;
};

export type DocumentAsset = {
  id: string;
  kind: string;
  path: string;
  pageNumber?: number;
  mimeType?: string;
  role?: string;
};

export type ExtractedDocumentDiagnostics = {
  pagesMissingText?: number[];
  visualOnlyPages?: number[];
  extractedImageAssets?: string[];
  unusedImageAssets?: string[];
  unknownBlocks?: string[];
  warnings?: string[];
};

export type PageDiagnostics = {
  missingText?: boolean;
  visualOnly?: boolean;
  warnings?: string[];
};

const LOW_CONFIDENCE_THRESHOLD = 0.68;

export function ExtractedDocumentInspector({
  courseId,
  documents,
  error,
  loading,
  onLoad,
}: {
  courseId: string;
  documents: ExtractedDocumentsResponse | null;
  error: string | null;
  loading: boolean;
  onLoad: () => void;
}) {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  const [scrollCommand, setScrollCommand] = useState<PDFScrollCommand | null>(null);
  const [wideLayout, setWideLayout] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const documentList = documents?.documents ?? [];
  const selectedDocument = documentList.find((document) => document.id === selectedDocumentId) ?? documentList[0] ?? null;
  const selectedPage = selectedDocument?.pages.find((page) => page.pageNumber === selectedPageNumber)
    ?? selectedDocument?.pages[0]
    ?? null;
  const blockSummary = useMemo(() => buildBlockTypeSummary(documentList), [documentList]);
  const diagnosticCounts = useMemo(
    () => selectedDocument ? documentDiagnosticCounts(selectedDocument) : null,
    [selectedDocument],
  );

  useEffect(() => {
    if (!selectedDocument && selectedDocumentId) {
      setSelectedDocumentId(null);
      return;
    }
    if (selectedDocument && selectedDocument.id !== selectedDocumentId) {
      setSelectedDocumentId(selectedDocument.id);
    }
  }, [selectedDocument, selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocument) {
      setSelectedPageNumber(1);
      return;
    }
    const hasPage = selectedDocument.pages.some((page) => page.pageNumber === selectedPageNumber);
    if (!hasPage) {
      setSelectedPageNumber(selectedDocument.pages[0]?.pageNumber ?? 1);
    }
  }, [selectedDocument, selectedPageNumber]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) {
      return;
    }
    const updateLayout = () => setWideLayout(section.getBoundingClientRect().width >= 900);
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  function selectPage(pageNumber: number) {
    setSelectedPageNumber(pageNumber);
    setScrollCommand({ id: Date.now(), page: pageNumber });
  }

  return (
    <section className="rounded-3xl bg-secondary/40 px-5 py-4" ref={sectionRef}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Boxes aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            PDF-/Block-Inspector
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Sicht auf den Extracted-Stand: PDF links, erkannte Dokumentstruktur und Diagnose rechts.
          </p>
        </div>
        <Button className="w-fit" disabled={loading} onClick={onLoad} type="button" variant="secondary">
          {loading ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
          {documents ? "Neu laden" : "Extracted laden"}
        </Button>
      </div>

      {loading && !documents ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      ) : null}

      {error ? (
        <Alert className="mt-4 flex items-start gap-2">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      ) : null}

      {!loading && !documents && !error ? (
        <div className="mt-4 rounded-2xl bg-background/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
          Noch kein Extracted-Lauf geladen. Starte zuerst die Extraktion oder lade den letzten gespeicherten Extracted-Stand.
        </div>
      ) : null}

      {documents ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <StatPill label="PDFs" value={documents.summary.totalDocuments} />
            <StatPill label="Seiten" value={documents.summary.totalPages} />
            <StatPill label="Blöcke" value={documents.summary.totalBlocks} />
            <StatPill label="Bilder" value={documents.summary.embeddedImageAssets} />
            <StatPill label="Warnungen" value={documents.summary.warnings + documents.summary.unknownBlocks} tone={documents.summary.warnings + documents.summary.unknownBlocks > 0 ? "warning" : "default"} />
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <RunMeta label="Engine" value={documents.engine} />
            <RunMeta label="Run" value={documents.runId} />
            <RunMeta label="Erstellt" value={formatDateTime(documents.generatedAt)} />
          </div>

          {blockSummary.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {blockSummary.map((item) => (
                <Badge key={item.type} variant={item.type === "unknown" ? "destructive" : "secondary"}>
                  {blockTypeLabel(item.type)} · {item.count}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className={cn("grid gap-4", wideLayout && "grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]")}>
            <div className="min-w-0">
              <DocumentPicker
                documents={documentList}
                selectedDocumentId={selectedDocument?.id ?? null}
                onSelect={(documentId) => {
                  const nextDocument = documentList.find((candidate) => candidate.id === documentId);
                  setSelectedDocumentId(documentId);
                  selectPage(nextDocument?.pages[0]?.pageNumber ?? 1);
                }}
              />

              {selectedDocument ? (
                <div className="mt-3 min-h-[520px] overflow-hidden rounded-3xl bg-background/70 p-2">
                  <PDFDocumentViewer
                    allowFloat
                    courseId={courseId}
                    materialId={selectedDocument.resource.id}
                    onStateChange={() => {}}
                    scrollCommand={scrollCommand}
                    title={selectedDocument.resource.name}
                    url={`/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(selectedDocument.resource.id)}/pdf`}
                  />
                </div>
              ) : null}
            </div>

            <div className="min-w-0 rounded-3xl bg-background/70 px-4 py-3">
              {selectedDocument && selectedPage ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{selectedDocument.resource.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedDocument.status} · {selectedDocument.pages.length} Seiten · {selectedDocument.assets.length} Assets
                      </p>
                    </div>
                    <DocumentHealth counts={diagnosticCounts} />
                  </div>

                  <PageTabs
                    pages={selectedDocument.pages}
                    selectedPageNumber={selectedPage.pageNumber}
                    diagnostics={selectedDocument.diagnostics}
                    onSelect={selectPage}
                  />

                  <PageDiagnosticsPanel document={selectedDocument} page={selectedPage} />

                  <div className="mt-4 flex flex-col gap-3">
                    {selectedPage.blocks.length > 0 ? (
                      selectedPage.blocks.map((block) => (
                        <DocumentBlockView
                          block={block}
                          isUnknown={selectedDocument.diagnostics.unknownBlocks?.includes(block.id) ?? block.type === "unknown"}
                          key={block.id}
                        />
                      ))
                    ) : (
                      <div className="rounded-2xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                        Keine Blöcke auf dieser Seite erkannt.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid min-h-72 place-items-center text-center text-sm text-muted-foreground">
                  Kein PDF für die Inspektion vorhanden.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DocumentPicker({
  documents,
  selectedDocumentId,
  onSelect,
}: {
  documents: PDFDocumentStructure[];
  selectedDocumentId: string | null;
  onSelect: (documentId: string) => void;
}) {
  if (documents.length === 0) {
    return null;
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {documents.map((document) => {
        const counts = documentDiagnosticCounts(document);
        const selected = document.id === selectedDocumentId;
        const hasIssues = counts.missingPages + counts.visualOnlyPages + counts.unknownBlocks + counts.unusedImages + counts.warnings > 0;
        return (
          <button
            className={cn(
              "min-w-56 rounded-2xl px-3 py-2 text-left text-sm transition-colors",
              selected ? "bg-primary text-primary-foreground" : "bg-background/70 text-foreground hover:bg-background",
            )}
            key={document.id}
            onClick={() => onSelect(document.id)}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-2">
              {hasIssues ? <TriangleAlert aria-hidden className="size-4 shrink-0" /> : <CheckCircle2 aria-hidden className="size-4 shrink-0" />}
              <span className="truncate font-medium">{document.resource.name}</span>
            </span>
            <span className={cn("mt-1 block text-xs", selected ? "text-primary-foreground/75" : "text-muted-foreground")}>
              {document.pages.length} Seiten · {document.assets.length} Assets
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PageTabs({
  diagnostics,
  pages,
  selectedPageNumber,
  onSelect,
}: {
  diagnostics: ExtractedDocumentDiagnostics;
  pages: PDFPageStructure[];
  selectedPageNumber: number;
  onSelect: (pageNumber: number) => void;
}) {
  return (
    <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
      {pages.map((page) => {
        const hasMissingText = diagnostics.pagesMissingText?.includes(page.pageNumber) || page.diagnostics?.missingText;
        const visualOnly = diagnostics.visualOnlyPages?.includes(page.pageNumber) || page.diagnostics?.visualOnly;
        const selected = page.pageNumber === selectedPageNumber;
        return (
          <button
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              (hasMissingText || visualOnly) && !selected && "bg-destructive/10 text-destructive hover:bg-destructive/15",
            )}
            key={page.id}
            onClick={() => onSelect(page.pageNumber)}
            type="button"
          >
            {hasMissingText || visualOnly ? <TriangleAlert aria-hidden className="size-3.5" /> : null}
            Seite {page.pageNumber}
          </button>
        );
      })}
    </div>
  );
}

function PageDiagnosticsPanel({ document, page }: { document: PDFDocumentStructure; page: PDFPageStructure }) {
  const missingText = document.diagnostics.pagesMissingText?.includes(page.pageNumber) || page.diagnostics?.missingText;
  const visualOnly = document.diagnostics.visualOnlyPages?.includes(page.pageNumber) || page.diagnostics?.visualOnly;
  const pageImages = document.assets.filter((asset) => asset.pageNumber === page.pageNumber && asset.kind === "image");
  const unusedImages = pageImages.filter((asset) => document.diagnostics.unusedImageAssets?.includes(asset.id));
  const warnings = page.diagnostics?.warnings ?? [];

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <DiagnosticLine active={Boolean(missingText)} icon={ScrollText} label="Text fehlt" value={missingText ? "prüfen" : "ok"} />
      <DiagnosticLine active={Boolean(visualOnly)} icon={ImageOff} label="Nur visuell" value={visualOnly ? "keine Textspur" : "ok"} />
      <DiagnosticLine active={unusedImages.length > 0} icon={FileImage} label="Bilder ungenutzt" value={String(unusedImages.length)} />
      <DiagnosticLine active={warnings.length > 0} icon={TriangleAlert} label="Warnungen" value={String(warnings.length)} />
    </div>
  );
}

function DocumentBlockView({ block, isUnknown }: { block: DocumentBlock; isUnknown: boolean }) {
  const lowConfidence = typeof block.confidence === "number" && block.confidence < LOW_CONFIDENCE_THRESHOLD;
  const content = block.markdown || block.text || (block.assetId ? `Bild-Asset: ${block.assetId}` : "");
  return (
    <article
      className={cn(
        "rounded-2xl bg-secondary/60 px-3 py-3",
        (isUnknown || lowConfidence) && "bg-destructive/10 text-destructive",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={isUnknown ? "destructive" : "secondary"}>{blockTypeLabel(block.type)}</Badge>
        {block.label ? <Badge variant="outline">{block.label}</Badge> : null}
        {typeof block.confidence === "number" ? (
          <Badge variant={lowConfidence ? "destructive" : "outline"}>
            {Math.round(block.confidence * 100)}%
          </Badge>
        ) : null}
        {block.assetId ? <Badge variant="outline">Asset {block.assetId}</Badge> : null}
      </div>
      <RenderedBlockContent block={block} content={content} />
    </article>
  );
}

function RenderedBlockContent({ block, content }: { block: DocumentBlock; content: string }) {
  if (!content.trim()) {
    return <p className="text-sm text-muted-foreground">Kein Inhalt erkannt.</p>;
  }
  if (block.type === "heading" || block.type === "title") {
    return <h4 className="text-base font-semibold leading-7 text-foreground">{content}</h4>;
  }
  if (block.type === "list") {
    return (
      <div className="whitespace-pre-wrap text-sm leading-6">
        {content}
      </div>
    );
  }
  if (block.type === "code" || block.type === "table" || block.type === "formula") {
    return (
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-background/80 px-3 py-2 text-xs leading-5 text-foreground">
        {content}
      </pre>
    );
  }
  if (block.type === "image") {
    return (
      <p className="flex items-center gap-2 text-sm leading-6">
        <FileImage aria-hidden className="size-4 shrink-0" />
        <span>{content}</span>
      </p>
    );
  }
  return <p className="whitespace-pre-wrap text-sm leading-6">{content}</p>;
}

function DocumentHealth({ counts }: { counts: ReturnType<typeof documentDiagnosticCounts> | null }) {
  if (!counts) {
    return null;
  }
  const issueCount = counts.missingPages + counts.visualOnlyPages + counts.unknownBlocks + counts.unusedImages + counts.warnings;
  return (
    <Badge variant={issueCount > 0 ? "destructive" : "secondary"}>
      {issueCount > 0 ? `${issueCount} Hinweise` : "Diagnose ok"}
    </Badge>
  );
}

function DiagnosticLine({
  active,
  icon: Icon,
  label,
  value,
}: {
  active: boolean;
  icon: typeof TriangleAlert;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2 text-xs", active && "bg-destructive/10 text-destructive")}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function StatPill({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-background px-3.5 py-1.5 text-xs", tone === "warning" && "bg-destructive/10 text-destructive")}>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className={tone === "warning" ? "" : "text-muted-foreground"}>{label}</span>
    </span>
  );
}

function RunMeta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-background px-3 py-1">
      <Gauge aria-hidden className="size-3.5 shrink-0" />
      <span className="shrink-0 font-medium text-foreground">{label}:</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

export function buildBlockTypeSummary(documents: PDFDocumentStructure[]) {
  const counts = new Map<string, number>();
  for (const document of documents) {
    for (const page of document.pages) {
      for (const block of page.blocks) {
        counts.set(block.type || "unknown", (counts.get(block.type || "unknown") ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

export function documentDiagnosticCounts(document: PDFDocumentStructure) {
  return {
    missingPages: document.diagnostics.pagesMissingText?.length ?? 0,
    visualOnlyPages: document.diagnostics.visualOnlyPages?.length ?? 0,
    extractedImages: document.diagnostics.extractedImageAssets?.length ?? 0,
    unusedImages: document.diagnostics.unusedImageAssets?.length ?? 0,
    unknownBlocks: document.diagnostics.unknownBlocks?.length ?? 0,
    warnings: document.diagnostics.warnings?.length ?? 0,
  };
}

function blockTypeLabel(type: string) {
  const labels: Record<string, string> = {
    code: "Code",
    formula: "Formel",
    heading: "Titel",
    image: "Bild",
    list: "Liste",
    paragraph: "Absatz",
    table: "Tabelle",
    title: "Titel",
    unknown: "Unbekannt",
  };
  return labels[type] ?? type;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
