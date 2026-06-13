"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type {
  DocumentAsset,
  DocumentBlock,
  PDFDocumentStructure,
  PDFPageStructure,
} from "@/components/extracted-document-inspector";
import { cn } from "@/lib/utils";

export function ExtractedDetailsPanel({
  assetsById,
  courseId,
  document,
  page,
  selectedBlock,
}: {
  assetsById: Map<string, DocumentAsset>;
  courseId: string;
  document: PDFDocumentStructure | null;
  page: PDFPageStructure | null;
  selectedBlock: DocumentBlock | null;
}) {
  if (!document || !page) {
    return (
      <aside className="rounded-3xl bg-background/70 px-4 py-4 text-sm text-muted-foreground">
        Keine Diagnose verfügbar.
      </aside>
    );
  }
  const pageAssets = document.assets.filter((asset) => asset.pageNumber === page.pageNumber);
  const previewAsset = page.previewAssetId ? assetsById.get(page.previewAssetId) : undefined;
  const selectedAsset = selectedBlock?.assetId ? assetsById.get(selectedBlock.assetId) : undefined;
  const unusedImageIds = new Set(document.diagnostics.unusedImageAssets ?? []);
  const missingSelectedAsset = Boolean(selectedBlock?.assetId && !selectedAsset);

  return (
    <aside className="min-w-0 rounded-3xl bg-background/70 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Block details</h3>
        <Badge variant={missingSelectedAsset ? "destructive" : "secondary"}>Page {page.pageNumber}</Badge>
      </div>

      {selectedBlock ? (
        <div className="mt-4 grid gap-3">
          <DetailRow label="Block ID" value={selectedBlock.id} />
          <DetailRow label="Type" value={blockTypeLabel(selectedBlock.type)} />
          <DetailRow label="Label" value={selectedBlock.label || "none"} />
          <DetailRow label="Source" value={selectedBlock.source || "unknown"} />
          <DetailRow label="Confidence" value={selectedBlock.confidence === undefined ? "unknown" : confidenceLabel(selectedBlock.confidence)} />
          {selectedBlock.assetId ? <DetailRow label="Asset ID" value={selectedBlock.assetId} /> : null}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Keine Blöcke auf dieser Seite erkannt.
        </p>
      )}

      {missingSelectedAsset ? (
        <Alert className="mt-4">
          Referenziertes Bild-Asset fehlt im Extracted-Output: {selectedBlock?.assetId}
        </Alert>
      ) : null}

      {selectedAsset ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Selected asset</p>
          <AssetPreview asset={selectedAsset} courseId={courseId} />
        </div>
      ) : null}

      {previewAsset ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Page preview asset</p>
          <AssetPreview asset={previewAsset} courseId={courseId} />
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Page assets</p>
        {pageAssets.length > 0 ? (
          <div className="grid gap-2">
            {pageAssets.map((asset) => (
              <div className="rounded-2xl bg-secondary/60 px-3 py-2" key={asset.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-foreground">{asset.id}</p>
                  <Badge variant={unusedImageIds.has(asset.id) ? "destructive" : "outline"}>
                    {unusedImageIds.has(asset.id) ? "unused" : asset.kind}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{asset.path}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            Keine Assets für diese Seite registriert.
          </p>
        )}
      </div>

      {document.diagnostics.warnings?.length ? (
        <div className="mt-4 grid gap-2">
          {document.diagnostics.warnings.map((warning) => (
            <Alert key={warning}>{warning}</Alert>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

export function AssetPreview({ asset, compact = false, courseId }: { asset: DocumentAsset; compact?: boolean; courseId: string }) {
  const [failed, setFailed] = useState(false);
  const src = courseId ? extractedAssetUrl(courseId, asset.path) : "";
  const imageLike = Boolean(asset.mimeType?.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.path));
  return (
    <div className={cn("rounded-2xl bg-secondary/60 p-2", compact && "mt-3")}>
      {src && !failed && imageLike ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={asset.role || asset.kind}
          className="max-h-56 w-full rounded-xl object-contain"
          loading="lazy"
          src={src}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={cn("grid place-items-center rounded-xl bg-background/70 text-center text-xs text-muted-foreground", compact ? "min-h-16" : "min-h-28")}>
          {failed ? "Asset konnte nicht geladen werden." : "Asset preview nicht verfügbar."}
        </div>
      )}
      <p className="mt-2 truncate text-xs font-medium text-foreground">{asset.id}</p>
      <p className="mt-1 break-all text-[11px] leading-4 text-muted-foreground">{asset.path}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}

function confidenceLabel(confidence: DocumentBlock["confidence"]) {
  if (typeof confidence === "number") {
    return `${Math.round(confidence * 100)}%`;
  }
  if (confidence === "high") {
    return "high confidence";
  }
  if (confidence === "medium") {
    return "medium confidence";
  }
  if (confidence === "low") {
    return "low confidence";
  }
  return confidence || "unknown";
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

function extractedAssetUrl(courseId: string, path: string) {
  return `/api/study-pipeline/courses/${encodeURIComponent(courseId)}/study-pipeline/extracted-asset?path=${encodeURIComponent(path)}`;
}
