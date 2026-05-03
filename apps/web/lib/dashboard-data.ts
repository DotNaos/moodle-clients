export type User = {
  id: string;
  displayName: string;
  moodleSiteUrl: string;
  moodleUserId: number;
};

export type Course = {
  id: number | string;
  fullname?: string;
  fullName?: string;
  shortname?: string;
  shortName?: string;
  category?: string;
  categoryName?: string;
  heroImage?: string;
  courseImage?: string;
  courseimage?: string;
  viewUrl?: string;
};

export type Material = {
  id: string;
  name: string;
  url?: string;
  type?: string;
  sectionName?: string;
  fileType?: string;
};

export function normalizeCourses(response: { courses?: Course[] } | Course[]): Course[] {
  if (Array.isArray(response)) {
    return response;
  }
  return response.courses ?? [];
}

export function normalizeMaterials(response: { materials?: Material[] } | Material[]): Material[] {
  if (Array.isArray(response)) {
    return response;
  }
  return response.materials ?? [];
}

export function buildCategoryOptions(courses: Course[]): Array<{ key: string; label: string; count: number }> {
  const categories = new Map<string, { key: string; label: string; count: number }>();
  for (const course of courses) {
    const key = courseCategoryKey(course);
    const existing = categories.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    categories.set(key, {
      key,
      label: courseCategoryLabel(course),
      count: 1,
    });
  }

  return [...categories.values()].sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }),
  );
}

export function courseCategoryKey(course: Course): string {
  return courseCategoryLabel(course).toLowerCase();
}

function courseCategoryLabel(course: Course): string {
  return course.categoryName ?? course.category ?? "Other courses";
}

export function courseTitle(course: Course): string {
  return course.fullname ?? course.fullName ?? "Untitled course";
}

export function courseSubtitle(course: Course): string {
  return course.shortname ?? course.shortName ?? course.category ?? course.categoryName ?? `Course ${course.id}`;
}

export function courseImageUrl(course: Course): string | null {
  const value = course.heroImage ?? course.courseImage ?? course.courseimage;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
