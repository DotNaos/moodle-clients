import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createInjectionHost } from '@/moodle/page'
import shadowStyles from '@/styles/shadow.css?inline'

type MountShadowAppOptions = {
  hostId: string
  target: HTMLElement
  insertMethod?: 'before' | 'prepend' | 'append'
  app: ReactNode
}

export function mountShadowApp({
  hostId,
  target,
  insertMethod = 'before',
  app,
}: MountShadowAppOptions): boolean {
  if (document.getElementById(hostId)) {
    return true
  }

  const host = createInjectionHost(target, hostId, insertMethod)
  const shadowRoot = host.attachShadow({ mode: 'open' })
  const styleElement = document.createElement('style')
  const appElement = document.createElement('div')

  styleElement.textContent = shadowStyles
  shadowRoot.append(styleElement, appElement)

  createRoot(appElement).render(<StrictMode>{app}</StrictMode>)
  return true
}
