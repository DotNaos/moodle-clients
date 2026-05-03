"use client";

import { ExternalLink, FileText, ImageIcon } from "lucide-react";
import { useState } from "react";

import type { Course, Material } from "@/lib/dashboard-data";
import { courseImageUrl } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingRows() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-14" />
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

export function MaterialRow({ material }: { material: Material }) {
  const isPdf = material.fileType?.toLowerCase() === "pdf" || material.url?.toLowerCase().includes(".pdf");
  const materialType = material.fileType?.toUpperCase() || material.type || "Resource";

  return (
    <a
      className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-secondary hover:text-secondary-foreground"
      href={material.url ?? "#"}
      target="_blank"
      rel="noreferrer"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground",
            isPdf && "text-destructive",
          )}
        >
          <FileText aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{material.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{materialType}</span>
        </span>
      </span>
      <ExternalLink className="shrink-0 text-muted-foreground transition-colors group-hover:text-current" aria-hidden />
    </a>
  );
}
