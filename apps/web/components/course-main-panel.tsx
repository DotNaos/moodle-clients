"use client";

import { ExternalLink, FileText } from "lucide-react";

import { CourseThumbnail } from "@/components/dashboard-ui";
import { FileViewer } from "@/components/file-viewer";
import { Button } from "@/components/ui/button";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";

export function CourseMainPanel({
  course,
  courseId,
  material,
}: {
  course: Course | null;
  courseId: string | null;
  material: Material | null;
}) {
  if (material) {
    return (
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
        <FileViewer courseId={courseId} material={material} />
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
      {course ? <CourseOverview course={course} /> : <NoCourseSelected />}
    </section>
  );
}

function CourseOverview({ course }: { course: Course }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-8 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-start gap-5">
          <CourseThumbnail course={course} size="large" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Selected course</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{courseTitle(course)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{courseSubtitle(course)}</p>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between gap-4 rounded-[1.75rem] bg-muted px-5 py-4">
          <p className="text-sm text-muted-foreground">Choose a material from the left to preview it here.</p>
          {course.viewUrl ? (
            <Button asChild variant="secondary">
              <a href={course.viewUrl} target="_blank" rel="noreferrer">
                Open Moodle <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NoCourseSelected() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-8 py-8 text-center">
      <div className="max-w-sm">
        <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <p className="font-medium">No course selected</p>
        <p className="mt-1 text-sm text-muted-foreground">Choose a course on the left to open its materials.</p>
      </div>
    </div>
  );
}
