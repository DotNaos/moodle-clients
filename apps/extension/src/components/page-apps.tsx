import { useMemo, useState } from 'react'
import { Search, ShieldCheck, ChevronRight } from 'lucide-react'
import { BucketSection } from '@/components/bucket-section'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { type Course } from '@/domain/course'
import { groupCourses } from '@/domain/group-courses'
import { getCurrentSemester } from '@/domain/semester'
import { normalizeWhitespace } from '@/lib/utils'
import { type HiddenFormField } from '@/moodle/extract-login-select'

type OverviewPageAppProps = {
  title: string
  courses: Course[]
}

/** Login is 2-step: this page is only for selecting school (FHGR). Manual/direct login is not supported. */
type LoginSelectAppProps = {
  shibbolethUrl: string | null
  wayfAction: string | null
  manualAction?: string
  manualHiddenFields?: HiddenFormField[]
  forgotPasswordUrl?: string | null
}

type AaiLoginAppProps = {
  action: string
  hiddenFields: HiddenFormField[]
  usernamePlaceholder: string
  passwordPlaceholder: string
  supportUrl: string | null
  revokeConsentLabel: string | null
  revokeConsentChecked: boolean
}

function matchesSearch(course: Course, searchValue: string): boolean {
  if (!searchValue) {
    return true
  }

  const haystack = normalizeWhitespace(
    [course.title, course.area, course.progressText, course.semesterRaw]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase()

  return haystack.includes(searchValue)
}

export function OverviewPageApp({
  title,
  courses,
}: Readonly<OverviewPageAppProps>) {
  const [searchValue, setSearchValue] = useState('')
  const normalizedSearchValue = normalizeWhitespace(searchValue).toLowerCase()
  const filteredCourses = useMemo(() => {
    return courses.filter((course) => matchesSearch(course, normalizedSearchValue))
  }, [courses, normalizedSearchValue])
  const groupedBuckets = useMemo(() => {
    return groupCourses(filteredCourses, getCurrentSemester())
  }, [filteredCourses])

  return (
    <div className="moodle-ui mx-auto w-full py-4 sm:py-6">
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <div className="w-full sm:w-72">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  className="h-10 border-border/80 bg-card pl-10"
                  placeholder="Kurse durchsuchen..."
                  type="search"
                />
              </label>
            </div>
          </div>
          <Separator />
        </div>
        <div className="space-y-4">
          {filteredCourses.length > 0 ? (
            groupedBuckets.map((bucket) => (
              <BucketSection key={bucket.key} bucket={bucket} />
            ))
          ) : (
            <Card className="border-dashed border-border/80 bg-card shadow-none">
              <CardContent className="flex flex-col items-start gap-3 p-6">
                <div className="text-sm font-medium text-foreground">
                  Keine Kurse zur Suche gefunden
                </div>
                <p className="text-sm text-muted-foreground">
                  Passe den Suchbegriff an oder lade die Moodle-Seite neu, falls
                  sich die Kursliste gerade aktualisiert hat.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => globalThis.location.reload()}
                >
                  Moodle neu laden
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export function LoginSelectApp({
  shibbolethUrl,
  wayfAction,
}: Readonly<LoginSelectAppProps>) {
  let loginAction = null
  if (shibbolethUrl) {
    loginAction = (
      <Button asChild className="w-fit">
        <a href={shibbolethUrl}>
          Mit FHGR-Konto weiter
          <ChevronRight className="size-4" />
        </a>
      </Button>
    )
  } else if (wayfAction) {
    loginAction = (
      <form action={wayfAction} method="post" className="m-0 p-0">
        <input type="hidden" name="user_idp" value="https://aai-login.fhgr.ch/idp/shibboleth" />
        <Button type="submit" className="w-fit">
          Mit FHGR-Konto weiter
          <ChevronRight className="size-4" />
        </Button>
      </form>
    )
  }

  return (
    <div className="moodle-ui mx-auto flex min-h-dvh w-full max-w-sm items-center p-4 sm:p-6">
      <Card className="w-full border-border/80 bg-background/95 shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Lernplattform Login
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Mit FHGR-Konto anmelden.
          </p>
        </CardHeader>
        <CardContent>{loginAction}</CardContent>
      </Card>
    </div>
  )
}

export function AaiLoginApp({
  action,
  hiddenFields,
  supportUrl,
  revokeConsentLabel,
  revokeConsentChecked,
}: Readonly<AaiLoginAppProps>) {
  return (
    <div className="moodle-ui mx-auto flex min-h-dvh w-full max-w-xl items-center p-4 sm:p-6">
      <Card className="w-full border-border/80 bg-background/95 shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            AAI Login
          </div>
          <CardTitle className="text-3xl font-semibold tracking-tight">
            Mit FHGR-Zugang anmelden
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Die Anmeldung wird weiterhin direkt an das bestehende FHGR-AAI-Formular
            gesendet. Diese Oberfläche reduziert nur das sichtbare Login-Chrome.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={action} method="post" className="space-y-4">
            {hiddenFields.map((field) => (
              <input
                key={`${field.name}-${field.value}`}
                type="hidden"
                name={field.name}
                value={field.value}
              />
            ))}
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="aai-username"
              >
                Benutzername
              </label>
              <Input
                id="aai-username"
                name="j_username"
                autoComplete="username"
                placeholder="Anmeldename"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="aai-password"
              >
                Passwort
              </label>
              <Input
                id="aai-password"
                name="j_password"
                type="password"
                autoComplete="current-password"
                placeholder="Passwort"
                className="h-11"
              />
            </div>
            {revokeConsentLabel ? (
              <label className="flex items-start gap-3 rounded-lg border border-border/80 bg-card px-3 py-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name="_shib_idp_revokeConsent"
                  defaultChecked={revokeConsentChecked}
                  className="mt-1 size-4 rounded border-border"
                  value="true"
                />
                <span>Einwilligung zur Weitergabe von Attributen widerrufen</span>
              </label>
            ) : null}
            <Button type="submit" name="_eventId_proceed" value="Login" className="w-full">
              Weiter zur Anmeldung
            </Button>
          </form>
          {supportUrl ? (
            <>
              <Separator />
              <a href={supportUrl} className="text-sm text-primary hover:underline">
                Hilfe bei Zugangsproblemen
              </a>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
