import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const projectRoot = process.cwd()
const extensionPath = path.resolve(projectRoot, 'dist')
const userDataDir = path.resolve(projectRoot, '.playwright', 'chromium-extension-profile')
const arg = process.argv[2]
const targetUrl = arg && !arg.startsWith('-') ? arg : 'https://moodle.fhgr.ch/my/courses.php'

if (arg === '--help' || arg === '-h') {
  console.log('Usage: bun run playwright:extension [url]')
  console.log('Example: bun run playwright:extension "https://moodle.fhgr.ch/my/courses.php"')
  process.exit(0)
}

if (!fs.existsSync(extensionPath)) {
  console.error('Missing dist/ build. Run `bun run build` first.')
  process.exit(1)
}

fs.mkdirSync(userDataDir, { recursive: true })

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1600, height: 900 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
})

const page = context.pages()[0] ?? (await context.newPage())
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

console.log(`Playwright Chromium launched with extension from: ${extensionPath}`)
console.log(`Profile directory: ${userDataDir}`)
console.log(`URL: ${targetUrl}`)
console.log('Press Ctrl+C to close the browser.')

const shutdown = async () => {
  await context.close().catch(() => {})
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await new Promise(() => {})
