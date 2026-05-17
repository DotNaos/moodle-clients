import jsQR from 'jsqr';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { X } from '../icons';
import { MOODLE_BROWSER_LOGIN_SCRIPT } from '../moodleBrowserLoginScript';
import { palette, styles } from '../styles';

declare const require: (id: string) => {
    WebView: React.ComponentType<any>;
};

type WebViewHandle = {
    injectJavaScript(script: string): void;
};

type WebViewMessageEvent = {
    nativeEvent: {
        data: string;
    };
};

type WebViewNavigation = {
    url?: string;
    loading?: boolean;
};

type MoodleBrowserLoginModalProps = Readonly<{
    visible: boolean;
    siteUrl: string;
    busy: boolean;
    onClose: () => void;
    onResolvedQr: (value: string) => void;
    onStatus: (message: string) => void;
    onError: (message: string) => void;
}>;

type BrowserMessage =
    | {
          type: 'moodle-qr-link';
          value?: unknown;
      }
    | {
          type: 'moodle-qr-image';
          image?: {
              width?: unknown;
              height?: unknown;
              data?: unknown;
          };
      }
    | {
          type: 'moodle-page-scan';
          candidates?: unknown;
          title?: unknown;
          url?: unknown;
      }
    | {
          type: 'moodle-login-step';
          value?: unknown;
      };

type BrowserImagePayload = {
    width?: unknown;
    height?: unknown;
    data?: unknown;
};

const FHGR_MOODLE_HOST = 'moodle.fhgr.ch';
const FHGR_SHIBBOLETH_LOGIN_PATH =
    '/auth/shibboleth/login.php?idp=https%3A%2F%2Faai-login.fhgr.ch%2Fidp%2Fshibboleth';

export function MoodleBrowserLoginModal(props: MoodleBrowserLoginModalProps) {
    const webViewRef = useRef<WebViewHandle | null>(null);
    const foundQrRef = useRef(false);
    const navigatedToProfileRef = useRef(false);
    const [status, setStatus] = useState(
        'Sign in with Moodle. The app will continue automatically.',
    );
    const startUrl = useMemo(() => loginUrl(props.siteUrl), [props.siteUrl]);

    useEffect(() => {
        if (!props.visible) {
            return;
        }

        foundQrRef.current = false;
        navigatedToProfileRef.current = false;
        setStatus('Sign in with Moodle. The app will continue automatically.');
    }, [props.visible]);

    function updateStatus(message: string) {
        setStatus(message);
        props.onStatus(message);
    }

    function injectQrCapture() {
        if (foundQrRef.current || Platform.OS === 'web') {
            return;
        }

        webViewRef.current?.injectJavaScript(MOODLE_BROWSER_LOGIN_SCRIPT);
        updateStatus('Checking this Moodle page for the mobile login QR.');
    }

    function handleNavigationStateChange(navigation: WebViewNavigation) {
        const url = navigation.url;
        if (!url || navigation.loading) {
            return;
        }

        if (foundQrRef.current) {
            return;
        }

        if (isProfileUrl(url)) {
            updateStatus('Moodle profile opened. Reading the mobile QR.');
            injectQrCapture();
            return;
        }

        if (
            shouldOpenProfile(
                url,
                props.siteUrl,
                navigatedToProfileRef.current,
            )
        ) {
            navigatedToProfileRef.current = true;
            updateStatus('Login detected. Opening your Moodle profile.');
            webViewRef.current?.injectJavaScript(
                `window.location.href = ${JSON.stringify(profileUrl(props.siteUrl))}; true;`,
            );
            return;
        }

        if (isLoginLikeUrl(url)) {
            updateStatus('Waiting for Moodle login to finish.');
        }
    }

    function handleMessage(event: WebViewMessageEvent) {
        let payload: BrowserMessage;
        try {
            payload = JSON.parse(event.nativeEvent.data) as BrowserMessage;
        } catch {
            return;
        }

        if (foundQrRef.current) {
            return;
        }

        if (payload.type === 'moodle-qr-link' && typeof payload.value === 'string') {
            foundQrRef.current = true;
            updateStatus('Mobile login QR found. Connecting Moodle.');
            props.onResolvedQr(payload.value);
            return;
        }

        if (payload.type === 'moodle-qr-image') {
            const value = decodeQrImagePayload(payload.image);
            if (value) {
                foundQrRef.current = true;
                updateStatus('Mobile login QR read. Connecting Moodle.');
                props.onResolvedQr(value);
            }
            return;
        }

        if (payload.type === 'moodle-page-scan') {
            const count =
                typeof payload.candidates === 'number' ? payload.candidates : 0;
            updateStatus(
                count > 0
                    ? 'Found a possible QR image. Trying to read it.'
                    : 'No Moodle mobile QR found on this page yet.',
            );
            return;
        }

        if (payload.type === 'moodle-login-step') {
            if (payload.value === 'mobile-qr-button') {
                updateStatus('Opening the Moodle mobile QR.');
                return;
            }
            if (payload.value === 'fhgr-credentials') {
                updateStatus('Submitting the FHGR login.');
                return;
            }
            updateStatus('Opening the FHGR login form.');
        }
    }

    function handleError(message: string) {
        updateStatus(message);
        props.onError(message);
    }

    return (
        <Modal
            animationType="slide"
            visible={props.visible}
            onRequestClose={props.onClose}>
            <SafeAreaView style={browserStyles.screen}>
                <View style={browserStyles.header}>
                    <View style={browserStyles.titleGroup}>
                        <Text style={browserStyles.title}>Moodle Login</Text>
                        <Text style={browserStyles.subtitle} numberOfLines={1}>
                            {compactUrl(props.siteUrl)}
                        </Text>
                    </View>
                    <Pressable
                        accessibilityLabel="Close Moodle login"
                        onPress={props.onClose}
                        style={styles.iconButton}>
                        <X color={palette.text} size={22} />
                    </Pressable>
                </View>

                <View style={browserStyles.statusStrip}>
                    {props.busy ? (
                        <ActivityIndicator color={palette.text} />
                    ) : null}
                    <Text style={browserStyles.statusText}>{status}</Text>
                </View>

                <View style={browserStyles.webViewFrame}>
                    {Platform.OS === 'web' ? (
                        <View style={browserStyles.webFallback}>
                            <Text style={browserStyles.webFallbackText}>
                                Web login capture is available in the native mobile app.
                            </Text>
                        </View>
                    ) : (
                        <NativeMoodleWebView
                            ref={webViewRef}
                            startUrl={startUrl}
                            onLoadEnd={injectQrCapture}
                            onMessage={handleMessage}
                            onNavigationStateChange={handleNavigationStateChange}
                            onError={handleError}
                        />
                    )}
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const NativeMoodleWebView = React.forwardRef<
    WebViewHandle,
    Readonly<{
        startUrl: string;
        onLoadEnd: () => void;
        onMessage: (event: WebViewMessageEvent) => void;
        onNavigationStateChange: (navigation: WebViewNavigation) => void;
        onError: (message: string) => void;
    }>
>(function NativeMoodleWebView(props, ref) {
    const NativeWebView = require('react-native-webview').WebView;
    return (
        <NativeWebView
            ref={ref}
            source={{ uri: props.startUrl }}
            onLoadEnd={props.onLoadEnd}
            onMessage={props.onMessage}
            onNavigationStateChange={props.onNavigationStateChange}
            onError={() => props.onError('Moodle login could not be loaded.')}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            incognito
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            allowsBackForwardNavigationGestures
            style={browserStyles.webView}
        />
    );
});

function decodeQrImagePayload(image: BrowserImagePayload | undefined): string | null {
    if (
        !image ||
        typeof image.width !== 'number' ||
        typeof image.height !== 'number' ||
        !Array.isArray(image.data)
    ) {
        return null;
    }

    const pixels = Uint8ClampedArray.from(
        image.data.filter((value): value is number => typeof value === 'number'),
    );
    const result = jsQR(pixels, image.width, image.height, {
        inversionAttempts: 'attemptBoth',
    });

    return result?.data ?? null;
}

function loginUrl(siteUrl: string): string {
    const baseUrl = normalizeSiteUrl(siteUrl);
    try {
        if (new URL(baseUrl).hostname === FHGR_MOODLE_HOST) {
            return new URL(FHGR_SHIBBOLETH_LOGIN_PATH, baseUrl).toString();
        }
    } catch {
        return new URL('/login/index.php', baseUrl).toString();
    }

    return new URL('/login/index.php', baseUrl).toString();
}

function profileUrl(siteUrl: string): string {
    return new URL('/user/profile.php', normalizeSiteUrl(siteUrl)).toString();
}

function normalizeSiteUrl(siteUrl: string): string {
    return siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
}

function isProfileUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl);
        return url.pathname.endsWith('/user/profile.php');
    } catch {
        return false;
    }
}

function shouldOpenProfile(
    rawUrl: string,
    siteUrl: string,
    alreadyNavigated: boolean,
): boolean {
    if (alreadyNavigated || isLoginLikeUrl(rawUrl)) {
        return false;
    }

    try {
        const current = new URL(rawUrl);
        const site = new URL(normalizeSiteUrl(siteUrl));
        return (
            current.origin === site.origin ||
            isFhgrLoginResultHost(current.hostname)
        );
    } catch {
        return false;
    }
}

function isFhgrLoginResultHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return (
        host === 'login.eduid.ch' ||
        host === 'aai-login.fhgr.ch' ||
        host.endsWith('.fhgr.ch')
    );
}

function isLoginLikeUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl);
        const value = `${url.hostname} ${url.pathname}`.toLowerCase();
        return /login|saml|oauth|openid|idp|shibboleth|wayf/.test(value);
    } catch {
        return false;
    }
}

function compactUrl(siteUrl: string): string {
    try {
        return new URL(siteUrl).host;
    } catch {
        return siteUrl;
    }
}

const browserStyles = StyleSheet.create({
    screen: {
        backgroundColor: palette.background,
        flex: 1,
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 72,
        paddingBottom: 12,
    },
    titleGroup: {
        flex: 1,
        gap: 3,
        minWidth: 0,
    },
    title: {
        color: palette.text,
        fontSize: 22,
        fontWeight: '900',
    },
    subtitle: {
        color: palette.muted,
        fontSize: 13,
        fontWeight: '700',
    },
    statusStrip: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        flexDirection: 'row',
        gap: 10,
        marginHorizontal: 20,
        marginBottom: 12,
        minHeight: 48,
        paddingHorizontal: 16,
        borderRadius: 9999,
    },
    statusText: {
        color: palette.text,
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
        lineHeight: 18,
    },
    webViewFrame: {
        backgroundColor: palette.surface,
        flex: 1,
        overflow: 'hidden',
    },
    webView: {
        backgroundColor: palette.background,
        flex: 1,
    },
    webFallback: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    webFallbackText: {
        color: palette.muted,
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
    },
});
