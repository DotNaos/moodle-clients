import { normalizeWhitespace } from '@/lib/utils'

export type SemesterSeason = 'FS' | 'HS'

export type Semester = {
  season: SemesterSeason
  year: string
  fullYear: number
  label: string
  sortKey: number
}

const COMPACT_SEMESTER_PATTERN = /\b(FS|HS)\s*(\d{2}|\d{4})\b/i
const SPACED_SEMESTER_PATTERN = /\b(20\d{2})\s*(FS|HS)\b/i

function normalizeYear(rawYear: string): { year: string; fullYear: number } {
  if (rawYear.length === 4) {
    return {
      year: rawYear.slice(-2),
      fullYear: Number(rawYear),
    }
  }

  const fullYear = 2000 + Number(rawYear)

  return {
    year: rawYear,
    fullYear,
  }
}

function createSemester(season: SemesterSeason, rawYear: string): Semester {
  const { year, fullYear } = normalizeYear(rawYear)

  return {
    season,
    year,
    fullYear,
    label: `${season}${year}`,
    sortKey: fullYear * 10 + (season === 'FS' ? 1 : 2),
  }
}

export function parseSemester(value: string | null | undefined): Semester | null {
  if (!value) {
    return null
  }

  const normalizedValue = normalizeWhitespace(value)
  const compactMatch = COMPACT_SEMESTER_PATTERN.exec(normalizedValue)

  if (compactMatch) {
    const season = compactMatch[1].toUpperCase() as SemesterSeason
    const rawYear = compactMatch[2]

    return createSemester(season, rawYear)
  }

  const spacedMatch = SPACED_SEMESTER_PATTERN.exec(normalizedValue)

  if (spacedMatch) {
    const rawYear = spacedMatch[1]
    const season = spacedMatch[2].toUpperCase() as SemesterSeason

    return createSemester(season, rawYear)
  }

  return null
}

export function detectSemester(...values: Array<string | null | undefined>): {
  semester: Semester | null
  raw: string | null
} {
  for (const value of values) {
    if (!value) {
      continue
    }

    const semester = parseSemester(value)

    if (semester) {
      return {
        semester,
        raw: normalizeWhitespace(value),
      }
    }
  }

  return {
    semester: null,
    raw: null,
  }
}

export function getCurrentSemester(date: Date = new Date()): Semester {
  const month = date.getMonth()
  const season: SemesterSeason = month >= 7 ? 'HS' : 'FS'
  const year = String(date.getFullYear())

  return createSemester(season, year)
}

export function compareSemesters(a: Semester, b: Semester): number {
  return a.sortKey - b.sortKey
}
