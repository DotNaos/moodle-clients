import { type RawCourse, normalizeCourse, type Course } from '@/domain/course'
import { normalizeWhitespace, uniqueBy } from '@/lib/utils'

const COURSE_LINK_SELECTOR = 'a[href*="/course/view.php"]'
const COURSE_ITEM_SELECTOR = '[data-region="course-content"], li.course-listitem'

const TITLE_SELECTORS = [
  '[data-region="course-title"]',
  '.coursename',
  '.multiline',
  '.card-title',
  'h3',
  'h4',
]

const AREA_SELECTORS = [
  '[data-region="course-category"]',
  '.categoryname',
  '.text-muted',
  'small',
]

const PROGRESS_PATTERN =
  /\b(\d{1,3}%\s*(?:abgeschlossen|completed|done|erledigt)?)\b/i

const SEMESTER_PATTERN = /\b(?:FS|HS)\s*(?:\d{2}|\d{4})\b|\b20\d{2}\s*(?:FS|HS)\b/i

function isLikelyCourseLink(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute('href')

  if (!href) {
    return false
  }

  const url = new URL(href, window.location.origin)

  return (
    url.origin === window.location.origin &&
    url.pathname.endsWith('/course/view.php') &&
    normalizeWhitespace(anchor.textContent ?? '').length > 0
  )
}

function getCleanText(element: Element | null): string {
  if (!element) return ''
  const clone = element.cloneNode(true) as Element
  
  const hiddenElements = clone.querySelectorAll('.visually-hidden, .hidden, [data-region="is-favourite"], .accesshide')
  for (let i = 0; i < hiddenElements.length; i++) {
    hiddenElements[i].remove()
  }
  
  return normalizeWhitespace(clone.textContent ?? '')
}

function queryFirstCleanText(element: Element, selectors: string[]): string | null {
  for (const selector of selectors) {
    const match = element.querySelector<HTMLElement>(selector)
    if (match) {
      const text = getCleanText(match)
      if (text) {
        return text
      }
    }
  }

  return null
}

function getCourseUrl(courseElement: HTMLElement): string | null {
  const link =
    courseElement.querySelector<HTMLAnchorElement>('a.coursename') ??
    courseElement.querySelector<HTMLAnchorElement>(COURSE_LINK_SELECTOR)

  if (!link?.href) {
    return null
  }

  return new URL(link.href, window.location.origin).toString()
}

function extractTitle(courseElement: HTMLElement): string | null {
  const link =
    courseElement.querySelector<HTMLAnchorElement>('a.coursename') ??
    courseElement.querySelector<HTMLAnchorElement>(COURSE_LINK_SELECTOR)

  return (
    queryFirstCleanText(courseElement, TITLE_SELECTORS) ??
    getCleanText(link) ??
    null
  )
}

function extractImageUrl(courseElement: HTMLElement): string | null {
  const listImage = courseElement.querySelector<HTMLElement>('.list-image')
  if (listImage) {
    const bgImage = listImage.style.backgroundImage
    const match = bgImage.match(/^url\((['"]?)(.*?)\1\)$/)
    if (match && match[2]) {
      // Decode escaped quotes if necessary, but browser usually provides unescaped in inline style
      return match[2].replace(/&quot;/g, '')
    }
  }

  const img = courseElement.querySelector<HTMLImageElement>('img.courseimage')
  if (img && img.src) {
    return img.src
  }

  return null
}

function extractProgressText(courseElement: HTMLElement): string | null {
  const directMatch = queryFirstCleanText(courseElement, [
    '[data-region="progress"]',
    '.progress-text',
    '.completioninfo',
  ])

  if (directMatch && PROGRESS_PATTERN.test(directMatch)) {
    return directMatch.match(PROGRESS_PATTERN)?.[1] ?? directMatch
  }

  const fullText = getCleanText(courseElement)
  const match = fullText.match(PROGRESS_PATTERN)

  return match?.[1] ?? null
}

function extractArea(courseElement: HTMLElement, title: string): string | null {
  const directMatch = queryFirstCleanText(courseElement, AREA_SELECTORS)

  if (directMatch && directMatch !== title && !PROGRESS_PATTERN.test(directMatch)) {
    return directMatch
  }

  const candidateTexts = Array.from(
    courseElement.querySelectorAll<HTMLElement>(
      '.text-muted, small, .categoryname, .card-text, .muted, span, div',
    ),
  )
    .map((element) => getCleanText(element))
    .filter(Boolean)

  return (
    candidateTexts.find((text) => {
      return (
        text !== title &&
        text.length <= 120 &&
        !PROGRESS_PATTERN.test(text) &&
        !/favorite|favourite/i.test(text)
      )
    }) ?? null
  )
}

function extractFavorite(courseElement: HTMLElement): boolean {
  const favoriteIcon = courseElement.querySelector<HTMLElement>(
    '[data-region="is-favourite"]',
  )

  if (favoriteIcon) {
    return !favoriteIcon.classList.contains('hidden')
  }

  const removeFavoriteAction = courseElement.querySelector<HTMLElement>(
    '[data-action="remove-favourite"]',
  )

  if (removeFavoriteAction) {
    return !removeFavoriteAction.classList.contains('hidden')
  }

  return false
}

function extractSemesterRaw(
  title: string,
  area: string | null,
  courseElement: HTMLElement,
): string | null {
  const candidates = [
    title,
    area,
    getCleanText(courseElement),
  ].filter((value): value is string => Boolean(value))

  return candidates.find((value) => SEMESTER_PATTERN.test(value)) ?? null
}

function extractRawCourse(courseElement: HTMLElement): RawCourse | null {
  const title = extractTitle(courseElement)
  const url = getCourseUrl(courseElement)

  if (!title || !url) {
    return null
  }
  
  const imageUrl = extractImageUrl(courseElement)
  const area = extractArea(courseElement, title)
  const progressText = extractProgressText(courseElement)

  return {
    title,
    url,
    imageUrl,
    area,
    isFavorite: extractFavorite(courseElement),
    progressText,
    semesterRaw: extractSemesterRaw(title, area, courseElement),
    textContent: getCleanText(courseElement),
  }
}

export function extractCourses(root: ParentNode = document): Course[] {
  const courseElements = Array.from(
    root.querySelectorAll<HTMLElement>(COURSE_ITEM_SELECTOR),
  )

  const fallbackCourseElements =
    courseElements.length > 0
      ? courseElements
      : Array.from(root.querySelectorAll<HTMLAnchorElement>(COURSE_LINK_SELECTOR))
          .filter(isLikelyCourseLink)
          .map((anchor) => anchor.closest<HTMLElement>('li, article, .card') ?? anchor)

  const rawCourses = fallbackCourseElements
    .map((courseElement) => extractRawCourse(courseElement))
    .filter((course): course is RawCourse => course !== null)

  return uniqueBy(
    rawCourses.map((course) => normalizeCourse(course)),
    (course) => course.url,
  )
}
