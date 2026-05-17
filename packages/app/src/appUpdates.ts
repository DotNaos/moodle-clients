import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Linking, Platform } from 'react-native';

import { logDevError } from './debug';

declare const __DEV__: boolean;
declare const process:
    | {
          env?: {
              EXPO_PUBLIC_MOODLE_CLIENT_DOWNLOAD_URL?: string;
              EXPO_PUBLIC_MOODLE_CLIENT_RELEASE_API_URL?: string;
          };
      }
    | undefined;

export type AppUpdateCheckResult =
    | { kind: 'up-to-date' }
    | { kind: 'development' }
    | { kind: 'reloading' }
    | {
          kind: 'self-update-disabled';
          title: string;
          message: string;
          downloadUrl: string;
      }
    | {
          kind: 'manual-update';
          title: string;
          message: string;
          downloadUrl: string;
      };

export type AppUpdateDiagnostics = {
    readonly selfUpdateEnabled: boolean;
    readonly runtimeVersion: string | null;
    readonly channel: string | null;
    readonly updateId: string | null;
    readonly createdAt: string | null;
};

type GitHubReleaseResponse = {
    readonly html_url?: unknown;
    readonly tag_name?: unknown;
    readonly name?: unknown;
};

const DEFAULT_DOWNLOAD_URL =
    'https://github.com/DotNaos/moodle-clients/releases/latest';
const DEFAULT_RELEASE_API_URL =
    'https://api.github.com/repos/DotNaos/moodle-clients/releases/latest';

export function getCurrentAppVersion(): string {
    return Constants.expoConfig?.version ?? '0.0.0';
}

export function getAppDownloadUrl(): string {
    return (
        process?.env?.EXPO_PUBLIC_MOODLE_CLIENT_DOWNLOAD_URL?.trim() ||
        readExpoExtraString('downloadUrl') ||
        DEFAULT_DOWNLOAD_URL
    );
}

export function getAppUpdateDiagnostics(): AppUpdateDiagnostics {
    return {
        selfUpdateEnabled: Updates.isEnabled,
        runtimeVersion: Updates.runtimeVersion,
        channel: Updates.channel,
        updateId: Updates.updateId,
        createdAt: Updates.createdAt?.toISOString() ?? null,
    };
}

export async function openAppDownloadPage(): Promise<void> {
    await Linking.openURL(getAppDownloadUrl());
}

export async function checkAndApplyAppUpdate(): Promise<AppUpdateCheckResult> {
    if (Platform.OS === 'web') {
        return { kind: 'up-to-date' };
    }

    if (__DEV__) {
        return { kind: 'development' };
    }

    const selfUpdateResult = await applyCompatibleAppUpdate();
    if (selfUpdateResult) {
        return selfUpdateResult;
    }

    const nativeRelease = await findNewerNativeRelease();
    if (nativeRelease) {
        return {
            kind: 'manual-update',
            title: 'New app download available',
            message:
                'This update needs a fresh app download. Open the download page from here.',
            downloadUrl: nativeRelease,
        };
    }

    return { kind: 'up-to-date' };
}

async function applyCompatibleAppUpdate(): Promise<AppUpdateCheckResult | null> {
    if (!Updates.isEnabled) {
        return {
            kind: 'self-update-disabled',
            title: 'Install once to enable self-updates',
            message:
                'This app install cannot check for app-only updates. Install the latest build once; future updates can then arrive automatically.',
            downloadUrl: getAppDownloadUrl(),
        };
    }

    try {
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable && !update.isRollBackToEmbedded) {
            return null;
        }

        const fetchedUpdate = await Updates.fetchUpdateAsync();
        if (fetchedUpdate.isNew || fetchedUpdate.isRollBackToEmbedded) {
            await Updates.reloadAsync();
            return { kind: 'reloading' };
        }
    } catch (error) {
        logDevError('App self-update failed', error);
    }

    return null;
}

async function findNewerNativeRelease(): Promise<string | null> {
    const releaseApiUrl = getReleaseApiUrl();
    if (!releaseApiUrl) {
        return null;
    }

    try {
        const response = await fetch(releaseApiUrl, {
            headers: {
                Accept: 'application/vnd.github+json',
            },
        });
        if (!response.ok) {
            return null;
        }

        const release = (await response.json()) as GitHubReleaseResponse;
        const latestVersion = normalizeVersion(
            stringValue(release.tag_name) ?? stringValue(release.name),
        );
        const currentVersion = normalizeVersion(getCurrentAppVersion());
        if (!latestVersion || !currentVersion) {
            return null;
        }

        if (compareVersions(latestVersion, currentVersion) <= 0) {
            return null;
        }

        return stringValue(release.html_url) ?? getAppDownloadUrl();
    } catch (error) {
        logDevError('Native app release check failed', error);
        return null;
    }
}

function getReleaseApiUrl(): string | null {
    const configured =
        process?.env?.EXPO_PUBLIC_MOODLE_CLIENT_RELEASE_API_URL?.trim() ||
        readExpoExtraString('releaseApiUrl') ||
        DEFAULT_RELEASE_API_URL;
    return configured.length > 0 ? configured : null;
}

function readExpoExtraString(key: string): string | null {
    const extra = Constants.expoConfig?.extra;
    if (!extra || typeof extra !== 'object') {
        return null;
    }

    const value = (extra as Record<string, unknown>)[key];
    return stringValue(value);
}

function stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeVersion(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const match = value.trim().match(/^v?(\d+(?:\.\d+){0,2})/i);
    return match?.[1] ?? null;
}

function compareVersions(a: string, b: string): number {
    const left = a.split('.').map((part) => Number(part));
    const right = b.split('.').map((part) => Number(part));
    for (let index = 0; index < 3; index += 1) {
        const diff = (left[index] ?? 0) - (right[index] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}
