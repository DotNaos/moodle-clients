import { normalizeWhitespace } from '@/lib/utils'

export type NavbarData = {
  userName: string
  avatarUrl: string | null
  logoutUrl: string
  profileUrl: string
  notificationCount: number
}

export function extractNavbarData(doc: Document = document): NavbarData | null {
  const userName = doc.querySelector('#navuserfullname')?.textContent ?? ''
  const avatarUrl = doc.querySelector('img.userpicture')?.getAttribute('src') ?? null
  const logoutUrl = doc.querySelector('a[href*="/login/logout.php"]')?.getAttribute('href')
  const profileUrl = doc.querySelector('a[href*="/user/profile.php"]')?.getAttribute('href')
  
  const notifCountEl = doc.querySelector('.popover-region-notifications .count-container')
  const notificationCount = notifCountEl && !notifCountEl.classList.contains('hidden') 
    ? parseInt(normalizeWhitespace(notifCountEl.textContent ?? '0'), 10) || 0
    : 0

  if (!userName || !logoutUrl) {
    return null
  }

  return {
    userName: normalizeWhitespace(userName),
    avatarUrl,
    logoutUrl,
    profileUrl: profileUrl ?? '#',
    notificationCount,
  }
}
