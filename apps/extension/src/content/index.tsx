import { CustomNavbar } from '@/components/navbar'
import { FigmaCaptureWidget } from '@/dev/figma-capture-widget'
import { mountShadowApp } from '@/content/mount'
import {
  CourseHeroApp,
  CourseMainContentApp,
  CourseTimelineApp,
} from '@/components/course-page'
import {
  AaiLoginApp,
  LoginSelectApp,
  OverviewPageApp,
} from '@/components/page-apps'
import { extractCourses } from '@/moodle/extract-courses'
import { extractAaiLoginData } from '@/moodle/extract-aai-login'
import { extractCoursePageData } from '@/moodle/extract-course-page'
import { extractLoginSelectData } from '@/moodle/extract-login-select'
import { extractNavbarData } from '@/moodle/extract-navbar'
import {
  findOverviewRoot,
  findSuppressionTarget,
  softenOriginalCourseLayout,
  softenOriginalOverviewLayout,
  suppressElement,
  suppressSelectors,
} from '@/moodle/page'
import { detectMoodlePage } from '@/moodle/routes'

function renderOverview(kind: 'dashboard' | 'courses'): boolean {
  const overviewRoot = findOverviewRoot()

  if (!overviewRoot) {
    return false
  }

  const courses = extractCourses(overviewRoot)

  if (courses.length === 0) {
    return false
  }

  const suppressionTarget = findSuppressionTarget(overviewRoot)
  const mounted = mountShadowApp({
    hostId: `custom-moodle-ui-root-${kind}`,
    target: suppressionTarget,
    app: (
      <OverviewPageApp
        courses={courses}
        title={kind === 'dashboard' ? 'Dashboard' : 'Meine Kurse'}
      />
    ),
  })

  softenOriginalCourseLayout()
  softenOriginalOverviewLayout()
  suppressElement(suppressionTarget)
  suppressSelectors([
    '#page-header',
    '.block_html:has(a[href*="evasysplus.de"])',
    '.block_html:has(a[href*="Evasys"])'
  ])
  return mounted
}

function renderLoginSelect(): boolean {
  const loginSelectData = extractLoginSelectData()
  const loginRoot =
    document.querySelector<HTMLElement>('.login-container') ??
    document.querySelector<HTMLElement>('#region-main') ??
    document.querySelector<HTMLElement>('.loginform') ??
    document.querySelector<HTMLFormElement>('form.login-form#login')

  if (!loginSelectData || !loginRoot) {
    return false
  }

  const mounted = mountShadowApp({
    hostId: 'custom-moodle-ui-root-login-select',
    target: loginRoot,
    app: <LoginSelectApp {...loginSelectData} />,
  })

  suppressElement(loginRoot)
  suppressSelectors(['#wayf_div', '#theme_boost_union-loginorder', '#loginbackgroundimagetext'])
  return mounted
}

function renderAaiLogin(): boolean {
  const aaiLoginData = extractAaiLoginData()
  const aaiRoot =
    document.querySelector<HTMLElement>('.aai_box') ??
    document.querySelector<HTMLElement>('.aai_login_field')

  if (!aaiLoginData || !aaiRoot) {
    return false
  }

  const mounted = mountShadowApp({
    hostId: 'custom-moodle-ui-root-aai-login',
    target: aaiRoot,
    app: <AaiLoginApp {...aaiLoginData} />,
  })

  suppressElement(aaiRoot)
  return mounted
}

function renderCoursePage(): boolean {
  const coursePageData = extractCoursePageData()
  const courseRoot = document.getElementById('region-main')
  const pageContent = document.getElementById('page-content')

  if (!coursePageData || !courseRoot || !pageContent) {
    return false
  }

  // Mount the Hero/Breadcrumbs above the main layout
  mountShadowApp({
    hostId: 'custom-moodle-ui-root-course-hero',
    target: document.getElementById('region-main-box') ?? pageContent,
    insertMethod: 'before',
    app: <CourseHeroApp title={coursePageData.title} heroImageUrl={coursePageData.heroImageUrl} />,
  })

  // Mount the sidebar TOC next to the main content
  const mounted = mountShadowApp({
    hostId: 'custom-moodle-ui-root-course',
    target: courseRoot,
    app: <CourseTimelineApp title={coursePageData.title} sections={coursePageData.sections} />,
  })

  // Mount the main content replacing .course-content
  const courseContent = courseRoot.querySelector('.course-content')
  if (courseContent) {
    mountShadowApp({
      hostId: 'custom-moodle-ui-root-course-main',
      target: courseContent as HTMLElement,
      insertMethod: 'before',
      app: <CourseMainContentApp sections={coursePageData.sections} />,
    })
    suppressElement(courseContent as HTMLElement)
  }

  softenOriginalCourseLayout()
  suppressSelectors([
    '#page-header',
    '#courseheaderimage',
    '.secondary-navigation',
    '#user-notifications',
    'button[data-toggler="drawers"][data-target="theme_boost-drawers-primary"]',
    'button[data-toggler="drawers"][data-target="theme_boost-drawers-courseindex"]',
  ])

  // Inject global CSS overrides: two-column layout + document-style sections
  const styleId = 'custom-moodle-ui-course-overrides'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      /* ── Fix topofscroll margin for edge-to-edge layout ── */
      #topofscroll {
        margin-top: 0 !important;
        padding-top: 0 !important;
        max-width: none !important;
        width: 100% !important;
      }

      /* ── Two-column layout: sticky sidebar TOC + main content ── */
      #region-main-box {
        display: flex !important;
        align-items: flex-start !important;
        gap: 2.5rem !important;
        padding: 1.5rem 2rem !important;
        max-width: 1360px !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
      }
      section#custom-moodle-ui-root-course {
        width: 240px !important;
        min-width: 240px !important;
        flex-shrink: 0 !important;
        position: sticky !important;
        top: 4.5rem !important;
        max-height: calc(100dvh - 5.5rem) !important;
        overflow-y: auto !important;
        margin-bottom: 0 !important;
        padding-right: 1rem !important;
        background: none !important;
      }
      #region-main {
        flex: 1 !important;
        min-width: 0 !important;
        max-width: none !important;
        margin: 0 !important;
      }
      
      #custom-moodle-ui-root-course-main {
        display: block !important;
        width: 100% !important;
      }
    `
    document.head.appendChild(style)
  }

  return mounted
}

function renderGlobalNavbar(): boolean {
  const navbarData = extractNavbarData()
  const originalNavbar = document.querySelector<HTMLElement>('.navbar.fixed-top')

  if (!navbarData || !originalNavbar) {
    return false
  }

  const mounted = mountShadowApp({
    hostId: 'custom-moodle-ui-root-navbar',
    target: document.body,
    insertMethod: 'prepend',
    app: <CustomNavbar data={navbarData} />,
  })

  if (mounted) {
    suppressElement(originalNavbar)
    
    // Create a spacer to prevent content from going under the fixed navbar
    let spacer = document.getElementById('custom-moodle-ui-navbar-spacer')
    if (!spacer) {
      spacer = document.createElement('div')
      spacer.id = 'custom-moodle-ui-navbar-spacer'
      spacer.style.height = '3.5rem' // 14 spacing from tailwind (56px)
      document.body.prepend(spacer)
    }
  }

  return mounted
}

function renderFigmaCaptureWidget(): boolean {
  if (document.getElementById('custom-moodle-ui-root-figma-capture')) {
    return true
  }
  return mountShadowApp({
    hostId: 'custom-moodle-ui-root-figma-capture',
    target: document.body,
    insertMethod: 'append',
    app: <FigmaCaptureWidget />,
  })
}

function renderCurrentPage(): boolean {
  const pageKind = detectMoodlePage()

  if (!pageKind) {
    return false
  }

  if (pageKind === 'dashboard') {
    globalThis.location.replace('/my/courses.php')
    return true
  }

  switch (pageKind) {
    case 'courses':
      return renderOverview(pageKind)
    case 'login-select':
      return renderLoginSelect()
    case 'aai-login':
      return renderAaiLogin()
    case 'course':
      return renderCoursePage()
    default:
      return false
  }
}

function boot(): void {
  renderGlobalNavbar()
  renderFigmaCaptureWidget()

  // Globally suppress the footer and footnote
  suppressSelectors(['#page-footer', '#footnote'])

  if (renderCurrentPage()) {
    return
  }

  const observer = new MutationObserver(() => {
    renderGlobalNavbar()
    if (renderCurrentPage()) {
      observer.disconnect()
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  globalThis.setTimeout(() => observer.disconnect(), 20_000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
