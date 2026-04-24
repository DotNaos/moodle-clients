export type MoodlePageKind =
  | 'dashboard'
  | 'courses'
  | 'login-select'
  | 'aai-login'
  | 'course'

export function detectMoodlePage(
  location: Location = window.location,
): MoodlePageKind | null {
  if (location.origin === 'https://moodle.fhgr.ch') {
    if (/^\/my\/(?:index\.php)?$/.test(location.pathname)) {
      return 'dashboard'
    }

    if (location.pathname === '/my/courses.php') {
      return 'courses'
    }

    if (location.pathname === '/login/index.php') {
      return 'login-select'
    }

    if (location.pathname === '/course/view.php') {
      return 'course'
    }
  }

  if (
    location.origin === 'https://aai-login.fhgr.ch' &&
    location.pathname.startsWith('/idp/profile/SAML2/Redirect/SSO')
  ) {
    return 'aai-login'
  }

  return null
}
