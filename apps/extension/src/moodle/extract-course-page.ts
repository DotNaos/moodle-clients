import { normalizeWhitespace } from '@/lib/utils'

export type CoursePageActivity = {
  id: string
  title: string
  url: string | null
  type: string | null
  details: string | null
  isLabel: boolean
  imageUrl: string | null
  bodyHtml: string | null
}

export type CoursePageSection = {
  id: string
  title: string
  number: string
  anchorId: string
  url: string | null
  summaryHtml: string | null
  activities: CoursePageActivity[]
}

export type Breadcrumb = {
  label: string
  url: string | null
}

export type CoursePageData = {
  title: string
  heroImageUrl: string | null
  breadcrumbs: Breadcrumb[]
  sections: CoursePageSection[]
}

function extractActivityType(activityElement: HTMLElement): string | null {
  // Prefer the visible badge text (e.g. "PDF", "Video") over the modtype class
  const badge = activityElement.querySelector<HTMLElement>('.activitybadge')
  const badgeText = normalizeWhitespace(badge?.textContent ?? '').trim()
  if (badgeText) return badgeText

  const className = Array.from(activityElement.classList).find((name) =>
    name.startsWith('modtype_'),
  )
  return className?.replace('modtype_', '') ?? null
}

function cleanInstanceName(instanceNameElement: HTMLElement): string {
  // Clone so we don't mutate the real DOM, strip hidden accessibility spans
  const clone = instanceNameElement.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.accesshide').forEach((el) => el.remove())
  return normalizeWhitespace(clone.textContent ?? '')
}

function extractActivityDetails(activityElement: HTMLElement): string | null {
  const detailsElement = activityElement.querySelector<HTMLElement>('.resourcelinkdetails, .activity-info')
  if (!detailsElement) return null
  return normalizeWhitespace(detailsElement.textContent ?? '').trim()
}

function stripNoisyMarkup(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll(
    '.accesshide, .visually-hidden, script, style, .path-mod, .commands, [data-region="completion-info"]',
  ).forEach((node) => node.remove())
  return clone
}

function extractSectionSummary(sectionElement: HTMLElement): string | null {
  const summaryElement = sectionElement.querySelector<HTMLElement>('[data-for="sectioninfo"] .summarytext')
  if (!summaryElement) return null

  const clone = stripNoisyMarkup(summaryElement)
  const text = normalizeWhitespace(clone.textContent ?? '')
  return text ? clone.innerHTML.trim() : null
}

function extractActivityImageUrl(activityElement: HTMLElement): string | null {
  const image = activityElement.querySelector<HTMLImageElement>(
    '.activity-icon img, .activityiconcontainer img, .activity-altcontent img',
  )
  return image?.src ?? null
}

function extractLabelContent(activityElement: HTMLElement): {
  title: string
  imageUrl: string | null
  bodyHtml: string | null
} {
  const content = activityElement.querySelector<HTMLElement>('.activity-altcontent')
  if (!content) {
    return {
      title: '',
      imageUrl: null,
      bodyHtml: null,
    }
  }

  const clone = stripNoisyMarkup(content)
  const heading = clone.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6')
  const imageUrl =
    heading?.querySelector<HTMLImageElement>('img')?.src ??
    clone.querySelector<HTMLImageElement>('img')?.src ??
    null
  const title = normalizeWhitespace(heading?.textContent ?? '')

  if (heading) {
    heading.remove()
  }

  clone.querySelectorAll('br').forEach((node) => {
    if (!node.previousSibling && !node.nextSibling) {
      node.remove()
    }
  })

  const bodyText = normalizeWhitespace(clone.textContent ?? '')
  return {
    title,
    imageUrl,
    bodyHtml: bodyText ? clone.innerHTML.trim() : null,
  }
}

function isDividerLikeLabel(title: string, bodyHtml: string | null): boolean {
  const htmlText = normalizeWhitespace((bodyHtml ?? '').replaceAll(/<[^>]+>/g, ' '))
  const combinedText = normalizeWhitespace([title, htmlText].filter(Boolean).join(' '))
  return /^[_\-\s.]{6,}$/.test(combinedText)
}

export function extractCoursePageData(
  doc: Document = document,
): CoursePageData | null {
  const title = normalizeWhitespace(
    doc.querySelector('.page-header-headings h1')?.textContent ?? '',
  )

  if (!title) {
    return null
  }

  const breadcrumbs = Array.from(
    doc.querySelectorAll<HTMLElement>('nav[aria-label="Navigationsleiste"] ol.breadcrumb li.breadcrumb-item')
  ).map((item) => {
    const link = item.querySelector('a')
    return {
      label: normalizeWhitespace(item.textContent ?? ''),
      url: link?.href ?? null,
    }
  }).filter(b => b.label.length > 0)

  // Usually the first breadcrumb is "Startseite" or similar, we might want to keep or filter it depending on UI, 
  // but extracting all is safe.

  const heroBackgroundImage = doc.getElementById('courseheaderimage')?.style.backgroundImage
  let heroImageUrl = null
  if (heroBackgroundImage) {
    const match = /url\(['"]?(.*?)['"]?\)/.exec(heroBackgroundImage)
    if (match?.[1]) {
      heroImageUrl = match[1]
    }
  }

  const courseRoot = doc.getElementById('region-main') ?? doc.body
  const sections = Array.from(
    courseRoot.querySelectorAll<HTMLElement>('li[data-for="section"][data-id]'),
  ).map((sectionElement) => {
    const titleLink = sectionElement.querySelector<HTMLAnchorElement>(
      'h3[data-for="section_title"] a, h3.sectionname a'
    )

    const title = sectionElement.dataset.sectionname?.trim() || normalizeWhitespace(
      titleLink?.textContent ?? sectionElement.querySelector<HTMLElement>('[data-for="section_title"]')?.textContent ?? ''
    )
    const summaryHtml = extractSectionSummary(sectionElement)

    const activities = Array.from(
      sectionElement.querySelectorAll<HTMLElement>('li[data-for="cmitem"]'),
    )
      .map((activityElement) => {
        const isLabel = activityElement.querySelector('.activityinline') !== null
        const labelContent = isLabel
          ? extractLabelContent(activityElement)
          : { title: '', imageUrl: null, bodyHtml: null }

        const instanceNameElement =
          activityElement.querySelector<HTMLElement>('.instancename')
        const link =
          instanceNameElement?.closest<HTMLAnchorElement>('a') ??
          activityElement.querySelector<HTMLAnchorElement>('a[href]')

        let activityTitle = ''
        if (isLabel) {
          activityTitle =
            labelContent.title ||
            normalizeWhitespace(activityElement.querySelector('.activity-altcontent')?.textContent ?? '')
        } else {
          activityTitle = instanceNameElement
            ? cleanInstanceName(instanceNameElement)
            : normalizeWhitespace(link?.textContent ?? '')
        }

        if (!activityTitle && !labelContent.bodyHtml) {
          return null
        }

        if (isLabel && isDividerLikeLabel(activityTitle, labelContent.bodyHtml)) {
          return null
        }

        return {
          id: activityElement.dataset.id ?? activityElement.id ?? link?.href ?? activityTitle,
          title: activityTitle,
          url: link?.href ?? null,
          type: extractActivityType(activityElement),
          details: extractActivityDetails(activityElement),
          isLabel,
          imageUrl: isLabel ? labelContent.imageUrl : extractActivityImageUrl(activityElement),
          bodyHtml: isLabel ? labelContent.bodyHtml : null,
        }
      })
      .filter((activity): activity is CoursePageActivity => activity !== null)

    return {
      id: sectionElement.dataset.id ?? sectionElement.id,
      title,
      number: sectionElement.dataset.number ?? '',
      anchorId: sectionElement.id,
      url: titleLink?.href ?? null,
      summaryHtml,
      activities,
    }
  })

  return {
    title,
    heroImageUrl,
    breadcrumbs,
    sections: sections.filter((section) => section.title.length > 0),
  }
}
