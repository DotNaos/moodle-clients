import React, { useMemo, useRef, useState } from 'react';
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
import { isMoodleBrowserSSOTokenUrl } from '../moodleBrowserSSO';
import { palette, styles } from '../styles';

declare const require: (id: string) => {
    WebView: React.ComponentType<any>;
};

type WebViewHandle = {
    injectJavaScript(script: string): void;
};

type NavigationRequest = {
    url?: string;
};

type NavigationState = {
    url?: string;
    loading?: boolean;
};

export function MoodleSSOLoginModal(props: {
    readonly visible: boolean;
    readonly launchUrl: string;
    readonly busy: boolean;
    readonly onClose: () => void;
    readonly onCallback: (url: string) => void;
    readonly onStatus: (message: string) => void;
}) {
    const webViewRef = useRef<WebViewHandle | null>(null);
    const [status, setStatus] = useState('Opening Moodle login.');
    const injectedJavaScript = useMemo(() => MOODLE_SSO_HELPER_SCRIPT, []);

    function updateStatus(message: string) {
        setStatus(message);
        props.onStatus(message);
    }

    function handleNavigation(navigation: NavigationState) {
        if (!navigation.url || navigation.loading) {
            return;
        }

        if (isMoodleBrowserSSOTokenUrl(navigation.url)) {
            props.onCallback(navigation.url);
            return;
        }

        updateStatus(statusForUrl(navigation.url));
        webViewRef.current?.injectJavaScript(injectedJavaScript);
    }

    function shouldStartLoad(request: NavigationRequest): boolean {
        const url = request.url ?? '';
        if (isMoodleBrowserSSOTokenUrl(url)) {
            props.onCallback(url);
            return false;
        }
        return true;
    }

    return (
        <Modal
            animationType="slide"
            visible={props.visible}
            onRequestClose={props.onClose}>
            <SafeAreaView style={modalStyles.screen}>
                <View style={modalStyles.header}>
                    <View style={modalStyles.titleGroup}>
                        <Text style={modalStyles.title}>Moodle Login</Text>
                        <Text style={modalStyles.subtitle}>
                            Sign in once to refresh the mobile web session.
                        </Text>
                    </View>
                    <Pressable
                        accessibilityLabel="Close Moodle login"
                        onPress={props.onClose}
                        style={styles.iconButton}>
                        <X color={palette.text} size={22} />
                    </Pressable>
                </View>
                <View style={modalStyles.statusStrip}>
                    {props.busy ? <ActivityIndicator color={palette.text} /> : null}
                    <Text style={modalStyles.statusText}>{status}</Text>
                </View>
                <View style={modalStyles.webViewFrame}>
                    {Platform.OS === 'web' ? (
                        <View style={modalStyles.webFallback}>
                            <Text style={modalStyles.webFallbackText}>
                                Moodle login is available in the native app.
                            </Text>
                        </View>
                    ) : (
                        <NativeMoodleSSOWebView
                            ref={webViewRef}
                            launchUrl={props.launchUrl}
                            injectedJavaScript={injectedJavaScript}
                            onNavigation={handleNavigation}
                            onShouldStartLoad={shouldStartLoad}
                        />
                    )}
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const NativeMoodleSSOWebView = React.forwardRef<
    WebViewHandle,
    Readonly<{
        launchUrl: string;
        injectedJavaScript: string;
        onNavigation: (navigation: NavigationState) => void;
        onShouldStartLoad: (request: NavigationRequest) => boolean;
    }>
>(function NativeMoodleSSOWebView(props, ref) {
    const NativeWebView = require('react-native-webview').WebView;
    return (
        <NativeWebView
            ref={ref}
            source={{ uri: props.launchUrl }}
            onLoadEnd={() => {
                (ref as React.MutableRefObject<WebViewHandle | null>).current?.injectJavaScript(
                    props.injectedJavaScript,
                );
            }}
            onNavigationStateChange={props.onNavigation}
            onShouldStartLoadWithRequest={props.onShouldStartLoad}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            allowsBackForwardNavigationGestures
            style={modalStyles.webView}
        />
    );
});

function statusForUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl);
        if (url.hostname === 'aai-login.fhgr.ch') {
            return 'Waiting for FHGR login.';
        }
        if (url.hostname === 'moodle.fhgr.ch') {
            return 'Waiting for Moodle to return to the app.';
        }
    } catch {
        return 'Waiting for Moodle login.';
    }
    return 'Waiting for Moodle login.';
}

const MOODLE_SSO_HELPER_SCRIPT = String.raw`
(function () {
  if (window.__moodleSsoHelperRunning) return true;
  window.__moodleSsoHelperRunning = true;
  window.setTimeout(function () {
    window.__moodleSsoHelperRunning = false;
  }, 1200);

  function normalized(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  var links = Array.prototype.slice.call(document.querySelectorAll("a, button, input[type='submit']"));
  for (var index = 0; index < links.length; index += 1) {
    var item = links[index];
    var label = normalized([item.innerText, item.value, item.title].filter(Boolean).join(" "));
    if (/proceed|continue|weiter|fortfahren/.test(label) && typeof item.click === "function") {
      item.click();
      return true;
    }
  }

  return true;
})();
`;

const modalStyles = StyleSheet.create({
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
