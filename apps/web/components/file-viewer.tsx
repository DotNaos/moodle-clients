"use client";

import { ExternalLink, FileCode2, FileText } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import type { Material } from "@/lib/dashboard-data";
import { Button } from "@/components/ui/button";
import { PDFDocumentViewer } from "@/components/pdf-document-viewer";
import { Spinner } from "@/components/ui/spinner";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";

type MaterialTextResponse = {
  document?: {
    text?: string;
    title?: string;
  };
  error?: string;
};

export function FileViewer({
  courseId,
  material,
  pdfScrollCommand,
  onPDFStateChange,
}: {
  courseId: string | null;
  material: Material | null;
  pdfScrollCommand: PDFScrollCommand | null;
  onPDFStateChange: (state: PDFViewState | null) => void;
}) {
  const [text, setText] = useState("");
  const [loadingText, setLoadingText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const materialKind = useMemo(() => getMaterialKind(material), [material]);
  const pdfUrl = useMemo(
    () => (courseId && material && materialKind === "pdf" ? pdfPreviewUrl(courseId, material) : ""),
    [courseId, material, materialKind],
  );

  useEffect(() => {
    setText("");
    setError(null);

    if (!courseId || !material || materialKind === "pdf") {
      setLoadingText(false);
      return;
    }

    const controller = new AbortController();
    setLoadingText(true);

    void fetch(textPreviewUrl(courseId, material.id), { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as MaterialTextResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? `Preview failed with ${response.status}`);
        }
        setText(payload.document?.text?.trim() || "No readable text preview is available for this file.");
      })
      .catch((previewError) => {
        if (!controller.signal.aborted) {
          setError(previewError instanceof Error ? previewError.message : "Preview failed.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingText(false);
        }
      });

    return () => controller.abort();
  }, [courseId, material, materialKind]);

  useEffect(() => {
    if (materialKind !== "pdf") {
      onPDFStateChange(null);
    }
  }, [materialKind, onPDFStateChange]);

  if (!material || !courseId) {
    return (
      <section className="grid min-h-0 flex-1 place-items-center border-t border-border/60">
        <div className="max-w-xs text-center">
          <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="font-medium">No file selected</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose a material to preview it here.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-border/60">
      <div className="flex min-h-16 items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
          <h3 className="truncate text-base font-semibold tracking-tight">{material.name}</h3>
        </div>
        {material.url ? (
          <Button asChild variant="secondary">
            <a href={material.url} target="_blank" rel="noreferrer">
              Open <ExternalLink aria-hidden />
            </a>
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 bg-muted">
        {materialKind === "pdf" ? (
          <PDFDocumentViewer
            courseId={courseId}
            materialId={material.id}
            onStateChange={onPDFStateChange}
            scrollCommand={pdfScrollCommand}
            title={material.name}
            url={pdfUrl}
          />
        ) : loadingText ? (
          <PreviewLoading />
        ) : error ? (
          <PreviewMessage
            icon={<FileText aria-hidden />}
            title="Preview unavailable"
            description={error}
          />
        ) : (
          <div className="h-full min-h-[520px] overflow-auto bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <FileCode2 aria-hidden />
              Text preview
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6">{text}</pre>
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewLoading() {
  return (
    <div className="grid h-full min-h-[520px] place-items-center bg-card">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        Loading preview
      </div>
    </div>
  );
}

function PreviewMessage({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="grid h-full min-h-[520px] place-items-center bg-card px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-3 flex justify-center text-muted-foreground">{icon}</div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function getMaterialKind(material: Material | null): "pdf" | "text" {
  const value = [material?.fileType, material?.url, material?.name].filter(Boolean).join(" ").toLowerCase();
  return value.includes("pdf") ? "pdf" : "text";
}

function pdfPreviewUrl(courseId: string, material: Material): string {
  return `/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(material.id)}/pdf`;
}

function textPreviewUrl(courseId: string, materialId: string): string {
  return `/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/text`;
}
