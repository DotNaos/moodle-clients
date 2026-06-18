"use client";

import { FileIcon } from "@dotnaos/react-ui/web";
import { CheckCircle2, ChevronRight, ExternalLink, FileArchive, FileText, Globe, ImageIcon } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseImageUrl, courseTitle } from "@/lib/dashboard-data";
import { shouldHandleAppLinkClick } from "@/lib/link-events";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export function LoadingRows({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {label}
      </div>
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-[260px] place-items-center px-6 text-center">
      <div>
        <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function CourseThumbnail({
  course,
  active = false,
  size = "default",
  circle = false,
}: {
  course: Course;
  active?: boolean;
  size?: "compact" | "default" | "large";
  circle?: boolean;
}) {
  const imageUrl = courseImageUrl(course);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);
  const dimensions = circle
    ? size === "large"
      ? "size-16"
      : size === "compact"
        ? "size-9"
        : "size-14"
    : size === "large"
      ? "size-16"
      : size === "compact"
        ? "size-9"
        : "size-14";
  const radius = circle ? "rounded-full" : size === "compact" ? "rounded-xl" : "rounded-2xl";

  return (
    <span
      ref={ref}
      className={cn(
        "relative shrink-0 overflow-hidden bg-secondary",
        radius,
        dimensions,
        active && "bg-primary-foreground/15",
      )}
    >
      {imageUrl && !failed && inView ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={imageUrl}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon aria-hidden />
        </span>
      )}
    </span>
  );
}

// Defers image loading until the thumbnail is near the viewport, so long course
// lists (e.g. the picker modal) only fetch the topmost few images on open.
function useInView<T extends HTMLElement>(ref: RefObject<T | null>): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, ref]);

  return inView;
}

export function CourseSidebarRow({
  active = false,
  collapsed = false,
  course,
  onSelect,
}: {
  active?: boolean;
  collapsed?: boolean;
  course: Course;
  onSelect: () => void;
}) {
  const imageUrl = courseImageUrl(course);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (collapsed) {
    return (
      <button
        aria-label={courseTitle(course)}
        className={cn(
          "group grid size-11 place-items-center overflow-hidden rounded-xl transition-colors",
          active ? "bg-primary text-primary-foreground" : "hover:bg-secondary/80",
        )}
        title={courseTitle(course)}
        type="button"
        onClick={onSelect}
      >
        <span className="relative size-9 overflow-hidden rounded-lg bg-secondary">
          {showImage && imageUrl ? (
            <img
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              src={imageUrl}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon aria-hidden className="size-4" />
            </span>
          )}
          {active ? <span aria-hidden className="absolute inset-0 bg-primary/35" /> : null}
        </span>
      </button>
    );
  }

  return (
    <button
      className={cn(
        "group flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-lg px-2 py-1.5 text-left transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-secondary/80",
      )}
      type="button"
      onClick={onSelect}
    >
      <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-secondary">
        {showImage && imageUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={imageUrl}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon aria-hidden className="size-5" />
          </span>
        )}
        {active ? <span aria-hidden className="absolute inset-0 bg-primary/35" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 items-center">
        <span className="block truncate text-sm font-medium leading-snug">{courseTitle(course)}</span>
      </span>
    </button>
  );
}

export function CourseGridCard({
  active = false,
  course,
  onSelect,
}: {
  active?: boolean;
  course: Course;
  onSelect: () => void;
}) {
  const imageUrl = courseImageUrl(course);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <button
      className={cn(
        "flex w-44 flex-col overflow-hidden rounded-2xl text-left transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
      )}
      type="button"
      onClick={onSelect}
    >
      <span className="relative h-24 w-full bg-secondary">
        {showImage && imageUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={imageUrl}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon aria-hidden />
          </span>
        )}
        {active ? <span aria-hidden className="absolute inset-0 bg-primary/35" /> : null}
      </span>
      <span className="line-clamp-2 px-3 py-2.5 text-sm font-medium leading-snug">{courseTitle(course)}</span>
    </button>
  );
}

export function MaterialGridCard({
  active = false,
  href,
  material,
  openTaskLabel = "Aufgabe",
  onOpenTask,
  onSelect,
  onToggleSelection,
  selectedForExport = false,
}: {
  active?: boolean;
  href: string;
  material: Material;
  openTaskLabel?: string;
  onOpenTask?: () => void;
  onSelect: () => void;
  onToggleSelection?: () => void;
  selectedForExport?: boolean;
}) {
  const content = (
    <>
      <MaterialFileIcon className="shrink-0 text-muted-foreground" material={material} size={28} />
      <span className="line-clamp-2 text-sm font-medium leading-snug break-words">{material.name}</span>
    </>
  );

  return (
    <div className="flex h-full w-36 flex-col gap-1.5">
      <div
        className={cn(
          "group relative flex flex-1 flex-col gap-2 rounded-2xl p-3 transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
        )}
      >
        {onToggleSelection ? (
          <MaterialSelectionButton
            className="absolute right-3 top-3 z-10"
            materialName={material.name}
            selected={selectedForExport}
            onToggle={onToggleSelection}
          />
        ) : null}
        {onToggleSelection ? (
          <button
            className="flex min-w-0 flex-1 flex-col items-start gap-2 pr-7 text-left"
            type="button"
            onClick={onSelect}
          >
            {content}
          </button>
        ) : (
          <a
            className="flex min-w-0 flex-1 flex-col items-start gap-2 text-left"
            href={href}
            onClick={(event) => {
              if (!shouldHandleAppLinkClick(event)) {
                return;
              }
              event.preventDefault();
              onSelect();
            }}
          >
            {content}
          </a>
        )}
        {material.url && !onToggleSelection ? (
          <a
            aria-label={`Open ${material.name} in Moodle`}
            className={cn(
              "absolute right-2 top-2 grid size-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground focus-within:opacity-100 group-hover:opacity-100",
              active && "text-primary-foreground/70 hover:bg-primary-foreground/15 hover:text-primary-foreground",
            )}
            href={material.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink aria-hidden className="size-4" />
          </a>
        ) : null}
      </div>
      {onOpenTask ? (
        <button
          aria-label={`${material.name} als ${openTaskLabel} öffnen`}
          className="inline-flex h-8 max-w-full items-center justify-center gap-1.5 rounded-full bg-secondary/70 px-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary"
          onClick={onOpenTask}
          type="button"
        >
          <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{openTaskLabel}</span>
        </button>
      ) : null}
    </div>
  );
}

export function MaterialGridPair({
  activeMaterialId,
  hrefForMaterial,
  materials,
  onOpenTask,
  onSelect,
  onToggleSelection,
  selectedMaterialIds,
}: {
  activeMaterialId: string | null;
  hrefForMaterial: (material: Material) => string;
  materials: [Material, Material];
  onOpenTask?: () => void;
  onSelect: (material: Material) => void;
  onToggleSelection?: (material: Material) => void;
  selectedMaterialIds: Set<string>;
}) {
  const actionLabel = materialPairTaskActionLabel(materials[0].name);

  return (
    <div className="flex h-full w-[18.5rem] flex-col gap-1.5">
      <div className="flex flex-1 items-stretch gap-1.5">
        {materials.map((material) => (
          <MaterialGridCard
            active={material.id === activeMaterialId}
            href={hrefForMaterial(material)}
            key={material.id}
            material={material}
            onSelect={() => onSelect(material)}
            onToggleSelection={onToggleSelection ? () => onToggleSelection(material) : undefined}
            selectedForExport={selectedMaterialIds.has(material.id)}
          />
        ))}
      </div>
      {onOpenTask ? (
        <button
          aria-label={`${materials[0].name} und ${materials[1].name} als ${actionLabel} öffnen`}
          className="inline-flex h-8 max-w-full items-center justify-center gap-1.5 rounded-full bg-secondary/70 px-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary"
          onClick={onOpenTask}
          type="button"
        >
          <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{actionLabel}</span>
        </button>
      ) : null}
    </div>
  );
}

export function MaterialListPair({
  activeMaterialId,
  hrefForMaterial,
  materials,
  onOpenTask,
  onSelect,
  onToggleSelection,
  selectedMaterialIds,
}: {
  activeMaterialId: string | null;
  hrefForMaterial: (material: Material) => string;
  materials: [Material, Material];
  onOpenTask?: () => void;
  onSelect: (material: Material) => void;
  onToggleSelection?: (material: Material) => void;
  selectedMaterialIds: Set<string>;
}) {
  const actionLabel = materialPairTaskActionLabel(materials[0].name);

  return (
    <div className="grid min-w-0 gap-1 py-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1 sm:col-span-2 sm:grid-cols-2">
        {materials.map((material) => (
          <MaterialListPairResource
            active={material.id === activeMaterialId}
            href={hrefForMaterial(material)}
            key={material.id}
            material={material}
            onSelect={() => onSelect(material)}
            onToggleSelection={onToggleSelection ? () => onToggleSelection(material) : undefined}
            selectedForExport={selectedMaterialIds.has(material.id)}
          />
        ))}
      </div>
      {onOpenTask ? (
        <button
          aria-label={`${materials[0].name} und ${materials[1].name} als ${actionLabel} öffnen`}
          className="ml-10 inline-flex h-9 w-fit max-w-full items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 sm:ml-0"
          onClick={onOpenTask}
          type="button"
        >
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{actionLabel}</span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : null}
    </div>
  );
}

function MaterialListPairResource({
  active,
  href,
  material,
  onSelect,
  onToggleSelection,
  selectedForExport,
}: {
  active: boolean;
  href: string;
  material: Material;
  onSelect: () => void;
  onToggleSelection?: () => void;
  selectedForExport: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary",
          active && "bg-primary-foreground/15",
        )}
      >
        <MaterialFileIcon className="text-muted-foreground" material={material} size={20} />
      </span>
      <span className="block min-w-0 truncate text-sm font-medium">{material.name}</span>
    </>
  );

  return (
    <div
      className={cn(
        "group flex min-h-12 min-w-0 items-center gap-2 rounded-2xl px-2 py-1.5 transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-secondary/60",
      )}
    >
      {onToggleSelection ? (
        <MaterialSelectionButton
          materialName={material.name}
          selected={selectedForExport}
          onToggle={onToggleSelection}
        />
      ) : null}
      {onToggleSelection ? (
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={onSelect}>
          {content}
        </button>
      ) : (
        <a
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          href={href}
          onClick={(event) => {
            if (!shouldHandleAppLinkClick(event)) {
              return;
            }
            event.preventDefault();
            onSelect();
          }}
        >
          {content}
        </a>
      )}
      {material.url && !onToggleSelection ? (
        <a
          aria-label={`Open ${material.name} in Moodle`}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground focus-within:opacity-100 group-hover:opacity-100",
            active && "text-primary-foreground/70 hover:bg-primary-foreground/15 hover:text-primary-foreground",
          )}
          href={material.url}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

function materialPairTaskActionLabel(name: string): string {
  const match = name.toLowerCase().match(/aufgabenblatt\s*0*(\d+)/i);
  return match ? `Aufgabe ${match[1].padStart(2, "0")}` : "Aufgabe";
}

export function MaterialRow({
  active = false,
  href,
  material,
  openTaskLabel = "Aufgabe",
  onOpenTask,
  onSelect,
  onToggleSelection,
  selectedForExport = false,
}: {
  active?: boolean;
  href: string;
  material: Material;
  openTaskLabel?: string;
  onOpenTask?: () => void;
  onSelect: () => void;
  onToggleSelection?: () => void;
  selectedForExport?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary",
          active && "bg-primary-foreground/15",
        )}
      >
        <MaterialFileIcon className="text-muted-foreground" material={material} size={20} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{material.name}</span>
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "group flex min-h-14 w-full min-w-0 items-center justify-between gap-2 rounded-2xl px-3 py-2 transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-secondary hover:text-secondary-foreground",
      )}
    >
      {onToggleSelection ? (
        <MaterialSelectionButton
          materialName={material.name}
          selected={selectedForExport}
          onToggle={onToggleSelection}
        />
      ) : null}
      {onToggleSelection ? (
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={onSelect}>
          {content}
        </button>
      ) : (
        <a
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          href={href}
          onClick={(event) => {
            if (!shouldHandleAppLinkClick(event)) {
              return;
            }
            event.preventDefault();
            onSelect();
          }}
        >
          {content}
        </a>
      )}
      {onOpenTask ? (
        <button
          aria-label={`${material.name} als ${openTaskLabel} öffnen`}
          className={cn(
            "inline-flex h-9 max-w-[120px] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
            active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
          onClick={onOpenTask}
          type="button"
        >
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{openTaskLabel}</span>
        </button>
      ) : null}
      {material.url && !onToggleSelection ? (
        <a
          aria-label={`Open ${material.name} in Moodle`}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground focus-within:opacity-100 group-hover:opacity-100",
            active && "text-primary-foreground/70 hover:bg-primary-foreground/15 hover:text-primary-foreground",
          )}
          href={material.url}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

function MaterialSelectionButton({
  className,
  materialName,
  onToggle,
  selected,
}: {
  className?: string;
  materialName: string;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <Checkbox
      aria-label={selected ? `${materialName} aus Exportauswahl entfernen` : `${materialName} für Export auswählen`}
      checked={selected}
      className={cn(
        "shrink-0",
        className,
      )}
      onCheckedChange={onToggle}
    />
  );
}

export function MaterialFileIcon({
  className,
  material,
  size,
}: {
  className?: string;
  material: Material;
  size: number;
}) {
  const hasExtension = /\.[a-z0-9]{2,4}$/i.test(material.name);
  const isFile = Boolean(material.fileType) || hasExtension;
  const isZip = material.fileType?.toLowerCase() === "zip" || /\.zip$/i.test(material.name);
  const filename = material.fileType ? `${material.name}.${material.fileType}` : material.name;

  if (!isFile) {
    return <Globe aria-hidden className={className} size={size} />;
  }
  if (isZip) {
    return <FileArchive aria-hidden className={className} size={size} />;
  }
  return <FileIcon aria-hidden className={className} filename={filename} size={size} />;
}
