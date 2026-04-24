import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  File,
  FileText,
  Folder,
  Link as LinkIcon,
  MessageSquare,
  Video,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { type CoursePageActivity, type CoursePageSection } from '@/moodle/extract-course-page'

type CourseHeroAppProps = {
  title: string
  heroImageUrl: string | null
}

type CourseTimelineAppProps = {
  title: string
  sections: CoursePageSection[]
}

type CourseMainContentAppProps = {
  sections: CoursePageSection[]
}

/** 1-based display number; intro (section 0) stays "0", rest are 1, 2, 3, … */
function getDisplaySectionNumber(index: number, sections: CoursePageSection[]): string {
  const hasIntroSection = sections[0]?.number === '0'
  if (hasIntroSection && index === 0) return '0'
  const n = index + (hasIntroSection ? 0 : 1)
  return String(Math.floor(n))
}

function getSectionHref(section: CoursePageSection): string {
  return section.anchorId ? `#${section.anchorId}` : section.url ?? '#'
}

function getSectionTarget(anchorId: string): HTMLElement | null {
  const mainHost = document.getElementById('custom-moodle-ui-root-course-main')
  const shadowTarget = mainHost?.shadowRoot?.getElementById(anchorId)
  return shadowTarget ?? document.getElementById(anchorId)
}

function getActivityIcon(type: string | null) {
  if (!type) return <File className="size-4 text-muted-foreground/70" />

  const normalizedType = type.toLowerCase()
  if (normalizedType.includes('pdf')) {
    return <FileText className="size-4 text-red-500/80" />
  }
  if (normalizedType.includes('folder') || normalizedType.includes('dir')) {
    return <Folder className="size-4 text-blue-500/80" />
  }
  if (normalizedType.includes('url') || normalizedType.includes('link')) {
    return <LinkIcon className="size-4 text-emerald-500/80" />
  }
  if (normalizedType.includes('forum') || normalizedType.includes('chat')) {
    return <MessageSquare className="size-4 text-indigo-500/80" />
  }
  if (normalizedType.includes('video') || normalizedType.includes('page')) {
    return <Video className="size-4 text-purple-500/80" />
  }
  if (normalizedType.includes('assign') || normalizedType.includes('quiz')) {
    return <ClipboardList className="size-4 text-amber-500/80" />
  }

  return <File className="size-4 text-muted-foreground/70" />
}

function CourseRichText({ html }: Readonly<{ html: string }>) {
  return (
    <div
      className="text-[0.95rem] leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_img]:inline-block [&_img]:max-h-8 [&_img]:w-auto [&_img]:align-middle [&_li]:mb-1 [&_ol]:my-3 [&_ol]:pl-5 [&_p]:my-3 [&_strong]:text-foreground [&_ul]:my-3 [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function CourseLabelBlock({ activity }: Readonly<{ activity: CoursePageActivity }>) {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-3 text-foreground">
        {activity.imageUrl ? (
          <img
            src={activity.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 object-contain"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <File className="size-4" />
          </div>
        )}
        <h3 className="text-[1.75rem] font-semibold tracking-tight text-foreground">
          {activity.title}
        </h3>
      </div>
      {activity.bodyHtml ? <CourseRichText html={activity.bodyHtml} /> : null}
    </div>
  )
}

function CourseActivityRow({ activity }: Readonly<{ activity: CoursePageActivity }>) {
  if (!activity.url) {
    return null
  }

  return (
    <a
      href={activity.url}
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-transparent px-4 py-4 transition-colors hover:border-border hover:bg-card/70 no-underline"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        {getActivityIcon(activity.type)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="line-clamp-1 text-[1.05rem] font-medium text-foreground transition-colors group-hover:text-primary">
            {activity.title}
          </span>
          {activity.type ? (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-widest text-muted-foreground">
              {activity.type}
            </span>
          ) : null}
        </div>
        {activity.details ? (
          <div className="mt-1 line-clamp-1 text-sm text-muted-foreground">
            {activity.details}
          </div>
        ) : null}
      </div>
      <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground transition-colors group-hover:text-foreground">
        <ChevronRight className="size-4" />
      </div>
    </a>
  )
}

export function CourseHeroApp({ title, heroImageUrl }: Readonly<CourseHeroAppProps>) {
  return (
    <div className="moodle-ui w-full">
      {heroImageUrl ? (
        <div className="relative h-[280px] w-full overflow-hidden bg-muted md:h-[360px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageUrl})` }}
          />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/55 to-background/10" />
          <div className="absolute inset-0 flex flex-col">
            <div className="mx-auto w-full max-w-[1280px] px-6 pt-5 sm:px-8">
              <a
                href="/my/courses.php"
                className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1.5 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-background no-underline"
              >
                <ArrowLeft className="size-4" />
                <span>Meine Kurse</span>
              </a>
            </div>
            <div className="mx-auto mt-auto w-full max-w-[1280px] px-6 pb-8 sm:px-8">
              <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-foreground drop-shadow-sm md:text-5xl">
                {title}
              </h1>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1280px] px-6 pb-2 pt-8 sm:px-8">
          <a
            href="/my/courses.php"
            className="mb-5 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent no-underline"
          >
            <ArrowLeft className="size-4" />
            <span>Meine Kurse</span>
          </a>
          <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            {title}
          </h1>
        </div>
      )}
    </div>
  )
}

export function CourseTimelineApp({ title, sections }: Readonly<CourseTimelineAppProps>) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(sections[0]?.anchorId ?? null)
  const activeFromClickRef = useRef(false)
  const visibleSectionsRef = useRef(new Map<string, boolean>())

  useEffect(() => {
    if (!sections.length) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibleSectionsRef.current.set(entry.target.id, entry.isIntersecting)
        })

        if (activeFromClickRef.current) {
          return
        }

        const firstVisibleSection = sections.find((section) =>
          visibleSectionsRef.current.get(section.anchorId),
        )

        if (firstVisibleSection) {
          setActiveSectionId(firstVisibleSection.anchorId)
        }
      },
      {
        rootMargin: '-12% 0px -70% 0px',
        threshold: 0,
      },
    )

    const timeout = setTimeout(() => {
      sections.forEach((section) => {
        const target = getSectionTarget(section.anchorId)
        if (target) {
          observer.observe(target)
        }
      })
    }, 60)

    return () => {
      clearTimeout(timeout)
      observer.disconnect()
    }
  }, [sections])

  return (
    <div className="moodle-ui py-1">
      <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        {title}
      </p>
      <Separator className="mb-3 mt-2" />
      <nav>
        <ul className="m-0 list-none space-y-1 p-0">
          {sections.map((section, index) => {
            const isActive = activeSectionId === section.anchorId
            const displayNumber = getDisplaySectionNumber(index, sections)

            return (
              <li key={section.id} className="flex flex-col">
                <a
                  href={getSectionHref(section)}
                  onClick={(event) => {
                    event.preventDefault()
                    setActiveSectionId(section.anchorId)
                    activeFromClickRef.current = true

                    const target = getSectionTarget(section.anchorId)
                    if (target) {
                      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }

                    globalThis.setTimeout(() => {
                      activeFromClickRef.current = false
                    }, 900)
                  }}
                  className={`rounded-xl px-2 py-2 transition-colors no-underline ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`min-w-6 pt-0.5 text-right text-[10px] font-mono tabular-nums ${
                        isActive ? 'text-primary/60' : 'text-muted-foreground/40'
                      }`}
                    >
                      {displayNumber}.
                    </span>
                    <span className="line-clamp-2 text-[0.82rem] leading-snug">
                      {section.title}
                    </span>
                  </div>
                </a>

                {isActive && section.activities.length > 0 ? (
                  <ul className="m-0 mt-1 list-none space-y-0.5 border-l border-border">
                    {section.activities
                      .filter((activity) => activity.title)
                      .map((activity) => (
                        <li
                          key={activity.id}
                          className={activity.isLabel ? 'ml-3 pl-2' : 'ml-6 pl-3'}
                        >
                          <span className="flex items-center gap-2 py-1.5 text-[0.75rem] text-muted-foreground">
                            {activity.imageUrl && activity.isLabel ? (
                              <img src={activity.imageUrl} alt="" className="h-4 w-4 shrink-0 object-contain" />
                            ) : (
                              getActivityIcon(activity.type)
                            )}
                            <span className="line-clamp-1">{activity.title}</span>
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

export function CourseMainContentApp({ sections }: Readonly<CourseMainContentAppProps>) {
  return (
    <div className="moodle-ui mx-auto w-full max-w-[920px] pb-24">
      {sections.map((section, index) => {
        const displayNumber = getDisplaySectionNumber(index, sections)

        return (
        <section
          key={section.id}
          id={section.anchorId}
          className={`scroll-mt-24 ${index > 0 ? 'border-t border-border/80 pt-14' : ''}`}
        >
          <div className="mb-6 flex items-baseline gap-3 pb-6">
            <span className="shrink-0 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {displayNumber}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                {section.title}
              </h2>
              {section.summaryHtml ? (
                <div className="mt-3">
                  <CourseRichText html={section.summaryHtml} />
                </div>
              ) : null}
            </div>
          </div>
          <Separator className="mb-6 h-0.5 w-full shrink-0 bg-slate-300" />

          <div className="space-y-3">
            {section.activities.map((activity) =>
              activity.isLabel ? (
                <CourseLabelBlock key={activity.id} activity={activity} />
              ) : (
                <CourseActivityRow key={activity.id} activity={activity} />
              ),
            )}
          </div>
        </section>
        )
      })}
    </div>
  )
}
