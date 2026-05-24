#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_SESSION_PATH = path.join(homedir(), '.moodle', 'mobile-session.json');
const DEFAULT_BROWSER_SESSION_PATH = path.join(homedir(), '.moodle', 'session.json');
const WEBEX_LTI_ORIGIN = 'https://lti.webex.com';
const WEBEX_APPLICATION = `${WEBEX_LTI_ORIGIN}/application`;
const WEBEX_SITE = 'fhgr.webex.com';
const WEBEX_SITE_ID = '14682867';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(`\n[fail] ${error instanceof Error ? error.message : String(error)}`);
  if (args.verbose && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});

async function main() {
  await loadLocalEnv(args.env ?? path.join(process.cwd(), '.env'));
  const session = await loadMoodleSession(args.session ?? process.env.MOODLE_MOBILE_SESSION_PATH ?? DEFAULT_SESSION_PATH);
  const courseQuery = args.course ?? args._[0] ?? 'Algorithmen des wissenschaftlichen Rechnens';
  const connection = {
    siteUrl: trimSlash(session.siteUrl),
    userId: Number(session.userId),
    token: String(session.token),
  };

  logStep('session', {
    siteUrl: connection.siteUrl,
    userId: connection.userId,
    token: mask(connection.token),
  });
  logStep('webex-credentials', {
    username: maskEmail(process.env.WEBEX_USERNAME ?? ''),
    // FHGR/Shibboleth expects the short Moodle username, not the Webex/email username.
    moodleUsername: mask(process.env.MOODLE_USERNAME ?? ''),
    hasPassword: Boolean(process.env.WEBEX_PASSWORD),
  });

  const courses = await callMoodleApi(connection, 'core_enrol_get_users_courses', {
    userid: String(connection.userId),
  });
  const course = selectCourse(courses, courseQuery);
  logStep('course', {
    id: course.id,
    fullName: course.fullname,
    shortName: course.shortname,
  });

  const ltiActivities = await callMoodleApi(connection, 'mod_lti_get_ltis_by_courses', {
    'courseids[0]': String(course.id),
  });
  const lti = findWebexLti(ltiActivities);
  logStep('moodle-lti', {
    toolId: lti.id,
    courseModule: lti.coursemodule,
    name: lti.name,
  });

  const launch = await callMoodleApi(connection, 'mod_lti_get_tool_launch_data', {
    toolid: String(lti.id),
  });
  if (!launch?.endpoint || !Array.isArray(launch.parameters)) {
    throw new Error('Moodle LTI launch data is incomplete.');
  }
  logStep('moodle-launch-data', {
    endpoint: safeUrl(launch.endpoint),
    parameterCount: launch.parameters.length,
    parameterNames: launch.parameters.map((parameter) => parameter.name).filter(Boolean).sort(),
  });

  const jar = new CookieJar();
  const browser = new FetchBrowser(jar);
  const browserCookieHeader = await loadMoodleBrowserCookieHeader(
    args.browserSession ?? process.env.MOODLE_BROWSER_SESSION_PATH ?? DEFAULT_BROWSER_SESSION_PATH,
  );
  let launchResponse;
  if (browserCookieHeader) {
    jar.storeCookieHeader(connection.siteUrl, browserCookieHeader);
    logStep('moodle-browser-session', {
      source: 'local-session-json',
      cookies: jar.summary(),
    });
    launchResponse = await browser.request(`${connection.siteUrl}/mod/lti/launch.php?id=${encodeURIComponent(String(lti.coursemodule))}`, {
      method: 'GET',
    });
  } else {
    logStep('moodle-browser-session', {
      source: 'missing',
      fallback: 'mobile-lti-launch-data',
    });
    launchResponse = await browser.submitForm(launch.endpoint, launch.parameters, {
      referer: `${connection.siteUrl}/mod/lti/launch.php?id=${lti.coursemodule}`,
    });
  }
  const webexPage = await browser.followBrowserFlow(launchResponse, { maxSteps: 12 });
  logStep('browser-flow-result', {
    status: webexPage.status,
    url: safeUrl(webexPage.url),
    cookies: jar.summary(),
    title: titleFromHtml(webexPage.text),
    hasCsrfToken: Boolean(extractCsrfToken(webexPage.text)),
    hasWebexApplication: isWebexApplication(webexPage.url, webexPage.text),
  });

  if (!isWebexApplication(webexPage.url, webexPage.text)) {
    throw new Error('Fetch flow did not reach the Webex application context.');
  }

  const csrfToken = extractCsrfToken(webexPage.text);
  const sessions = await fetchWebexPages(
    browser,
    `${WEBEX_LTI_ORIGIN}/api/webex/meeting_sessions?start_date=2015-01-01&end_date=${futureEndDate()}&with_recordings=true&page=`,
    webexHeaders(csrfToken, WEBEX_APPLICATION),
    'meeting_sessions',
  );
  logStep('webex-sessions', {
    count: sessions.length,
    samples: sessions.slice(0, 5).map((session) => ({
      id: session.id ? '[present]' : '',
      name: stringFromAny(session.name, session.title),
      startDate: stringFromAny(session.start_date, session.startDate),
      endDate: stringFromAny(session.end_date, session.endDate),
      hasRecordings: session.has_recordings ?? session.hasRecordings ?? '',
      keys: Object.keys(session).sort().join(','),
    })),
  });

  const allRecordingsMode = args.recordings === 'all' || args.allRecordings;
  const sessionsWithRecordings = sessions.filter((session) => {
    const hasRecordings = session.has_recordings ?? session.hasRecordings;
    return session.id && (allRecordingsMode ? hasRecordings !== false : hasRecordings ?? true);
  });
  if (allRecordingsMode) {
    let recordingCount = 0;
    const samples = [];
    for (const session of sessionsWithRecordings) {
      const recordings = await fetchWebexPages(
        browser,
        `${WEBEX_LTI_ORIGIN}/api/webex/meeting_sessions/${encodeURIComponent(String(session.id))}/recordings?page=`,
        webexHeaders(csrfToken, WEBEX_APPLICATION),
        'session_recordings',
      );
      recordingCount += recordings.length;
      for (const recording of recordings.slice(0, Math.max(0, 3 - samples.length))) {
        samples.push({
          sessionName: stringFromAny(session.name, session.title),
          name: stringFromAny(recording.name, recording.recordName),
          uuid: stringFromAny(
            recording.recordUUID,
            recording.recordUuid,
            recording.record_uuid,
            recording.recordingUuid,
            recording.recording_uuid,
            recording.uuid,
          )
            ? '[present]'
            : '',
          sourceUrl: recording.recording_url || recording.recordingUrl ? '[present]' : '',
          keys: Object.keys(recording).sort().join(','),
        });
      }
    }
    logStep('recordings-all', {
      sessionsChecked: sessionsWithRecordings.length,
      count: recordingCount,
      samples,
    });
    return;
  }

  const sessionWithRecording = sessionsWithRecordings[0];
  if (!sessionWithRecording?.id) {
    logStep('recording-sample', { skipped: 'No session with recordings found.' });
    return;
  }

  const recordings = await fetchWebexPages(
    browser,
    `${WEBEX_LTI_ORIGIN}/api/webex/meeting_sessions/${encodeURIComponent(String(sessionWithRecording.id))}/recordings?page=`,
    webexHeaders(csrfToken, WEBEX_APPLICATION),
    'session_recordings',
  );
  logStep('recording-sample', {
    sessionId: '[present]',
    count: recordings.length,
    samples: recordings.slice(0, 3).map((recording) => ({
      name: stringFromAny(recording.name, recording.recordName),
      uuid: stringFromAny(
        recording.recordUUID,
        recording.recordUuid,
        recording.record_uuid,
        recording.recordingUuid,
        recording.recording_uuid,
        recording.uuid,
      )
        ? '[present]'
        : '',
      sourceUrl: recording.recording_url || recording.recordingUrl ? '[present]' : '',
      keys: Object.keys(recording).sort().join(','),
    })),
  });
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--verbose') {
      parsed.verbose = true;
      continue;
    }
    if (value === '--all-recordings') {
      parsed.allRecordings = true;
      continue;
    }
    if (value === '--recordings') {
      parsed.recordings = argv[++index] ?? '';
      continue;
    }
    if (value === '--course' || value === '-c') {
      parsed.course = argv[++index] ?? '';
      continue;
    }
    if (value === '--session') {
      parsed.session = argv[++index] ?? '';
      continue;
    }
    if (value === '--env') {
      parsed.env = argv[++index] ?? '';
      continue;
    }
    if (value === '--browser-session') {
      parsed.browserSession = argv[++index] ?? '';
      continue;
    }
    parsed._.push(value);
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
    const value = unquoteEnvValue(trimmed.slice(separator + 1).trim());
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadMoodleSession(sessionPath) {
  const raw = await readFile(sessionPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.siteUrl || !parsed.userId || !parsed.token) {
    throw new Error(`${sessionPath} is missing siteUrl, userId, or token.`);
  }
  return parsed;
}

async function loadMoodleBrowserCookieHeader(sessionPath) {
  try {
    const parsed = JSON.parse(await readFile(sessionPath, 'utf8'));
    return typeof parsed.cookies === 'string' ? parsed.cookies : '';
  } catch {
    return '';
  }
}

async function callMoodleApi(connection, functionName, params = {}) {
  const endpoint = new URL('/webservice/rest/server.php?moodlewsrestformat=json', connection.siteUrl);
  const body = new URLSearchParams();
  body.set('wstoken', connection.token);
  body.set('wsfunction', functionName);
  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }
  logStep('moodle-api-start', {
    functionName,
    paramKeys: Object.keys(params).sort(),
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 MoodleMobile',
    },
    body,
  });
  const text = await response.text();
  const payload = JSON.parse(text);
  if (!response.ok || payload?.exception) {
    throw new Error(`Moodle ${functionName} failed: ${payload?.message ?? response.status}`);
  }
  logStep('moodle-api-done', {
    functionName,
    shape: Array.isArray(payload) ? `array(${payload.length})` : `object(${Object.keys(payload ?? {}).length})`,
  });
  return payload;
}

function selectCourse(courses, query) {
  if (!Array.isArray(courses)) {
    throw new Error('Moodle courses response was not an array.');
  }
  const normalized = normalize(query);
  const directId = Number(query);
  const matches = courses.filter((course) => {
    if (Number.isFinite(directId) && Number(course.id) === directId) {
      return true;
    }
    return normalize(decodeHtml(`${course.fullname ?? ''} ${course.shortname ?? ''}`)).includes(normalized);
  });
  if (matches.length === 0) {
    throw new Error(`No Moodle course matched "${query}".`);
  }
  return matches[0];
}

function findWebexLti(payload) {
  const ltis = Array.isArray(payload?.ltis) ? payload.ltis : [];
  const lti = ltis.find((candidate) =>
    `${candidate.name ?? ''} ${candidate.intro ?? ''}`.toLowerCase().includes('webex'),
  );
  if (!lti?.id) {
    throw new Error('No Webex LTI activity found for this course.');
  }
  return lti;
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
    const parts = splitCookieParts(setCookie);
    const [nameValue, ...attributes] = parts;
    const separator = nameValue.indexOf('=');
    if (separator <= 0) {
      return;
    }

    const name = nameValue.slice(0, separator).trim();
    const value = nameValue.slice(separator + 1).trim();
    const attrMap = new Map(
      attributes.map((attribute) => {
        const [key, ...rest] = attribute.split('=');
        return [key.trim().toLowerCase(), rest.join('=').trim()];
      }),
    );
    const domain = (attrMap.get('domain') || parsedUrl.hostname).replace(/^\./, '').toLowerCase();
    const itemPath = attrMap.get('path') || '/';
    if (!value || attrMap.has('expires') && Date.parse(attrMap.get('expires')) < Date.now()) {
      this.cookies.delete(`${domain}|${itemPath}|${name}`);
      return;
    }
    this.cookies.set(`${domain}|${itemPath}|${name}`, { domain, path: itemPath, name, value });
  }

  storeCookieHeader(url, cookieHeader) {
    const { hostname } = new URL(url);
    for (const pair of cookieHeader.split(';')) {
      const trimmed = pair.trim();
      if (!trimmed) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      this.cookies.set(`${hostname}|/|${name}`, {
        domain: hostname,
        path: '/',
        name,
        value,
      });
    }
  }

  header(url) {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname || '/';
    const pairs = [];
    for (const cookie of this.cookies.values()) {
      if ((host === cookie.domain || host.endsWith(`.${cookie.domain}`)) && pathname.startsWith(cookie.path)) {
        pairs.push(`${cookie.name}=${cookie.value}`);
      }
    }
    return pairs.join('; ');
  }

  summary() {
    const byDomain = {};
    for (const cookie of this.cookies.values()) {
      byDomain[cookie.domain] = (byDomain[cookie.domain] ?? 0) + 1;
    }
    return byDomain;
  }

  safeDetails() {
    return Array.from(this.cookies.values()).map((cookie) => ({
      domain: cookie.domain,
      path: cookie.path,
      name: cookie.name,
    }));
  }
}

class FetchBrowser {
  constructor(jar) {
    this.jar = jar;
  }

  async submitForm(url, parameters, { referer } = {}) {
    const body = new URLSearchParams();
    for (const parameter of parameters) {
      if (parameter?.name) {
        body.set(parameter.name, parameter.value ?? '');
      }
    }
    return this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(referer ? { Origin: new URL(referer).origin } : {}),
        ...(referer ? { Referer: referer } : {}),
      },
      body,
    });
  }

  async request(url, options = {}) {
    const headers = new Headers(options.headers ?? {});
    headers.set('User-Agent', USER_AGENT);
    headers.set('Accept', headers.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    headers.set('Accept-Language', headers.get('Accept-Language') || 'en-US,en;q=0.9,de;q=0.8');
    const cookie = this.jar.header(url);
    if (cookie) {
      headers.set('Cookie', cookie);
    }
    const response = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual',
    });
    this.jar.storeFromResponse(url, response);
    const text = await response.text();
    logStep('fetch', {
      method: options.method ?? 'GET',
      status: response.status,
      url: safeUrl(url),
      location: safeUrl(response.headers.get('location') ?? ''),
      setCookieCount: getSetCookieHeaders(response.headers).length,
    });
    return {
      response,
      status: response.status,
      url: response.url || String(url),
      text,
      headers: response.headers,
      cookieDetails: this.jar.safeDetails(),
    };
  }

  async followBrowserFlow(initial, { maxSteps }) {
    let current = initial;
    for (let step = 0; step < maxSteps; step += 1) {
      const location = current.headers.get('location');
      if (isRedirect(current.status) && location) {
        const nextUrl = new URL(location, current.url).toString();
        current = await this.request(nextUrl, {
          method: 'GET',
          headers: { Referer: current.url },
        });
        continue;
      }

      const htmlRedirect = parseHtmlRedirect(current.text, current.url);
      if (htmlRedirect) {
        logStep('html-redirect', {
          url: safeUrl(htmlRedirect),
        });
        current = await this.request(htmlRedirect, {
          method: 'GET',
          headers: { Referer: current.url },
        });
        continue;
      }

      const form = parseAutoSubmitForm(current.text, current.url);
      if (form) {
        const shouldSubmitAsGet = form.method === 'GET' || isWebexLtiLogin(form.action);
        logStep('auto-form', {
          method: shouldSubmitAsGet ? 'GET' : form.method,
          originalMethod: form.method,
          action: safeUrl(form.action),
          fieldCount: form.fields.length,
          fieldNames: form.fields.map((field) => field.name).sort(),
          fieldLengths: Object.fromEntries(
            form.fields.map((field) => [field.name, String(field.value ?? '').length]).sort(([left], [right]) => left.localeCompare(right)),
          ),
        });
        if (shouldSubmitAsGet) {
          const url = new URL(form.action);
          for (const field of form.fields) {
            url.searchParams.set(field.name, field.value);
          }
          if (isWebexLtiLogin(form.action)) {
            // Webex returns only its login SPA without this flag. With it, LTI 1.3 redirects to Moodle auth.php.
            url.searchParams.set('lti1p3_new_window', '1');
          }
          current = await this.request(url.toString(), {
            method: 'GET',
            headers: { Referer: current.url },
          });
        } else {
          current = await this.submitForm(form.action, form.fields, { referer: current.url });
          if (isWebexLoginSpa(current.url, current.text)) {
            const queryUrl = new URL(form.action);
            for (const field of form.fields) {
              queryUrl.searchParams.set(field.name, field.value);
            }
            logStep('auto-form-get-retry', {
              url: safeUrl(queryUrl.toString()),
            });
            current = await this.request(queryUrl.toString(), {
              method: 'GET',
              headers: { Referer: current.url },
            });
          }
        }
        continue;
      }

      if (current.url.includes('/lti/launch') && !isWebexApplication(current.url, current.text)) {
        const applicationUrl = `${WEBEX_APPLICATION}`;
        current = await this.request(applicationUrl, {
          method: 'GET',
          headers: { Referer: current.url },
        });
        continue;
      }

      if (isWebexLoginSpa(current.url, current.text)) {
        const csrfToken = extractCsrfToken(current.text);
        const checkSession = await this.request(`${WEBEX_LTI_ORIGIN}/launches/check_session`, {
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            Referer: current.url,
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
        });
        const checkPayload = parseJsonObject(checkSession.text);
        logStep('webex-check-session', {
          status: checkSession.status,
          payload: sanitizeWebexPayload(checkPayload),
        });
        if (checkSession.status < 400 && checkPayload.session_set !== false) {
          current = await this.request(WEBEX_APPLICATION, {
            method: 'GET',
            headers: { Referer: current.url },
          });
          continue;
        }
      }

      logStep('page-hints', pageHints(current));
      return current;
    }
    return current;
  }
}

async function fetchWebexPages(browser, prefix, headers, label) {
  const items = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await browser.request(`${prefix}${page}`, {
      headers,
    });
    if (!result.status.toString().startsWith('2')) {
      throw new Error(`Webex ${label} page ${page} failed with HTTP ${result.status}: ${result.text.slice(0, 160)}`);
    }
    const payload = JSON.parse(result.text);
    const pageItems = extractItems(payload);
    items.push(...pageItems);
    logStep('webex-page', {
      label,
      page,
      pageCount: pageItems.length,
      hasNextPage: hasNextPage(payload),
    });
    if (!hasNextPage(payload)) {
      break;
    }
  }
  return items;
}

function webexHeaders(csrfToken, referer) {
  return {
    Accept: 'application/json, text/plain, */*',
    Referer: referer,
    clientType: 'web',
    siteFullUrl: WEBEX_SITE,
    siteId: WEBEX_SITE_ID,
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
  };
}

function parseAutoSubmitForm(html, baseUrl) {
  const formMatch = html.match(/<form\b[\s\S]*?(?:<\/form>|$)/i);
  if (!formMatch) {
    return null;
  }
  const formHtml = formMatch[0];
  const action = attr(formHtml, 'action');
  if (!action) {
    return null;
  }
  const method = (attr(formHtml, 'method') || 'GET').toUpperCase();
  const fields = [];
  for (const input of formHtml.matchAll(/<input\b[^>]*>/gi)) {
    const name = attr(input[0], 'name');
    if (!name) {
      continue;
    }
    fields.push({
      name: decodeHtml(name),
      value: decodeHtml(attr(input[0], 'value') || ''),
    });
  }
  return {
    action: new URL(decodeHtml(action), baseUrl).toString(),
    method,
    fields,
  };
}

function parseHtmlRedirect(html, baseUrl) {
  const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"']+)["']/i);
  if (meta?.[1]) {
    return new URL(decodeHtml(meta[1].trim()), baseUrl).toString();
  }

  for (const pattern of [
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /(?:window\.)?location\.replace\(\s*["']([^"']+)["']\s*\)/i,
    /(?:window\.)?location\.assign\(\s*["']([^"']+)["']\s*\)/i,
  ]) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return new URL(decodeHtml(match[1].trim()), baseUrl).toString();
    }
  }
  return '';
}

function pageHints(page) {
  return {
    status: page.status,
    url: safeUrl(page.url),
    title: titleFromHtml(page.text),
    formCount: (page.text.match(/<form\b/gi) ?? []).length,
    cookieDetails: page.cookieDetails ?? undefined,
    linkHosts: Array.from(page.text.matchAll(/href=["']([^"']+)["']/gi))
      .map((match) => safeHost(match[1], page.url))
      .filter(Boolean)
      .slice(0, 10),
    linkUrls: Array.from(page.text.matchAll(/href=["']([^"']+)["']/gi))
      .map((match) => safeUrl(new URL(decodeHtml(match[1]), page.url).toString()))
      .slice(0, 10),
    scriptSources: Array.from(page.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))
      .map((match) => safeUrl(new URL(decodeHtml(match[1]), page.url).toString()))
      .slice(0, 10),
    reactRootData: reactRootData(page.text),
    tokenHints: {
      hasSessionTicket: /session_ticket/i.test(page.text),
      hasNoCookie: /no[_-]?cookie/i.test(page.text),
      hasAppLoad: /app_load/i.test(page.text),
      dataAttrCount: (page.text.match(/\sdata-[a-z0-9_-]+=/gi) ?? []).length,
    },
    scriptHints: Array.from(page.text.matchAll(/(?:location|redirect|authorize|auth)/gi)).length,
    textSample: visibleTextSample(page.text),
  };
}

function reactRootData(html) {
  const root = Array.from(html.matchAll(/<div\b[^>]*>/gi))
    .map((match) => match[0])
    .find((tag) => /\sid=["']react-root["']/i.test(tag)) ?? '';
  const data = {};
  for (const match of root.matchAll(/\s(data-[a-z0-9_-]+)=["']([^"']*)["']/gi)) {
    const key = match[1];
    const value = decodeHtml(match[2] ?? '');
    data[key] = key.toLowerCase().includes('token') || key.toLowerCase().includes('ticket')
      ? mask(value)
      : value.slice(0, 240);
  }
  return data;
}

function attr(html, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = html.match(pattern);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? '';
}

function extractItems(payload) {
  for (const key of ['items', 'data', 'meeting_sessions', 'recordings']) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function hasNextPage(payload) {
  const pagination = payload?.pagination ?? payload?.paging ?? payload?.page;
  if (pagination && typeof pagination === 'object') {
    if (typeof pagination.hasNext === 'boolean') {
      return pagination.hasNext;
    }
    if (typeof pagination.has_next === 'boolean') {
      return pagination.has_next;
    }
    if (Number(pagination.page) && Number(pagination.total_pages)) {
      return Number(pagination.page) < Number(pagination.total_pages);
    }
  }
  return false;
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const value = headers.get('set-cookie');
  return value ? splitCombinedSetCookie(value) : [];
}

function splitCombinedSetCookie(value) {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((item) => item.trim()).filter(Boolean);
}

function splitCookieParts(value) {
  return value.split(';').map((item) => item.trim()).filter(Boolean);
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function isWebexApplication(url, html) {
  try {
    const parsed = new URL(url);
    return parsed.origin === WEBEX_LTI_ORIGIN && (parsed.pathname.includes('/application') || html.includes('/api/webex/'));
  } catch {
    return false;
  }
}

function isWebexLoginSpa(url, html) {
  try {
    const parsed = new URL(url);
    return parsed.origin === WEBEX_LTI_ORIGIN && parsed.pathname === '/lti/login' && html.includes('Webex by Cisco');
  } catch {
    return false;
  }
}

function isWebexLtiLogin(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === WEBEX_LTI_ORIGIN && parsed.pathname === '/lti/login';
  } catch {
    return false;
  }
}

function extractCsrfToken(html) {
  return html.match(/<meta[^>]+name=["'](?:csrf-token|csrfToken|_csrf)["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeWebexPayload(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [
      key,
      key.toLowerCase().includes('token') || key.toLowerCase().includes('ticket')
        ? mask(String(raw ?? ''))
        : raw,
    ]),
  );
}

function titleFromHtml(html) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
}

function stringFromAny(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

function normalize(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function futureEndDate() {
  return `${new Date().getFullYear() + 3}-12-31`;
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

function safeHost(value, baseUrl) {
  try {
    return new URL(decodeHtml(value), baseUrl).host;
  } catch {
    return '';
  }
}

function mask(value) {
  if (!value) {
    return '';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskEmail(value) {
  if (!value) {
    return '';
  }
  const [name, domain] = value.split('@');
  return domain ? `${name.slice(0, 2)}...@${domain}` : mask(value);
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

function visibleTextSample(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function logStep(step, details) {
  console.log(JSON.stringify({ step, ...details }));
}
