import type { Course, Material, User } from "@/lib/dashboard-data";

const CACHE_PREFIX = "moodle-web-dashboard:";
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

export type DashboardCache = {
  savedAt: number;
  user: User | null;
  courses: Course[];
  materialsByCourseId: Record<string, Material[]>;
  selectedCourseId: string | null;
  selectedCategory: string;
  selectedMaterialId: string | null;
};

export function readDashboardCache(userId: string): DashboardCache | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<DashboardCache>;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(cacheKey(userId));
      return null;
    }

    return {
      savedAt: parsed.savedAt,
      user: parsed.user ?? null,
      courses: Array.isArray(parsed.courses) ? parsed.courses : [],
      materialsByCourseId: isMaterialCache(parsed.materialsByCourseId) ? parsed.materialsByCourseId : {},
      selectedCourseId: typeof parsed.selectedCourseId === "string" ? parsed.selectedCourseId : null,
      selectedCategory: typeof parsed.selectedCategory === "string" ? parsed.selectedCategory : "all",
      selectedMaterialId: typeof parsed.selectedMaterialId === "string" ? parsed.selectedMaterialId : null,
    };
  } catch {
    window.localStorage.removeItem(cacheKey(userId));
    return null;
  }
}

export function writeDashboardCache(userId: string, cache: Omit<DashboardCache, "savedAt">) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    cacheKey(userId),
    JSON.stringify({
      ...cache,
      savedAt: Date.now(),
    }),
  );
}

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

function isMaterialCache(value: unknown): value is Record<string, Material[]> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
