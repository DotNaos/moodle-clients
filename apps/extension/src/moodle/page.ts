const OVERVIEW_ROOT_SELECTORS = [
  '.block_myoverview [data-region="courses-view"]',
  '.block_myoverview',
  '[data-region="myoverview"]',
  '[data-region="courses-view"]',
  '#frontpage-course-list',
]

const COURSE_LINK_SELECTOR = 'a[href*="/course/view.php"]'
const COURSE_ITEM_SELECTOR = '[data-region="course-content"], li.course-listitem'

function hasCourseLinks(element: Element, minimumCount = 2): boolean {
  return element.querySelectorAll(COURSE_LINK_SELECTOR).length >= minimumCount
}

function hasOverviewCourseItems(element: Element, minimumCount = 1): boolean {
  return element.querySelectorAll(COURSE_ITEM_SELECTOR).length >= minimumCount
}

export function findOverviewRoot(doc: Document = document): HTMLElement | null {
  for (const selector of OVERVIEW_ROOT_SELECTORS) {
    const matches = Array.from(doc.querySelectorAll<HTMLElement>(selector))

    for (const match of matches) {
      if (hasOverviewCourseItems(match) || hasCourseLinks(match)) {
        return match
      }
    }
  }

  return null
}

export function findSuppressionTarget(root: HTMLElement): HTMLElement {
  return (
    root.closest<HTMLElement>('#region-main') ??
    root.closest<HTMLElement>('.block_myoverview') ??
    root
  )
}

const HOST_IDS_WITHOUT_MARGIN = ['custom-moodle-ui-root-navbar', 'custom-moodle-ui-root-figma-capture']

export function createInjectionHost(
  target: HTMLElement,
  hostId = 'custom-moodle-ui-root',
  insertMethod: 'before' | 'prepend' | 'append' = 'before',
): HTMLElement {
  const host = document.createElement('section')

  host.id = hostId
  host.style.display = 'block'
  host.style.width = '100%'
  host.style.marginBottom = HOST_IDS_WITHOUT_MARGIN.includes(hostId) ? '0' : '1.5rem'

  if (insertMethod === 'prepend') {
    target.prepend(host)
  } else if (insertMethod === 'append') {
    target.appendChild(host)
  } else {
    target.before(host)
  }

  return host
}

export function suppressElement(target: HTMLElement): void {
  target.dataset.customMoodleUiSuppressed = 'true'
  target.style.setProperty('display', 'none', 'important')
}

export function suppressSelectors(selectors: string[], doc: Document = document): void {
  for (const selector of selectors) {
    const matches = doc.querySelectorAll<HTMLElement>(selector)

    for (const match of matches) {
      match.dataset.customMoodleUiSuppressed = 'true'
      match.style.setProperty('display', 'none', 'important')
    }
  }
}

export function softenOriginalCourseLayout(): void {
  // Let the CSS overrides handle the layout — clear any Moodle inline padding
  const page = document.getElementById('page')
  if (page) {
    page.style.padding = '0'
    page.style.margin = '0'
    page.style.maxWidth = 'none'
  }

  const pageContent = document.getElementById('page-content')
  if (pageContent) {
    pageContent.style.padding = '0'
    pageContent.style.maxWidth = 'none'
  }

  const regionMainBox = document.getElementById('region-main-box')
  if (regionMainBox) {
    regionMainBox.style.padding = '0'
    regionMainBox.style.maxWidth = 'none'
  }

  const mainInner = document.querySelector<HTMLElement>('.main-inner')
  if (mainInner) {
    mainInner.style.paddingLeft = '0'
    mainInner.style.paddingRight = '0'
  }
}

export function softenOriginalOverviewLayout(): void {
  const pageContent = document.getElementById('page-content')
  const regionMainBox = document.getElementById('region-main-box')
  
  if (pageContent) {
    pageContent.style.padding = '0'
    pageContent.style.maxWidth = 'none'
  }

  if (regionMainBox) {
    regionMainBox.style.padding = '0'
  }

  const mainInner = document.querySelector<HTMLElement>('.main-inner')
  if (mainInner) {
    mainInner.style.paddingLeft = '0'
    mainInner.style.paddingRight = '0'
  }
}
