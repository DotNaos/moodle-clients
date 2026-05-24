#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import * as Sentry from '@sentry/node';

const DEFAULT_ENV_PATH = 'apps/mobile/.env';
const DEFAULT_SENTRY_URL = 'https://de.sentry.io';
const DEFAULT_SENTRY_PROJECT_ID = '4511407710732368';
const VERIFY_TIMEOUT_MS = 60_000;
const VERIFY_INTERVAL_MS = 5_000;

const env = {
    ...process.env,
    ...(await loadDotEnv(process.env.MOBILE_ENV_PATH ?? DEFAULT_ENV_PATH)),
};

const dsn = value(env.EXPO_PUBLIC_SENTRY_DSN);
const organization = value(env.SENTRY_ORG) || 'oliver-schuetz';
const project = value(env.SENTRY_PROJECT) || 'moodle-client';
const projectId = value(env.SENTRY_PROJECT_ID) || DEFAULT_SENTRY_PROJECT_ID;
const sentryUrl = value(env.SENTRY_URL) || DEFAULT_SENTRY_URL;
const authToken = value(env.SENTRY_AUTH_TOKEN);

if (!dsn) {
    throw new Error('EXPO_PUBLIC_SENTRY_DSN is missing.');
}

const marker = `moodle-mobile-sentry-smoke-${Date.now()}`;

Sentry.init({
    dsn,
    environment: value(env.EXPO_PUBLIC_SENTRY_ENVIRONMENT) || 'development',
    enableLogs: true,
    release: 'moodle-client-smoke-test',
    sendDefaultPii: false,
});

Sentry.setTag('moodle.scope', 'sentry-smoke-test');
Sentry.setExtra('marker', marker);
const messageEventId = Sentry.captureMessage(
    `Moodle mobile Sentry info log smoke test ${marker}`,
    'info',
);
const eventId = Sentry.captureException(
    new Error(`Moodle mobile Sentry smoke test ${marker}`),
);
const flushed = await Sentry.flush(5000);
const logIngest = await sendStructuredLogEnvelope({
    dsn,
    marker,
    environment: value(env.EXPO_PUBLIC_SENTRY_ENVIRONMENT) || 'development',
});

const result = {
    marker,
    eventId,
    messageEventId,
    flushed,
    logIngest,
    dsnProjectId: dsnProjectId(dsn),
    dsnHost: dsnHost(dsn),
    verified: false,
    eventVerification: authToken
        ? await pollVerification(() =>
              findEvent({
                  authToken,
                  eventId,
                  organization,
                  project,
                  sentryUrl,
              }),
          )
        : {
              ok: false,
              reason: 'SENTRY_AUTH_TOKEN was not available for API verification.',
          },
    messageVerification: authToken
        ? await pollVerification(() =>
              findEvent({
                  authToken,
                  eventId: messageEventId,
                  organization,
                  project,
                  sentryUrl,
              }),
          )
        : {
              ok: false,
              reason: 'SENTRY_AUTH_TOKEN was not available for API verification.',
          },
    logVerification: authToken
        ? await pollVerification(() =>
              findStructuredLog({
                  authToken,
                  marker,
                  organization,
                  projectId,
                  sentryUrl,
              }),
          )
        : {
              ok: false,
              reason: 'SENTRY_AUTH_TOKEN was not available for API verification.',
          },
};

result.verified =
    result.eventVerification.ok === true &&
    result.messageVerification.ok === true;

console.log(JSON.stringify(result, null, 2));

if (!flushed || !logIngest.ok || !result.verified) {
    process.exitCode = 1;
}

async function loadDotEnv(path) {
    try {
        const text = await readFile(path, 'utf8');
        return Object.fromEntries(
            text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'))
                .flatMap((line) => {
                    const index = line.indexOf('=');
                    if (index < 1) {
                        return [];
                    }
                    return [[line.slice(0, index), line.slice(index + 1)]];
                }),
        );
    } catch {
        return {};
    }
}

async function findEvent(input) {
    const endpoint = new URL(
        `/api/0/projects/${encodeURIComponent(input.organization)}/${encodeURIComponent(
            input.project,
        )}/events/${encodeURIComponent(input.eventId)}/`,
        input.sentryUrl,
    );

    const response = await fetch(endpoint, {
        headers: {
            Authorization: `Bearer ${input.authToken}`,
        },
    });

    if (response.ok) {
        return { ok: true, status: response.status };
    }

    return {
        ok: false,
        status: response.status,
        reason: await safeResponseText(response),
    };
}

async function findStructuredLog(input) {
    const endpoint = new URL(
        `/api/0/organizations/${encodeURIComponent(input.organization)}/events/`,
        input.sentryUrl,
    );
    endpoint.searchParams.set('dataset', 'logs');
    endpoint.searchParams.set('field', 'timestamp');
    endpoint.searchParams.append('field', 'message');
    endpoint.searchParams.append('field', 'severity');
    endpoint.searchParams.set('project', input.projectId);
    endpoint.searchParams.set('query', input.marker);
    endpoint.searchParams.set('sort', '-timestamp');
    endpoint.searchParams.set('statsPeriod', '1h');
    endpoint.searchParams.set('per_page', '5');

    const response = await fetch(endpoint, {
        headers: {
            Authorization: `Bearer ${input.authToken}`,
        },
    });

    if (!response.ok) {
        return {
            ok: false,
            status: response.status,
            reason: await safeResponseText(response),
        };
    }

    const body = await response.json();
    const rows = Array.isArray(body.data) ? body.data : [];
    return {
        ok: rows.length > 0,
        status: response.status,
        rows: rows.length,
        reason: rows.length > 0 ? undefined : 'Structured log was not found yet.',
    };
}

async function sendStructuredLogEnvelope(input) {
    const dsnUrl = parseDsn(input.dsn);
    if (!dsnUrl) {
        return { ok: false, reason: 'EXPO_PUBLIC_SENTRY_DSN is invalid.' };
    }

    const endpoint = new URL(
        `/api/${encodeURIComponent(dsnUrl.projectId)}/envelope/`,
        `${dsnUrl.protocol}//${dsnUrl.host}`,
    );
    endpoint.searchParams.set('sentry_key', dsnUrl.publicKey);
    endpoint.searchParams.set('sentry_version', '7');
    endpoint.searchParams.set('sentry_client', 'moodle-client-smoke-test/1.0');

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-sentry-envelope',
        },
        body: [
            JSON.stringify({
                sent_at: new Date().toISOString(),
                dsn: input.dsn,
            }),
            JSON.stringify({
                type: 'log',
                item_count: 1,
                content_type: 'application/vnd.sentry.items.log+json',
            }),
            JSON.stringify({
                items: [
                    {
                        timestamp: Date.now() / 1000,
                        level: 'info',
                        body: `Moodle mobile Sentry structured log smoke test ${input.marker}`,
                        severity_number: 9,
                        attributes: {
                            marker: {
                                value: input.marker,
                                type: 'string',
                            },
                            scope: {
                                value: 'sentry-smoke-test',
                                type: 'string',
                            },
                            'sentry.environment': {
                                value: input.environment,
                                type: 'string',
                            },
                            'sentry.release': {
                                value: 'moodle-client-smoke-test',
                                type: 'string',
                            },
                        },
                    },
                ],
            }),
            '',
        ].join('\n'),
    });

    if (response.ok) {
        return { ok: true, status: response.status };
    }

    return {
        ok: false,
        status: response.status,
        reason: await safeResponseText(response),
    };
}

async function pollVerification(run) {
    const started = Date.now();
    let latest = await run();

    while (!latest.ok && Date.now() - started < VERIFY_TIMEOUT_MS) {
        await sleep(VERIFY_INTERVAL_MS);
        latest = await run();
    }

    return latest;
}

async function sleep(ms) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function safeResponseText(response) {
    const text = await response.text();
    return text.slice(0, 240);
}

function value(input) {
    return typeof input === 'string' ? input.trim() : '';
}

function dsnProjectId(input) {
    try {
        return new URL(input).pathname.replace(/^\/+/, '');
    } catch {
        return '';
    }
}

function dsnHost(input) {
    try {
        return new URL(input).host;
    } catch {
        return '';
    }
}

function parseDsn(input) {
    try {
        const parsed = new URL(input);
        return {
            protocol: parsed.protocol,
            host: parsed.host,
            publicKey: parsed.username,
            projectId: parsed.pathname.replace(/^\/+/, ''),
        };
    } catch {
        return null;
    }
}
