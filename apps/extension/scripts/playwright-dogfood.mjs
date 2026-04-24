/**
 * Dogfood: launch with extension, login, visit all main screens, capture screenshots + console.
 * Output: dogfood-output/screenshots/, dogfood-output/console.log
 * Run: pnpm build && node scripts/playwright-dogfood.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { readMoodleCredentials } from './playwright-op-config.mjs'

const projectRoot = process.cwd()
const extensionPath = path.resolve(projectRoot, 'dist')
const userDataDir = path.resolve(projectRoot, '.playwright', 'chromium-extension-profile')
const outDir = path.resolve(projectRoot, 'dogfood-output')
const screenshotsDir = path.resolve(outDir, 'screenshots')
const FHGR_IDP = 'https://aai-login.fhgr.ch/idp/shibboleth'
const LOGIN_URL = 'https://moodle.fhgr.ch/login/index.php'
const COURSE_URL = 'https://moodle.fhgr.ch/course/view.php?id=22583'
const MY_COURSES_URL = 'https://moodle.fhgr.ch/my/courses.php'

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function takeScreenshot(page, name) {
  ensureDir(screenshotsDir)
  const file = path.join(screenshotsDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`Screenshot: ${file}`)
  return file
}

async function main() {
  if (!fs.existsSync(extensionPath)) {
    console.error('Missing dist/. Run: pnpm build')
    process.exit(1)
  }

  const creds = readMoodleCredentials()
  if (!creds.ok) {
    console.error('Credentials:', creds.error)
    process.exit(1)
  }

  ensureDir(outDir)
  const consoleLog = []
  const logConsole = (msg) => {
    const entry = { type: msg.type(), text: msg.text(), location: msg.location() }
    consoleLog.push(entry)
    if (entry.type === 'error') console.error('[console]', entry.text)
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
  page.on('console', logConsole)

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await takeScreenshot(page, 'screen-01-login-select')

    const wayfSelect = page.locator('#user_idp')
    const wayfVisible = await wayfSelect.isVisible().catch(() => false)
    if (wayfVisible) {
      await wayfSelect.selectOption(FHGR_IDP)
      await page.locator('#IdPList').evaluate((form) => form.submit())
      await page.waitForURL(/aai-login\.fhgr\.ch|moodle\.fhgr\.ch/, { timeout: 15000 })
    } else {
      const fhgrButton = page.getByRole('link', { name: /Mit FHGR-Konto weiter/i }).or(
        page.getByRole('button', { name: /Mit FHGR-Konto weiter/i })
      )
      if (await fhgrButton.first().isVisible().catch(() => false)) {
        await fhgrButton.first().click()
        await page.waitForURL(/aai-login\.fhgr\.ch|moodle\.fhgr\.ch/, { timeout: 15000 })
      }
    }

    if (page.url().includes('aai-login.fhgr.ch')) {
      await takeScreenshot(page, 'screen-02-aai-login')
      const customUsername = page.locator('input#aai-username')
      const customVisible = await customUsername.isVisible().catch(() => false)
      if (customVisible) {
        await customUsername.waitFor({ state: 'visible', timeout: 5000 })
        await customUsername.fill(creds.username)
        await page.locator('input#aai-password').fill(creds.password)
        await page.getByRole('button', { name: /Weiter zur Anmeldung/i }).click()
      } else {
        await page.locator('input#username').fill(creds.username, { force: true })
        await page.locator('input#password').fill(creds.password, { force: true })
        await page.locator('.aai_login_field form button[name="_eventId_proceed"]').evaluate((el) => el.click())
      }
      await page.waitForTimeout(4000)

      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(2500)
        const url = page.url()
        if (url.includes('moodle.fhgr.ch')) break
        if (!url.includes('aai-login.fhgr.ch')) break
        const acceptPattern = /weiter|continue|accept|zustimmen|release|freigabe|freigeben|ok|submit|anmelden/i
        const backPattern = /back|zurück|abbrechen|cancel|modify|ändern|edit/i
        const allButtons = await page.locator('form button[type="submit"], form input[type="submit"], input[name="_eventId_proceed"], button[name="_eventId_proceed"]').all()
        let clicked = false
        for (const btn of allButtons) {
          const value = await btn.getAttribute('value').catch(() => '')
          const text = await btn.innerText().catch(() => '')
          const label = `${value} ${text}`.trim()
          if (backPattern.test(label)) continue
          if (acceptPattern.test(label) || label === 'Login' || !label) {
            await btn.evaluate((el) => el.click())
            clicked = true
            break
          }
        }
        if (!clicked) {
          const firstSubmit = page.locator('form [type="submit"]').first()
          if (await firstSubmit.isVisible().catch(() => false)) {
            await firstSubmit.evaluate((el) => el.click())
            clicked = true
          }
        }
        if (!clicked) break
        await page.waitForLoadState('networkidle').catch(() => {})
      }

      await page.waitForURL(/moodle\.fhgr\.ch/, { timeout: 20000 })
    }

    await page.waitForTimeout(2000)
    await takeScreenshot(page, 'screen-03-after-login')

    await page.goto(MY_COURSES_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await takeScreenshot(page, 'screen-04-my-courses')

    await page.goto(COURSE_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    await takeScreenshot(page, 'screen-05-course-page')
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.waitForTimeout(500)
    await takeScreenshot(page, 'screen-06-course-page-scrolled')

    fs.writeFileSync(
      path.join(outDir, 'console.log'),
      JSON.stringify(consoleLog, null, 2),
      'utf8'
    )
    console.log('Console log written to dogfood-output/console.log')
    console.log('Screenshots in dogfood-output/screenshots/')
  } finally {
    await context.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
