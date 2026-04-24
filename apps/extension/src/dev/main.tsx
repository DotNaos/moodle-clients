import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DevApp } from './dev-app'
import './dev-styles.css'

// Mock chrome.runtime.getURL for dev mode
// so the navbar logo and other extension resources resolve correctly.
if (!globalThis.chrome?.runtime?.getURL) {
  const chromeShim = {
    runtime: {
      getURL: (path: string) => `/${path}`,
    },
  }
  Object.assign(globalThis, { chrome: chromeShim })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DevApp />
  </StrictMode>,
)
