"use client";

import { ExternalLink, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Course } from "@/lib/dashboard-data";
import { courseImageUrl, courseTitle } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export function CourseHero({ className, course }: { className?: string; course: Course }) {
  const imageUrl = courseImageUrl(course);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <section className={cn("relative isolate overflow-hidden bg-secondary", className)}>
      <div className="relative min-h-[14rem] w-full md:min-h-[18rem]">
        {showImage && imageUrl ? (
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={imageUrl}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-secondary via-muted to-secondary" />
        )}

        {!showImage ? (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground/40">
            <ImageIcon aria-hidden className="size-16" />
          </div>
        ) : null}

        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/20"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,0.55)_100%)]"
        />

        <div className="relative flex h-full min-h-[inherit] flex-col justify-end px-5 py-6 md:px-8 md:py-8">
          {course.viewUrl ? (
            <Button
              asChild
              className="absolute top-5 right-5 rounded-full md:top-6 md:right-8"
              variant="secondary"
            >
              <a href={course.viewUrl} target="_blank" rel="noreferrer">
                In Moodle öffnen
                <ExternalLink aria-hidden className="size-4" />
              </a>
            </Button>
          ) : null}
          <h2 className="max-w-3xl text-2xl font-semibold tracking-tight text-white text-balance md:text-3xl">
            {courseTitle(course)}
          </h2>
        </div>
      </div>
    </section>
  );
}
