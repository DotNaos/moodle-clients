import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import type { WebexBridgeResult } from '../../replay';
import { replayStyles } from '../../replayStyles';
import {
    clearWebexLoginCredentials,
    loadWebexLoginCredentials,
    storeWebexLoginCredentials,
} from '../../storage';
import {
    buildWebexLoginAutomationScript,
    normalizeWebexLoginCredentials,
    type WebexLoginCredentials,
} from '../../webexLoginAutomation';
import type { ActiveWebexBridgeRequest, ActiveWebexBridgeResult } from './types';
import {
    MoodleReconnectPrompt,
    WebexAutomationPanel,
    WebexBridgeHeader,
    WebexLoginPrompt,
} from './WebexBridgePrompts';
import { isWebexAuthFailureMessage } from './webexAuthErrors';
import { logWebexBridge, webexBrowserPageStatus } from './webexBridgeDiagnostics';
import { buildWebexBridgeScript, buildWebexNavigationGuardScript } from './webexBridgeScript';
import { loadWebexRecordingsFromNativeCookies } from './webexNativeCookies';

type WebexBridgeMode = 'credentials' | 'automating' | 'manual' | 'moodle-reconnect';

export function WebexBridge(props: {
    readonly request: ActiveWebexBridgeRequest | null;
    readonly onRecordings: (result: ActiveWebexBridgeResult) => void;
    readonly onError: (courseId: number, message: string, loadId?: number) => void;
    readonly onClose: () => void;
}) {
    const webViewRef = useRef<WebView>(null);
    const automationRestartCount = useRef(0);
    const automationSubmitCount = useRef(0);
    const fhgrLoginNavigationCount = useRef(0);
    const automationStopped = useRef(false);
    const nativeCookieLoadStarted = useRef(false);
    const [mode, setMode] = useState<WebexBridgeMode>('credentials');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(true);
    const [loginError, setLoginError] = useState('');
    const [status, setStatus] = useState('');
    const [credentials, setCredentials] = useState<WebexLoginCredentials | null>(null);
    const [webViewKey, setWebViewKey] = useState(0);
    const [automationRunId, setAutomationRunId] = useState(() => Date.now());
    const browserEntryUrl = props.request?.loginUrl ?? props.request?.url;
    const useSignedLaunchHTML = Boolean(
        props.request?.html &&
            !props.request?.usesMoodleAutoLogin &&
            !props.request?.loginUrl,
    );
    const fallbackLoginUrl = useSignedLaunchHTML
        ? ''
        : props.request?.loginUrl ?? props.request?.url ?? '';
    const injectedJavaScript = useMemo(
        () =>
            `${buildWebexLoginAutomationScript(
                credentials,
                props.request?.url ?? '',
                fallbackLoginUrl,
                automationRunId,
            )}
            ${buildWebexBridgeScript(
                props.request?.courseId ?? 0,
                props.request?.courseTitle ?? '',
                props.request?.courseFullName ?? '',
                props.request?.courseShortName ?? '',
                fallbackLoginUrl,
                props.request?.loadId ?? 0,
            )}`,
        [
            credentials,
            automationRunId,
            props.request?.courseId,
            props.request?.courseTitle,
            props.request?.courseFullName,
            props.request?.courseShortName,
            fallbackLoginUrl,
            props.request?.loadId,
            props.request?.url,
            webViewKey,
        ],
    );
    const injectedJavaScriptBeforeContentLoaded = useMemo(
        () => buildWebexNavigationGuardScript(),
        [],
    );

    useEffect(() => {
        let mounted = true;
        if (!props.request) {
            setCredentials(null);
            setMode('credentials');
            setStatus('');
            setLoginError('');
            automationRestartCount.current = 0;
            automationSubmitCount.current = 0;
            fhgrLoginNavigationCount.current = 0;
            automationStopped.current = false;
            nativeCookieLoadStarted.current = false;
            return () => {
                mounted = false;
            };
        }

        if (props.request.requiresMoodleReconnect) {
            setMode('moodle-reconnect');
            setStatus('');
            setLoginError('');
            setCredentials(null);
            return () => {
                mounted = false;
            };
        }

        if (props.request.usesMoodleAutoLogin || props.request.usesMoodleBrowserLogin) {
            setMode('automating');
            setStatus(
                props.request.usesMoodleBrowserLogin
                    ? 'Opening Moodle browser session.'
                    : 'Opening Moodle Webex session.',
            );
            setLoginError('');
            setCredentials(null);
            automationRestartCount.current = 0;
            automationSubmitCount.current = 0;
            fhgrLoginNavigationCount.current = 0;
            automationStopped.current = false;
            nativeCookieLoadStarted.current = false;
            void loadWebexLoginCredentials().then((stored) => {
                if (!mounted || !props.request) {
                    return;
                }
                if (stored) {
                    setUsername(stored.username);
                    setPassword(stored.password);
                    setRemember(true);
                    startAutomation(stored, 'Opening Moodle browser session.');
                    return;
                }
                if (props.request.usesMoodleBrowserLogin) {
                    setMode('credentials');
                    setStatus('');
                }
            });
            return () => {
                mounted = false;
            };
        }

        setMode('credentials');
        setStatus('');
        setLoginError('');
        setCredentials(null);
        automationRestartCount.current = 0;
        automationSubmitCount.current = 0;
        fhgrLoginNavigationCount.current = 0;
        automationStopped.current = false;
        nativeCookieLoadStarted.current = false;
        setWebViewKey((value) => value + 1);
        void loadWebexLoginCredentials().then((stored) => {
            if (!mounted || !props.request) {
                return;
            }
            if (stored) {
                setUsername(stored.username);
                setPassword(stored.password);
                setRemember(true);
            }
        });

        return () => {
            mounted = false;
        };
    }, [
        props.request?.courseId,
        props.request?.html,
        props.request?.loadId,
        props.request?.usesMoodleAutoLogin,
        props.request?.usesMoodleBrowserLogin,
    ]);

    useEffect(() => {
        if (mode !== 'automating' || !props.request) {
            return undefined;
        }

        const timer = setTimeout(() => {
            openManualLogin('Automatic login did not finish. Continue in the WebView.');
        }, 30000);

        return () => clearTimeout(timer);
    }, [mode, props.request?.courseId, props.request?.loadId, webViewKey]);

    function handleMessage(rawMessage: string) {
        let message: unknown;
        try {
            message = JSON.parse(rawMessage);
        } catch {
            return;
        }

        if (!message || typeof message !== 'object') {
            return;
        }

        const event = message as {
            type?: string;
            courseId?: number;
            loadId?: number;
            recordings?: unknown;
            message?: string;
            stage?: string;
            statusCode?: number;
            itemCount?: number;
            totalCount?: number;
            status?: string;
            url?: string;
            host?: string;
            path?: string;
            queryKeys?: unknown;
            title?: string;
            hasMoodleGuest?: boolean;
            hasMoodleEnrol?: boolean;
            hasWebexUnableLaunch?: boolean;
            hasWebexApplication?: boolean;
            retryingWebexApi?: boolean;
            blockedMoodleAuth?: boolean;
            blockedUrl?: string;
        };

        if (event.type === 'webex-login-automation') {
            handleAutomationEvent(event);
            return;
        }

        if (event.type === 'webex-bridge-page') {
            logWebexBridge('page', {
                url: `${event.host ?? ''}${event.path ?? ''}`,
                queryKeys: Array.isArray(event.queryKeys) ? event.queryKeys.join(',') : '',
                title: event.title ?? '',
                hasMoodleGuest: event.hasMoodleGuest ?? false,
                hasMoodleEnrol: event.hasMoodleEnrol ?? false,
                hasWebexUnableLaunch: event.hasWebexUnableLaunch ?? false,
                hasWebexApplication: event.hasWebexApplication ?? false,
                retryingWebexApi: event.retryingWebexApi ?? false,
                blockedMoodleAuth: event.blockedMoodleAuth ?? false,
                blockedUrl: event.blockedUrl ?? '',
            });
            if (event.retryingWebexApi) {
                setStatus('Waiting for Webex recording session.');
            }
            if (event.hasWebexApplication) {
                setStatus('Reading Webex recording data.');
            }
            if (event.hasMoodleGuest || event.hasMoodleEnrol) {
                setStatus('Moodle browser session is still a guest session.');
            }
            if (event.hasWebexUnableLaunch && mode === 'automating') {
                setMode('credentials');
                setStatus('');
                setLoginError('Webex needs a Moodle browser login before recordings can load.');
            }
            return;
        }

        if (event.type === 'webex-api-diagnostic') {
            logWebexBridge('api-diagnostic', {
                stage: event.stage ?? '',
                statusCode: event.statusCode ?? 0,
                itemCount: event.itemCount ?? 0,
                totalCount: event.totalCount ?? 0,
                message: event.message ?? '',
            });
            if (
                event.stage === 'recording-item-drops' &&
                (event.itemCount ?? 0) === 0 &&
                (event.totalCount ?? 0) > 0
            ) {
                void loadFromNativeCookies();
            }
            return;
        }

        if (event.type === 'webex-recordings' && typeof event.courseId === 'number') {
            props.onRecordings({
                courseId: event.courseId,
                loadId: event.loadId,
                recordings: Array.isArray(event.recordings)
                    ? event.recordings.flatMap((item) =>
                          isBridgeRecording(item) ? [item] : [],
                      )
                    : [],
            });
            return;
        }

        if (event.type === 'webex-error' && typeof event.courseId === 'number') {
            if (isWebexAuthFailureMessage(event.message ?? '')) {
                requireWebexSignIn();
                return;
            }
            if (mode === 'automating') {
                openManualLogin(
                    event.message || 'Automatic login could not load Webex recordings.',
                    true,
                );
                return;
            }
            props.onError(
                event.courseId,
                event.message || 'Webex recordings could not be loaded from the browser session.',
                event.loadId,
            );
        }
    }

    async function loadFromNativeCookies() {
        if (!props.request || nativeCookieLoadStarted.current) {
            return;
        }
        nativeCookieLoadStarted.current = true;
        try {
            const recordings = await loadWebexRecordingsFromNativeCookies({
                courseId: props.request.courseId,
                courseTitle: props.request.courseTitle ?? '',
                courseFullName: props.request.courseFullName ?? '',
                courseShortName: props.request.courseShortName ?? '',
            });
            if (recordings.length === 0) {
                nativeCookieLoadStarted.current = false;
            }
            props.onRecordings({
                courseId: props.request.courseId,
                loadId: props.request.loadId,
                recordings,
            });
        } catch (error) {
            nativeCookieLoadStarted.current = false;
            logWebexBridge('native-cookie-api-error', {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    function requireWebexSignIn() {
        setMode('credentials');
        setStatus('');
        setCredentials(null);
        setLoginError('Webex needs sign in before recordings can load.');
    }

    function handleAutomationEvent(event: {
        readonly message?: string;
        readonly status?: string;
        readonly url?: string;
    }) {
        logWebexBridge('automation', {
            status: event.status ?? '',
            message: event.message ?? '',
            url: event.url ?? '',
        });
        if (event.status === 'submitted') {
            automationSubmitCount.current += 1;
            fhgrLoginNavigationCount.current = 0;
            if (automationSubmitCount.current > 1) {
                setCredentials(null);
                automationStopped.current = true;
                openManualLogin(
                    'Automatic login stopped after one submit to avoid repeated login requests.',
                );
                return;
            }
        }
        if (event.status === 'restart-login') {
            automationRestartCount.current += 1;
            setCredentials(null);
            automationStopped.current = true;
            openManualLogin(
                'FHGR login session expired. Automatic login stopped to avoid repeated login requests.',
            );
            return;
        }
        if (event.status === 'manual-required') {
            const message = event.message || 'Automatic login needs manual confirmation.';
            setLoginError(message);
            automationStopped.current = true;
            if (/did not accept/i.test(message)) {
                setMode('credentials');
                setStatus('');
                setCredentials(null);
                setUsername('');
                setPassword('');
                void clearWebexLoginCredentials().catch(() => undefined);
                return;
            }
            setCredentials(null);
            openManualLogin(message);
            return;
        }
        if (event.message) {
            setStatus(event.message);
        }
    }

    async function submitLogin() {
        const normalized = normalizeWebexLoginCredentials({ username, password });
        if (!normalized) {
            setLoginError('Enter your FHGR username and password.');
            return;
        }

        setLoginError('');
        try {
            if (remember) {
                await storeWebexLoginCredentials(normalized);
            } else {
                await clearWebexLoginCredentials();
            }
        } catch {
            setLoginError('The credentials could not be saved securely.');
            return;
        }

        startAutomation(normalized, 'Signing in...');
    }

    function startAutomation(
        nextCredentials: WebexLoginCredentials,
        nextStatus: string,
    ) {
        automationRestartCount.current = 0;
        automationSubmitCount.current = 0;
        fhgrLoginNavigationCount.current = 0;
        automationStopped.current = false;
        setAutomationRunId(Date.now());
        setCredentials(nextCredentials);
        setStatus(nextStatus);
        setMode('automating');
        setWebViewKey((value) => value + 1);
    }

    function openManualLogin(message?: string, keepCredentials = false) {
        setMode('manual');
        if (!keepCredentials) {
            setCredentials(null);
        }
        setStatus(message || 'Continue in the WebView.');
    }

    function editCredentials() {
        setMode('credentials');
        setCredentials(null);
        setStatus('');
        setLoginError('');
    }

    const source = props.request
        ? useSignedLaunchHTML && props.request.html
            ? { html: props.request.html }
            : browserEntryUrl
            ? { uri: browserEntryUrl }
            : { html: props.request.html ?? '' }
        : { html: '' };
    const showWebView =
        props.request !== null && mode !== 'credentials' && mode !== 'moodle-reconnect';

    return (
        <Modal
            animationType="slide"
            visible={props.request !== null}
            onRequestClose={props.onClose}>
            <SafeAreaView style={replayStyles.bridgeModal}>
                {mode === 'moodle-reconnect' ? (
                    <MoodleReconnectPrompt onClose={props.onClose} />
                ) : mode === 'credentials' ? (
                    <WebexLoginPrompt
                        username={username}
                        password={password}
                        remember={remember}
                        error={loginError}
                        onUsernameChange={setUsername}
                        onPasswordChange={setPassword}
                        onToggleRemember={() => setRemember((value) => !value)}
                        onSubmit={submitLogin}
                        onManualLogin={() => openManualLogin('Manual login opened.')}
                        onClose={props.onClose}
                    />
                ) : (
                    <View style={replayStyles.bridgeRuntime}>
                        <WebexBridgeHeader
                            mode={mode}
                            status={status}
                            onOpenManual={() => openManualLogin('Manual login opened.', true)}
                            onEditCredentials={editCredentials}
                            onClose={props.onClose}
                        />
                        {mode === 'automating' ? (
                            <WebexAutomationPanel />
                        ) : null}
                    </View>
                )}
                {showWebView ? (
                    <WebView
                        key={`${props.request?.courseId ?? 0}:${props.request?.loadId ?? 0}:${webViewKey}`}
                        ref={webViewRef}
                        source={source}
                        sharedCookiesEnabled
                        thirdPartyCookiesEnabled
                        domStorageEnabled
                        javaScriptEnabled
                        injectedJavaScriptBeforeContentLoaded={
                            injectedJavaScriptBeforeContentLoaded
                        }
                        injectedJavaScript={injectedJavaScript}
                        onLoadEnd={() => webViewRef.current?.injectJavaScript(injectedJavaScript)}
                        onNavigationStateChange={(event) => {
                            logWebexBridge('navigation', {
                                url: event.url,
                                loading: event.loading,
                            });
                            const nextStatus = webexBrowserPageStatus(event.url);
                            if (nextStatus) {
                                setStatus(nextStatus);
                            }
                            if (
                                mode === 'automating' &&
                                !event.loading &&
                                isWebexApplicationUrl(event.url)
                            ) {
                                setStatus('Reading Webex recording data.');
                            }
                        }}
                        onShouldStartLoadWithRequest={(request) => {
                            if (automationStopped.current && isFhgrLoginUrl(request.url)) {
                                logWebexBridge('login-circuit-blocked', {
                                    url: request.url,
                                });
                                return false;
                            }
                            if (
                                mode === 'automating' &&
                                shouldStopFhgrLoginNavigation(request.url)
                            ) {
                                logWebexBridge('login-circuit-breaker', {
                                    url: request.url,
                                    count: fhgrLoginNavigationCount.current,
                                });
                                setCredentials(null);
                                automationStopped.current = true;
                                openManualLogin(
                                    'Automatic login stopped to avoid repeated FHGR login requests.',
                                );
                                return false;
                            }
                            if (mode === 'automating' && isMoodleLtiAuthUrl(request.url)) {
                                logWebexBridge('moodle-lti-auth-navigation', {
                                    url: request.url,
                                });
                            } else {
                                logWebexBridge('navigation-request', {
                                    url: request.url,
                                });
                            }
                            return true;
                        }}
                        onError={(event) => {
                            logWebexBridge('load-error', {
                                url: event.nativeEvent.url,
                                message: event.nativeEvent.description,
                            });
                            if (mode === 'automating') {
                                setMode('credentials');
                                setStatus('');
                                setLoginError(
                                    'Webex needs a Moodle browser login before recordings can load.',
                                );
                            }
                        }}
                        onMessage={(event) => handleMessage(event.nativeEvent.data)}
                        style={
                            mode === 'automating'
                                ? replayStyles.bridgeHiddenWebView
                                : replayStyles.webView
                        }
                    />
                ) : null}
            </SafeAreaView>
        </Modal>
    );

    function shouldStopFhgrLoginNavigation(url: string | undefined): boolean {
        if (!isFhgrLoginUrl(url)) {
            return false;
        }
        if (automationSubmitCount.current > 0) {
            return false;
        }
        fhgrLoginNavigationCount.current += 1;
        const maxBeforeSubmit = 4;
        return fhgrLoginNavigationCount.current > maxBeforeSubmit;
    }
}

function isMoodleLtiAuthUrl(url: string | undefined): boolean {
    if (!url) {
        return false;
    }
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'moodle.fhgr.ch' && parsed.pathname === '/mod/lti/auth.php';
    } catch {
        return false;
    }
}

function isFhgrLoginUrl(url: string | undefined): boolean {
    if (!url) {
        return false;
    }
    try {
        return new URL(url).hostname === 'aai-login.fhgr.ch';
    } catch {
        return false;
    }
}

function isWebexApplicationUrl(url: string | undefined): boolean {
    if (!url) {
        return false;
    }
    try {
        const parsed = new URL(url);
        return (
            parsed.hostname === 'lti.webex.com' &&
            parsed.pathname.includes('/application')
        );
    } catch {
        return false;
    }
}

function isBridgeRecording(value: unknown): value is WebexBridgeResult['recordings'][number] {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const record = value as Record<string, unknown>;
    return (
        typeof record.recordingDate === 'string' &&
        typeof record.recordingName === 'string' &&
        typeof record.streamUrl === 'string' &&
            typeof record.recordingUuid === 'string' &&
            typeof record.sessionTitle === 'string' &&
            (typeof record.sourceUrl === 'string' || record.sourceUrl === null) &&
            (typeof record.coverUrl === 'string' || record.coverUrl === null) &&
            (typeof record.durationSeconds === 'number' || record.durationSeconds === null) &&
            (
                record.sourceCourseId === undefined ||
                typeof record.sourceCourseId === 'string'
            ) &&
            (
                record.sourceCourseName === undefined ||
                typeof record.sourceCourseName === 'string'
            )
    );
}
