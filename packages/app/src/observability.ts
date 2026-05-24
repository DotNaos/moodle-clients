import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

declare const __DEV__: boolean;
declare const process:
    | {
          env?: {
              EXPO_PUBLIC_SENTRY_DSN?: string;
              EXPO_PUBLIC_SENTRY_ENVIRONMENT?: string;
              EXPO_PUBLIC_MOODLE_CLIENT_BUILD_DATE?: string;
              EXPO_PUBLIC_MOODLE_CLIENT_COMMIT_HASH?: string;
          };
      }
    | undefined;

let initialized = false;

export function initObservability(): void {
    if (initialized) {
        return;
    }

    initialized = true;
    const dsn = process?.env?.EXPO_PUBLIC_SENTRY_DSN?.trim();
    if (!dsn) {
        return;
    }

    Sentry.init({
        dsn,
        environment: getEnvironment(),
        release: getReleaseName(),
        dist: Updates.updateId ?? undefined,
        enableLogs: true,
        sendDefaultPii: false,
        tracesSampleRate: __DEV__ ? 1 : 0.1,
        beforeSend(event) {
            return scrubSentryValue(event) as typeof event;
        },
        beforeSendLog(log) {
            return scrubSentryValue(log) as typeof log;
        },
    });

    Sentry.setTags({
        platform: Platform.OS,
        appVersion: getAppVersion(),
        appCommitHash: getBuildInfoString('commitHash') ?? 'unknown',
        appBuildDate: getBuildInfoString('buildDate') ?? 'unknown',
        expoRuntimeVersion: Updates.runtimeVersion ?? 'unknown',
        expoChannel: Updates.channel ?? 'unknown',
        expoUpdateId: Updates.updateId ?? 'embedded',
        expoIsEmbeddedUpdate: String(Updates.isEmbeddedLaunch),
    });

    const updateGroup = getExpoUpdateGroup();
    if (updateGroup) {
        Sentry.setTag('expoUpdateGroup', updateGroup);
        Sentry.setTag('expoUpdateUrl', getExpoUpdateUrl(updateGroup));
    }

    recordInfo('Observability initialized', {
        release: getReleaseName(),
        environment: getEnvironment(),
        platform: Platform.OS,
        expoChannel: Updates.channel ?? 'unknown',
        expoUpdateId: Updates.updateId ?? 'embedded',
        appCommitHash: getBuildInfoString('commitHash') ?? 'unknown',
        appBuildDate: getBuildInfoString('buildDate') ?? 'unknown',
    });
}

export function wrapWithObservability<P extends Record<string, unknown>>(
    component: ComponentType<P>,
): ComponentType<P> {
    initObservability();
    return Sentry.wrap(component);
}

export function recordInfo(
    scopeName: string,
    details: Record<string, unknown> = {},
): void {
    if (!isEnabled()) {
        return;
    }

    const attributes = toLogAttributes(details);
    Sentry.addBreadcrumb({
        category: 'moodle-client',
        level: 'info',
        message: scopeName,
        data: attributes,
    });
    Sentry.logger?.info?.(scopeName, attributes);
    Sentry.withScope((scope) => {
        scope.setLevel('info');
        scope.setTag('moodle.scope', scopeName);
        scope.setContext('moodle.details', attributes);
        Sentry.captureMessage(scopeName);
    });
}

export function recordError(
    scopeName: string,
    error: unknown,
    details: Record<string, unknown> = {},
): void {
    if (!isEnabled()) {
        return;
    }

    const attributes = toLogAttributes(details);
    Sentry.addBreadcrumb({
        category: 'moodle-client',
        level: 'error',
        message: scopeName,
        data: attributes,
    });
    Sentry.logger?.error?.(scopeName, attributes);
    Sentry.withScope((scope) => {
        scope.setTag('moodle.scope', scopeName);
        scope.setContext('moodle.details', attributes);
        Sentry.captureException(asError(error));
    });
}

export function setObservabilityUser(userId: number | null): void {
    if (!isEnabled()) {
        return;
    }

    Sentry.setUser(userId ? { id: `moodle:${userId}` } : null);
}

function isEnabled(): boolean {
    return initialized && Boolean(Sentry.getClient());
}

function getEnvironment(): string {
    return (
        process?.env?.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
        (__DEV__ ? 'development' : 'production')
    );
}

function getReleaseName(): string {
    const slug = Constants.expoConfig?.slug ?? 'moodle-client';
    return `${slug}@${getAppVersion()}`;
}

function getAppVersion(): string {
    return Constants.expoConfig?.version ?? '0.0.0';
}

function getBuildInfoString(key: 'buildDate' | 'commitHash'): string | null {
    if (key === 'buildDate') {
        const value = process?.env?.EXPO_PUBLIC_MOODLE_CLIENT_BUILD_DATE?.trim();
        if (value) {
            return value;
        }
    }

    if (key === 'commitHash') {
        const value = process?.env?.EXPO_PUBLIC_MOODLE_CLIENT_COMMIT_HASH?.trim();
        if (value) {
            return value;
        }
    }

    return (
        readNestedString(Constants.expoConfig?.extra, [key]) ||
        readNestedString(Updates.manifest, ['extra', key]) ||
        readNestedString(Updates.manifest, ['extra', 'expoClient', 'extra', key])
    );
}

function getExpoUpdateGroup(): string | null {
    const manifest = Updates.manifest;
    if (!manifest || typeof manifest !== 'object') {
        return null;
    }

    const metadata = getRecordValue(manifest, 'metadata');
    const updateGroup = getRecordValue(metadata, 'updateGroup');
    return typeof updateGroup === 'string' ? updateGroup : null;
}

function readNestedString(value: unknown, path: string[]): string | null {
    let current = value;
    for (const segment of path) {
        if (!current || typeof current !== 'object') {
            return null;
        }
        current = (current as Record<string, unknown>)[segment];
    }

    return typeof current === 'string' && current.trim()
        ? current.trim()
        : null;
}

function getExpoUpdateUrl(updateGroup: string): string {
    const owner = Constants.expoConfig?.owner ?? 'omiq';
    const slug = Constants.expoConfig?.slug ?? 'moodle-client';
    return `https://expo.dev/accounts/${owner}/projects/${slug}/updates/${updateGroup}`;
}

function toLogAttributes(
    details: Record<string, unknown>,
): Record<string, string | number | boolean> {
    return Object.fromEntries(
        Object.entries(details).map(([key, value]) => [
            key,
            toLogAttributeValue(value),
        ]),
    );
}

function toLogAttributeValue(value: unknown): string | number | boolean {
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function asError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    return new Error(String(error));
}

function scrubSentryValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return scrubString(value);
    }

    if (Array.isArray(value)) {
        return value.map(scrubSentryValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(
                ([key, entry]) => [key, scrubSentryValue(entry)],
            ),
        );
    }

    return value;
}

function scrubString(value: string): string {
    return value
        .replace(/moodlemobile:\/\/\S+/gi, 'moodlemobile://[redacted]')
        .replace(
            /\b(qrlogin|privatetoken|wstoken|token)=([^&\s"]+)/gi,
            '$1=[redacted]',
        );
}

function getRecordValue(
    value: unknown,
    key: string,
): Record<string, unknown> | unknown {
    if (!value || typeof value !== 'object') {
        return null;
    }

    return (value as Record<string, unknown>)[key];
}
