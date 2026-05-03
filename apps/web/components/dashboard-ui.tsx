"use client";

import { ExternalLink, FileText, ImageIcon } from "lucide-react";
import { useState } from "react";

import type { Course, Material } from "@/lib/dashboard-data";
import { courseImageUrl } from "@/lib/dashboard-data";
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
}: {
  course: Course;
  active?: boolean;
  size?: "default" | "large";
}) {
  const imageUrl = courseImageUrl(course);
  const [failed, setFailed] = useState(false);
  const dimensions = size === "large" ? "h-16 w-24" : "h-14 w-16";

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl bg-secondary",
        dimensions,
        active && "bg-primary-foreground/15",
      )}
    >
      {imageUrl && !failed ? (
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

export function MaterialRow({
  active = false,
  material,
  onSelect,
}: {
  active?: boolean;
  material: Material;
  onSelect: () => void;
}) {
  const isPdf = material.fileType?.toLowerCase() === "pdf" || material.url?.toLowerCase().includes(".pdf");
  const materialType = material.fileType?.toUpperCase() || material.type || "Resource";

  return (
    <div
      className={cn(
        "group flex min-h-14 items-center justify-between gap-2 rounded-2xl px-3 py-2 transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-secondary hover:text-secondary-foreground",
      )}
    >
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={onSelect}>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground",
            isPdf && !active && "text-destructive",
            active && "bg-primary-foreground/15 text-primary-foreground",
          )}
        >
          <FileText aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{material.name}</span>
          <span className={cn("block truncate text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {materialType}
          </span>
        </span>
      </button>
      {material.url ? (
        <a
          aria-label={`Open ${material.name} in Moodle`}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
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
