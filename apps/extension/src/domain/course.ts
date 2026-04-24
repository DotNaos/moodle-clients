import { normalizeWhitespace } from '@/lib/utils'
import { detectSemester, type Semester } from './semester'

export type RawCourse = {
  title: string
  url: string
  imageUrl: string | null
  area: string | null
  isFavorite: boolean
  progressText: string | null
  semesterRaw: string | null
  textContent: string
}

export type Course = {
  id: string
  title: string
  url: string
  imageUrl: string | null
  area: string | null
  isFavorite: boolean
  progressText: string | null
  semesterRaw: string | null
  semester: Semester | null
  textContent: string
}

function getCourseId(url: URL): string {
  const idParam = url.searchParams.get('id')

  if (idParam) {
    return idParam
  }

  return `${url.pathname}${url.search}`
}

export function normalizeCourse(rawCourse: RawCourse): Course {
  const parsedUrl = new URL(rawCourse.url, window.location.origin)
  const normalizedTitle = normalizeWhitespace(rawCourse.title)
  const normalizedArea = rawCourse.area ? normalizeWhitespace(rawCourse.area) : null
  const normalizedProgressText = rawCourse.progressText
    ? normalizeWhitespace(rawCourse.progressText)
    : null
  const normalizedTextContent = normalizeWhitespace(rawCourse.textContent)
  const { semester, raw } = detectSemester(
    rawCourse.semesterRaw,
    normalizedTitle,
    normalizedArea,
    normalizedTextContent,
  )

  return {
    id: getCourseId(parsedUrl),
    title: normalizedTitle,
    url: parsedUrl.toString(),
    imageUrl: rawCourse.imageUrl,
    area: normalizedArea,
    isFavorite: rawCourse.isFavorite,
    progressText: normalizedProgressText,
    semesterRaw: raw,
    semester,
    textContent: normalizedTextContent,
  }
}
