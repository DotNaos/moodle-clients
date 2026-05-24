#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_ENV_PATH = path.join(process.cwd(), '.env');
const DEFAULT_CONFIG_PATH = path.join(homedir(), '.moodle', 'config.json');
const DEFAULT_SESSION_PATH = path.join(homedir(), '.moodle', 'session.json');
const DEFAULT_SITE_URL = 'https://moodle.fhgr.ch';
const FHGR_IDP = 'https://aai-login.fhgr.ch/idp/shibboleth';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(`\n[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  await loadLocalEnv(args.env ?? DEFAULT_ENV_PATH);
  const config = await loadJson(args.config ?? DEFAULT_CONFIG_PATH).catch(() => ({}));
  const siteUrl = trimSlash(args.siteUrl ?? config.siteUrl ?? DEFAULT_SITE_URL);
  const targetPath = args.target ?? '/my/';
  const username = process.env.MOODLE_USERNAME || config.username || '';
  const password = process.env.MOODLE_PASSWORD || config.password || '';
  if (!username || !password) {
    throw new Error('MOODLE_USERNAME and MOODLE_PASSWORD are required for FHGR/Shibboleth login.');
  }

  logStep('credentials', {
    // FHGR/Shibboleth expects the short Moodle username, not the Webex/email username.
    moodleUsername: mask(String(username)),
    hasPassword: Boolean(password),
  });

  const jar = new CookieJar();
  const browser = new FetchBrowser(jar);
  const targetUrl = new URL(targetPath, siteUrl).toString();
  const moodleShibbolethCallback = new URL('/auth/shibboleth/index.php', siteUrl);
  moodleShibbolethCallback.searchParams.set('wantsurl', targetUrl);
  const loginUrl = new URL('/Shibboleth.sso/Login', siteUrl);
  loginUrl.searchParams.set('entityID', FHGR_IDP);
  // Target Moodle's auth callback first. Targeting LTI directly sets Shibboleth but leaves Moodle auth.php as notloggedin.
  loginUrl.searchParams.set('target', moodleShibbolethCallback.toString());

  const finalPage = await browser.follow(await browser.request(loginUrl.toString()), {
    username: String(username),
    password: String(password),
    maxSteps: 60,
  });

  const cookieHeader = jar.header(siteUrl);
  if (!cookieHeader.includes('MoodleSession=') || !cookieHeader.includes('_shibsession_')) {
    throw new Error('FHGR login did not produce a complete Moodle browser session.');
  }

  const sessionPath = args.session ?? DEFAULT_SESSION_PATH;
  await mkdir(path.dirname(sessionPath), { recursive: true });
  await writeFile(
    sessionPath,
    `${JSON.stringify(
      {
        schoolId: config.schoolId ?? 'fhgr',
        siteUrl,
        cookies: cookieHeader,
        createdAt: new Date().toISOString(),
        source: 'fhgr-fetch-login',
        lastUrl: safeUrl(finalPage.url),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  logStep('session-written', {
    sessionPath,
    cookieNames: jar.cookieNames(siteUrl),
    lastUrl: safeUrl(finalPage.url),
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--env') {
      parsed.env = argv[++index] ?? '';
    } else if (value === '--config') {
      parsed.config = argv[++index] ?? '';
    } else if (value === '--session') {
      parsed.session = argv[++index] ?? '';
    } else if (value === '--site-url') {
      parsed.siteUrl = argv[++index] ?? '';
    } else if (value === '--target') {
      parsed.target = argv[++index] ?? '';
    }
  }
  return parsed;
}

async function loadLocalEnv(envPath) {
  let raw = '';
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    if (!process.env[key]) {
      process.env[key] = unquote(trimmed.slice(separator + 1).trim());
    }
  }
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

class FetchBrowser {
  constructor(jar) {
    this.jar = jar;
  }

  async request(url, options = {}) {
    const headers = new Headers(options.headers ?? {});
    headers.set('User-Agent', USER_AGENT);
    headers.set('Accept', headers.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    const cookie = this.jar.header(url);
    if (cookie) {
      headers.set('Cookie', cookie);
    }
    const response = await fetch(url, { ...options, headers, redirect: 'manual' });
    this.jar.storeFromResponse(url, response);
    const text = await response.text();
    logStep('fetch', {
      method: options.method ?? 'GET',
      status: response.status,
      url: safeUrl(url),
      location: safeUrl(response.headers.get('location') ?? ''),
      cookieNames: this.jar.cookieNames(url),
      title: titleFromHtml(text),
    });
    return { status: response.status, url: response.url || String(url), headers: response.headers, text };
  }

  async follow(initial, { username, password, maxSteps }) {
    let current = initial;
    for (let step = 0; step < maxSteps; step += 1) {
      const location = current.headers.get('location');
      if (isRedirect(current.status) && location) {
        current = await this.request(new URL(location, current.url).toString(), {
          headers: { Referer: current.url },
        });
        continue;
      }

      const form = selectForm(parseForms(current.text, current.url), current.text);
      if (!form) {
        return current;
      }

      const body = buildFormBody(form, { username, password });
      const method = form.method === 'GET' ? 'GET' : 'POST';
      let nextUrl = form.action;
      const headers = { Referer: current.url };
      let requestBody;
      if (method === 'GET') {
        const url = new URL(nextUrl);
        for (const [key, value] of body) {
          url.searchParams.append(key, value);
        }
        nextUrl = url.toString();
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers.Origin = new URL(current.url).origin;
        requestBody = body;
      }
      logStep('submit-form', {
        action: safeUrl(nextUrl),
        method,
        fieldNames: form.fields.map((field) => field.name).filter(Boolean).sort(),
      });
      current = await this.request(nextUrl, { method, headers, body: requestBody });
    }
    return current;
  }
}

function selectForm(forms, html) {
  return (
    forms.find((form) => form.fields.some((field) => field.type === 'password')) ||
    forms.find((form) => form.fields.some((field) => field.name === 'SAMLResponse')) ||
    forms.find((form) => form.fields.some((field) => field.name === 'user_idp')) ||
    forms.find((form) => form.fields.some((field) => field.name === '_eventId_proceed')) ||
    forms.find((form) => /submit\(\)/i.test(html) && (form.id || form.name)) ||
    null
  );
}

function buildFormBody(form, { username, password }) {
  const body = new URLSearchParams();
  for (const field of form.fields) {
    if (field.type !== 'submit') {
      body.append(field.name, field.value ?? '');
    }
  }
  if (form.fields.some((field) => field.type === 'password')) {
    const userField = form.fields.find((field) => /j_username|username|user/i.test(field.name));
    const passField = form.fields.find((field) => field.type === 'password');
    if (userField) {
      body.set(userField.name, username);
    }
    if (passField) {
      body.set(passField.name, password);
    }
    body.set('_eventId_proceed', 'Login');
  }
  if (form.fields.some((field) => field.name === 'user_idp')) {
    body.set('user_idp', FHGR_IDP);
  }
  if (form.fields.some((field) => field.name === '_eventId_proceed')) {
    // Shibboleth consent has duplicate consentIds; keep them all and press the Accept submit.
    body.set('_eventId_proceed', 'Accept');
  }
  return body;
}

function parseForms(html, baseUrl) {
  return Array.from(html.matchAll(/<form\b[\s\S]*?(?:<\/form>|$)/gi)).map((match) => {
    const formHtml = match[0];
    return {
      action: new URL(decodeHtml(attr(formHtml, 'action') || baseUrl), baseUrl).toString(),
      method: (attr(formHtml, 'method') || 'GET').toUpperCase(),
      id: decodeHtml(attr(formHtml, 'id')),
      name: decodeHtml(attr(formHtml, 'name')),
      fields: Array.from(formHtml.matchAll(/<input\b[^>]*>/gi)).flatMap((input) => {
        const name = decodeHtml(attr(input[0], 'name'));
        return name
          ? [
              {
                name,
                value: decodeHtml(attr(input[0], 'value') || ''),
                type: (decodeHtml(attr(input[0], 'type')) || 'text').toLowerCase(),
              },
            ]
          : [];
      }),
    };
  });
}

class CookieJar {
  cookies = new Map();

  storeFromResponse(url, response) {
    for (const value of getSetCookieHeaders(response.headers)) {
      this.store(url, value);
    }
  }

  store(url, setCookie) {
    const parsedUrl = new URL(url);
    const [nameValue, ...attributes] = setCookie.split(';').map((part) => part.trim()).filter(Boolean);
    const separator = nameValue.indexOf('=');
    if (separator <= 0) {
      return;
    }
    const name = nameValue.slice(0, separator);
    const value = nameValue.slice(separator + 1);
    const attrMap = new Map(attributes.map((attribute) => {
      const [key, ...rest] = attribute.split('=');
      return [key.toLowerCase(), rest.join('=')];
    }));
    const domain = (attrMap.get('domain') || parsedUrl.hostname).replace(/^\./, '').toLowerCase();
    const itemPath = attrMap.get('path') || '/';
    this.cookies.set(`${domain}|${itemPath}|${name}`, { domain, path: itemPath, name, value });
  }

  header(url) {
    const parsedUrl = new URL(url);
    return Array.from(this.cookies.values())
      .filter((cookie) => {
        const host = parsedUrl.hostname.toLowerCase();
        return (host === cookie.domain || host.endsWith(`.${cookie.domain}`)) && parsedUrl.pathname.startsWith(cookie.path);
      })
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  cookieNames(url) {
    const header = this.header(url);
    return header ? header.split(';').map((pair) => pair.trim().split('=')[0]).filter(Boolean) : [];
  }
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const value = headers.get('set-cookie');
  return value ? value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((item) => item.trim()) : [];
}

function attr(html, name) {
  const match = html.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? '';
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function titleFromHtml(html) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
}

function safeUrl(value) {
  if (!value) {
    return '';
  }
  try {
    const parsed = new URL(value);
    const keys = Array.from(parsed.searchParams.keys()).sort();
    return `${parsed.origin}${parsed.pathname}${keys.length ? `?keys=${keys.join(',')}` : ''}`;
  } catch {
    return '[invalid-url]';
  }
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function mask(value) {
  return value ? `${value.slice(0, 3)}...${value.slice(-2)}` : '';
}

function logStep(step, details) {
  console.log(JSON.stringify({ step, ...details }));
}
