"use client";

import { ExternalLink, FileText, Maximize2, Minimize2, Monitor, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PDFDocumentViewer } from "@/components/pdf-document-viewer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";

type PDFViewerMode = "app" | "browser";

type PDFDocumentViewerModeProps = {
  allowFloat?: boolean;
  courseId: string | null;
  embedded?: boolean;
  externalUrl?: string;
  expanded?: boolean;
  materialId: string;
  onExpandedChange?: (expanded: boolean) => void;
  scrollCommand: PDFScrollCommand | null;
  title: string;
  url: string;
  onStateChange: (state: PDFViewState | null) => void;
};

const PDF_VIEWER_MODE_STORAGE_KEY = "moodle.pdfViewer.mode";

export function PDFDocumentViewerMode(props: PDFDocumentViewerModeProps) {
  const {
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
  } = props;
  const [mode, setModeState] = useState<PDFViewerMode>("app");
  const [nativeTargetPage, setNativeTargetPage] = useState<{ commandId: number; page: number } | null>(null);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    const stored = window.localStorage.getItem(PDF_VIEWER_MODE_STORAGE_KEY);
    if (stored === "app" || stored === "browser") {
      setModeState(stored);
    }
  }, []);

  useEffect(() => {
    setNativeTargetPage(null);
  }, [url]);

  useEffect(() => {
    if (mode !== "browser") {
      return;
    }
    onStateChangeRef.current(null);
  }, [materialId, mode, url]);

  useEffect(() => {
    if (mode !== "browser" || !scrollCommand) {
      return;
    }
    setNativeTargetPage({
      commandId: scrollCommand.id,
      page: Math.max(1, Math.round(scrollCommand.page)),
    });
  }, [mode, scrollCommand]);

  const setMode = useCallback((nextMode: PDFViewerMode) => {
    setModeState(nextMode);
    window.localStorage.setItem(PDF_VIEWER_MODE_STORAGE_KEY, nextMode);
  }, []);

  const modeControl = <PDFViewerModeControl mode={mode} onModeChange={setMode} />;

  if (mode === "browser") {
    return (
      <NativeBrowserPDFViewer
        allowFloat={allowFloat}
        embedded={embedded}
        expanded={expanded}
        externalUrl={externalUrl}
        onExpandedChange={onExpandedChange}
        targetPage={nativeTargetPage}
        title={title}
        toolbarExtra={modeControl}
        url={url}
      />
    );
  }

  return (
    <PDFDocumentViewer
      allowFloat={allowFloat}
      courseId={courseId}
      embedded={embedded}
      expanded={expanded}
      externalUrl={externalUrl}
      materialId={materialId}
      onExpandedChange={onExpandedChange}
      onStateChange={onStateChange}
      scrollCommand={scrollCommand}
      title={title}
      toolbarExtra={modeControl}
      url={url}
    />
  );
}

function PDFViewerModeControl({
  mode,
  onModeChange,
}: {
  mode: PDFViewerMode;
  onModeChange: (mode: PDFViewerMode) => void;
}) {
  return (
    <div aria-label="PDF viewer mode" className="flex items-center rounded-full bg-secondary p-0.5" role="group">
      <ModeButton
        active={mode === "app"}
        icon={<FileText aria-hidden />}
        label="App"
        onClick={() => onModeChange("app")}
      />
      <ModeButton
        active={mode === "browser"}
        icon={<Monitor aria-hidden />}
        label="Browser"
        onClick={() => onModeChange("browser")}
      />
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`${label} PDF viewer verwenden`}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "[&_svg]:size-3.5",
        active && "bg-background text-foreground shadow-sm",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function NativeBrowserPDFViewer({
  allowFloat,
  embedded,
  expanded,
  externalUrl,
  onExpandedChange,
  targetPage,
  title,
  toolbarExtra,
  url,
}: {
  allowFloat: boolean;
  embedded: boolean;
  expanded: boolean;
  externalUrl?: string;
  onExpandedChange?: (expanded: boolean) => void;
  targetPage: { commandId: number; page: number } | null;
  title: string;
  toolbarExtra: ReactNode;
  url: string;
}) {
  const [floating, setFloating] = useState(false);
  const nativeUrl = useMemo(() => withPDFPageHash(url, targetPage?.page ?? null), [targetPage?.page, url]);
  const iframeKey = `${url}:${targetPage?.commandId ?? "initial"}`;
  const panelFloating = floating && allowFloat;

  useEffect(() => {
    if (!panelFloating) {
      return;
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFloating(false);
      }
    }
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [panelFloating]);

  return (
    <div className="relative h-full min-h-0">
      {panelFloating ? (
        <button
          aria-label="Großansicht schließen"
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px]"
          onClick={() => setFloating(false)}
          type="button"
        />
      ) : null}
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden bg-muted",
          panelFloating
            ? "fixed inset-4 z-[60] rounded-3xl shadow-2xl ring-1 ring-border"
            : "relative h-full",
        )}
      >
        {!embedded ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-muted via-muted/70 to-transparent"
            />
            <div className={cn("pointer-events-none absolute inset-x-0 top-0 z-20 flex items-baseline gap-2 px-4 pt-3", panelFloating && "pr-14")}>
              <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">{title}</h3>
              <span className="shrink-0 text-xs text-muted-foreground">Browser viewer</span>
            </div>
          </>
        ) : null}
        {panelFloating ? (
          <button
            aria-label="Großansicht schließen"
            className="absolute right-3 top-2.5 z-30 grid size-8 place-items-center rounded-full bg-background/90 text-muted-foreground shadow-md backdrop-blur-md transition-colors hover:text-foreground"
            onClick={() => setFloating(false)}
            type="button"
          >
            <X aria-hidden />
          </button>
        ) : null}
        <iframe
          key={iframeKey}
          className="min-h-0 flex-1 bg-card"
          src={nativeUrl}
          title={`Browser PDF viewer: ${title}`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full bg-background/90 p-1 shadow-lg ring-1 ring-border/60 backdrop-blur-md">
            {toolbarExtra}
            {allowFloat || onExpandedChange ? (
              <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
            ) : null}
            {allowFloat ? (
              <Button
                aria-label={panelFloating ? "Großansicht schließen" : "Großansicht öffnen"}
                onClick={() => setFloating((current) => !current)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {panelFloating ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
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

function withPDFPageHash(url: string, page: number | null): string {
  if (!page) {
    return url;
  }
  const [baseUrl, hash = ""] = url.split("#", 2);
  const params = new URLSearchParams(hash);
  params.set("page", String(page));
  return `${baseUrl}#${params.toString()}`;
}
