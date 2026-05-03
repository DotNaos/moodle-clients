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
  courseId?: string;
  uploadedAt?: string;
};

export type CategoryOption = {
  key: string;
  label: string;
  count: number;
};

export type CategoryOptionGroups = {
  semesters: CategoryOption[];
  other: CategoryOption[];
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
  const groups = buildCategoryOptionGroups(courses);
  return [...groups.semesters, ...groups.other];
}

export function buildCategoryOptionGroups(courses: Course[]): CategoryOptionGroups {
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

  const options = [...categories.values()];
  const semesters = options
    .filter((option) => parseSemester(option.label))
    .sort(compareSemesterOptions);
  const other = options
    .filter((option) => !parseSemester(option.label))
    .sort(compareCategoryLabels);

  return { semesters, other };
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

function compareCategoryLabels(left: CategoryOption, right: CategoryOption): number {
  return left.label.localeCompare(right.label, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareSemesterOptions(left: CategoryOption, right: CategoryOption): number {
  const leftSemester = parseSemester(left.label);
  const rightSemester = parseSemester(right.label);

  if (!leftSemester || !rightSemester) {
    return compareCategoryLabels(left, right);
  }

  if (leftSemester.year !== rightSemester.year) {
    return rightSemester.year - leftSemester.year;
  }

  return rightSemester.termOrder - leftSemester.termOrder;
}

function parseSemester(label: string): { year: number; termOrder: number } | null {
  const normalized = label.trim().toLowerCase();
  const shortMatch = normalized.match(/\b(fs|hs)\s*([0-9]{2}|[0-9]{4})\b/i);
  const longMatch = normalized.match(
    /\b(fr[üu]hling(?:s)?(?:semester)?|spring|herbst(?:semester)?|autumn|fall)\s*([0-9]{2}|[0-9]{4})\b/i,
  );

  const term = shortMatch?.[1] ?? longMatch?.[1];
  const yearValue = shortMatch?.[2] ?? longMatch?.[2];
  if (!term || !yearValue) {
    return null;
  }

  const year = normalizeSemesterYear(yearValue);
  const termOrder = /^(hs|herbst|autumn|fall)/i.test(term) ? 2 : 1;
  return { year, termOrder };
}

function normalizeSemesterYear(value: string): number {
  if (value.length === 4) {
    return Number(value);
  }

  return 2000 + Number(value);
}
