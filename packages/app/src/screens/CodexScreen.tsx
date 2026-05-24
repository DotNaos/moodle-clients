import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Card, ScreenSection, TextField } from '../components/ui';
import {
    getCodexAuthStatus,
    claimCodexPairing,
    startCodexAuth,
    startCodexPairing,
    streamCodexTask,
    syncMoodleSessionToCodex,
    type CodexAuthEvent,
    type CodexPairing,
    type CodexStreamEvent,
} from '../codex';
import { Bot, Link2, SendHorizontal } from '../icons';
import type {
    MoodleConnection,
    MoodleCourse,
    MoodleCourseSection,
} from '../moodle';
import { palette, styles } from '../styles';
import type { AppView } from '../types';
import { applyCodexActions } from './codexScreenActions';
import { buildMoodleContext } from './codexMoodleContext';

export type CodexScreenProps = Readonly<{
    connection: MoodleConnection | null;
    courses: MoodleCourse[];
    courseContentsById: Record<number, MoodleCourseSection[]>;
    activeView: AppView;
    selectedCourseId: number | null;
    onNavigateTab: (view: AppView) => void;
    onOpenCourse: (courseId: number) => Promise<void> | void;
    onLoadCourseContents: (courseId: number) => Promise<void> | void;
    onOpenResource: (
        courseId: number,
        resourceId?: string | null,
        filename?: string | null,
    ) => Promise<void> | void;
}>;

type ChatMessage = {
    id: string;
    role: 'user' | 'codex';
    text: string;
    tools?: Array<{ title: string; status: string }>;
    isError?: boolean;
};

type CodexAuthState = 'checking' | 'missing' | 'syncing' | 'pairing' | 'connecting' | 'connected';

type CodexDeviceCode = {
    verificationUri: string;
    userCode: string;
    expiresInSeconds?: number;
};

export function CodexScreen(props: CodexScreenProps) {
    const [prompt, setPrompt] = useState('');
    const [threadId, setThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [syncedCourseContents, setSyncedCourseContents] = useState<
        Record<number, MoodleCourseSection[]>
    >({});
    const [authState, setAuthState] = useState<CodexAuthState>(
        'checking',
    );
    const [needsPairing, setNeedsPairing] = useState(false);
    const [pairing, setPairing] = useState<CodexPairing | null>(null);
    const [moodleAgentConnected, setMoodleAgentConnected] = useState(false);
    const [deviceCode, setDeviceCode] = useState<CodexDeviceCode | null>(null);
    const [busy, setBusy] = useState(false);
    const [globalError, setGlobalError] = useState('');

    const scrollViewRef = useRef<ScrollView>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 150);
        return () => clearTimeout(timer);
    }, [messages]);

    useEffect(() => {
        let cancelled = false;
        void refreshCodexStatus()
            .then((status) => {
                if (cancelled) {
                    return;
                }
                setNeedsPairing(status.paired === false);
                setAuthState(status.authenticated ? 'connected' : 'missing');
                setMoodleAgentConnected(status.moodleConnected === true);
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }
                setAuthState('missing');
                setGlobalError(
                    error instanceof Error
                        ? error.message
                        : 'Unable to check Codex authentication.',
                );
            });

        return () => {
            cancelled = true;
        };
    }, [props.connection]);

    useEffect(() => {
        if (!pairing) {
            return;
        }

        let cancelled = false;
        const timer = setInterval(() => {
            void claimCodexPairing(pairing)
                .then(async (result) => {
                    if (cancelled || result.status === 'pending') {
                        return;
                    }
                    if (result.status === 'expired') {
                        setAuthState('missing');
                        setNeedsPairing(true);
                        setPairing(null);
                        setGlobalError('The pairing code expired. Start pairing again.');
                        return;
                    }

                    setPairing(null);
                    setNeedsPairing(false);
                    setGlobalError('');
                    const status = await refreshCodexStatus();
                    if (!cancelled) {
                        setAuthState(status.authenticated ? 'connected' : 'missing');
                        setMoodleAgentConnected(status.moodleConnected === true);
                    }
                })
                .catch((error) => {
                    if (!cancelled) {
                        setGlobalError(
                            error instanceof Error
                                ? error.message
                                : 'Could not finish pairing.',
                        );
                    }
                });
        }, 2000);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [pairing, props.connection]);

    async function refreshCodexStatus() {
        const status = await getCodexAuthStatus();
        if (status.paired === false) {
            return status;
        }
        if (props.connection && Platform.OS !== 'web') {
            setAuthState('syncing');
            await syncMoodleSessionToCodex(props.connection);
            return getCodexAuthStatus();
        }
        return status;
    }

    async function connectCodex() {
        if (authState === 'connecting' || authState === 'pairing') {
            return;
        }

        if (needsPairing) {
            await beginPairing();
            return;
        }

        setAuthState('connecting');
        setDeviceCode(null);
        setGlobalError('');

        try {
            const result = await startCodexAuth(handleAuthEvent);
            setAuthState(result.authenticated ? 'connected' : 'missing');
            if (!result.authenticated) {
                setGlobalError(
                    result.detail ||
                        'Codex is not authenticated yet. Start the ChatGPT sign-in again.',
                );
            }
        } catch (error) {
            setAuthState('missing');
            setGlobalError(
                error instanceof Error
                    ? error.message
                    : 'Codex authentication failed.',
            );
        }
    }

    async function beginPairing() {
        setAuthState('pairing');
        setDeviceCode(null);
        setPairing(null);
        setGlobalError('');

        try {
            const nextPairing = await startCodexPairing();
            setPairing(nextPairing);
            setNeedsPairing(true);
        } catch (error) {
            setAuthState('missing');
            setGlobalError(
                error instanceof Error
                    ? error.message
                    : 'Could not start Codex device pairing.',
            );
        }
    }

    function handleAuthEvent(event: CodexAuthEvent) {
        if (event.type === 'device_code') {
            setDeviceCode({
                verificationUri: event.verificationUri,
                userCode: event.userCode,
                expiresInSeconds: event.expiresInSeconds,
            });
            return;
        }

        if (event.type === 'completed') {
            setAuthState('connected');
            setDeviceCode(null);
            setGlobalError('');
            return;
        }

        setAuthState('missing');
        setGlobalError(event.error);
    }

    async function runPrompt() {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
            return;
        }

        if (authState !== 'connected') {
            setGlobalError(
                needsPairing
                    ? 'Pair this app with the VPS first.'
                    : 'Connect ChatGPT first. Codex will not run until the sandbox is signed in with your ChatGPT subscription.',
            );
            return;
        }

        setBusy(true);
        setGlobalError('');

        const userMsgId = `u-${Date.now()}`;
        const codexMsgId = `c-${Date.now()}`;

        setMessages((current) => [
            ...current,
            { id: userMsgId, role: 'user', text: trimmedPrompt },
            { id: codexMsgId, role: 'codex', text: '', tools: [] },
        ]);

        setPrompt('');

        try {
            const moodleContext = await buildMoodleContext({
                ...props,
                courseContentsById: {
                    ...props.courseContentsById,
                    ...syncedCourseContents,
                },
            }, {
                prompt: trimmedPrompt,
                loadMissingCourseContents: true,
            });

            const nextResult = await streamCodexTask(
                {
                    prompt: trimmedPrompt,
                    threadId,
                    moodleContext,
                    messages: messages.map((message) => ({
                        role: message.role === 'codex' ? 'assistant' : 'user',
                        text: message.text,
                    })),
                },
                (event: CodexStreamEvent) => {
                    if (event.type === 'thread') {
                        setThreadId(event.threadId);
                        return;
                    }

                    if (event.type === 'message') {
                        setMessages((current) => current.map(m =>
                            m.id === codexMsgId ? { ...m, text: event.text } : m
                        ));
                        return;
                    }

                    if (event.type === 'tool') {
                        setMessages((current) => current.map(m => {
                            if (m.id === codexMsgId) {
                                const existing = m.tools || [];
                                const filtered = existing.filter(t => t.title !== event.title);
                                return {
                                    ...m,
                                    tools: [...filtered, { title: event.title, status: event.status }].slice(-4)
                                };
                            }
                            return m;
                        }));
                    }
                }
            );
            setThreadId(nextResult.threadId);
            await applyCodexActions(nextResult.actions ?? [], props);
        } catch (error) {
            setMessages((current) => current.map(m =>
                m.id === codexMsgId ? {
                    ...m,
                    isError: true,
                    text: error instanceof Error ? error.message : 'Codex could not complete the request.'
                } : m
            ));
        } finally {
            setBusy(false);
        }
    }

    const codexReady = authState === 'connected';
    const composerDisabled = busy || !codexReady || !moodleAgentConnected;
    const connectButtonLabel =
        authState === 'checking'
            ? 'Checking...'
            : authState === 'syncing'
              ? 'Syncing...'
              : authState === 'pairing'
                ? 'Pairing...'
            : authState === 'connecting'
              ? 'Waiting...'
              : codexReady
                ? 'Connected'
                : needsPairing
                  ? 'Pair VPS'
                  : 'Connect ChatGPT';

    return (
        <ScreenSection>
            <View style={styles.codexRoot}>
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.codexChatScroll}
                    contentContainerStyle={styles.codexChatContent}
                    keyboardShouldPersistTaps="handled">

                    <View style={styles.codexStatusBar}>
                        <View style={styles.codexHeaderRow}>
                            <View style={styles.codexIcon}>
                                <Bot color={palette.blue} size={21} />
                            </View>
                            <View style={styles.brandCopy}>
                                <Text style={styles.codexStatusTitle}>
                                    codex.moodle
                                </Text>
                                <Text style={styles.codexStatusBody}>
                                    The scoped VPS agent uses its own encrypted
                                    Moodle session. This phone sends the current app
                                    context while you work.
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Connect ChatGPT for Codex"
                            disabled={codexReady || authState === 'checking' || authState === 'syncing' || authState === 'pairing' || authState === 'connecting'}
                            onPress={() => void connectCodex()}
                            style={({ pressed }) => [
                                styles.codexAuthButton,
                                codexReady && styles.codexAuthButtonReady,
                                pressed && styles.pressed,
                                (authState === 'checking' ||
                                    authState === 'connecting' ||
                                    authState === 'pairing') &&
                                    styles.buttonDisabled,
                                authState === 'syncing' &&
                                    styles.buttonDisabled,
                            ]}>
                            <Link2
                                color={codexReady ? palette.green : palette.ink}
                                size={17}
                            />
                            <Text
                                numberOfLines={1}
                                style={[
                                    styles.codexAuthButtonText,
                                    codexReady && styles.codexAuthButtonTextReady,
                                ]}>
                                {connectButtonLabel}
                            </Text>
                        </Pressable>
                    </View>

                    {deviceCode ? (
                        <View style={styles.codexAuthCard}>
                            <Text style={styles.codexAuthCardTitle}>
                                Finish ChatGPT sign-in
                            </Text>
                            <Text style={styles.codexAuthCardBody}>
                                Open the Codex login page and enter this code:
                            </Text>
                            <Text selectable style={styles.codexDeviceCode}>
                                {deviceCode.userCode}
                            </Text>
                            <Pressable
                                accessibilityRole="link"
                                accessibilityLabel="Open ChatGPT login"
                                onPress={() =>
                                    void Linking.openURL(
                                        deviceCode.verificationUri,
                                    )
                                }
                                style={({ pressed }) => [
                                    styles.codexAuthLinkButton,
                                    pressed && styles.pressed,
                                ]}>
                                <Text style={styles.codexAuthLinkButtonText}>
                                    Open ChatGPT login
                                </Text>
                            </Pressable>
                        </View>
                    ) : null}

                    {pairing ? (
                        <View style={styles.codexAuthCard}>
                            <Text style={styles.codexAuthCardTitle}>
                                Pair this phone with the VPS
                            </Text>
                            <Text style={styles.codexAuthCardBody}>
                                Run this once on the VPS. The app will finish
                                pairing automatically.
                            </Text>
                            <Text selectable style={styles.codexDeviceCode}>
                                {pairing.userCode}
                            </Text>
                            {pairing.approveCommand ? (
                                <Text selectable style={styles.codexAuthCardBody}>
                                    {pairing.approveCommand}
                                </Text>
                            ) : null}
                        </View>
                    ) : null}

                    {!moodleAgentConnected && props.connection ? (
                        <Card>
                            <Text style={styles.heroLabel}>
                                Moodle session pending
                            </Text>
                            <Text style={styles.cardBody}>
                                The phone is sending the current Moodle login to
                                codex.moodle. Try again when the status is
                                connected.
                            </Text>
                        </Card>
                    ) : null}

                    {messages.length === 0 ? (
                        <View style={styles.codexEmptyTranscriptPlain}>
                            <Text style={styles.codexEmptyTitle}>
                                Ask Codex about Moodle.
                            </Text>
                            <Text style={styles.codexEmptyBody}>
                                It can list your courses, inspect course files,
                                and open Moodle content in this app.
                            </Text>
                        </View>
                    ) : null}

                    {globalError ? (
                        <Card>
                            <Text style={styles.heroLabel}>Codex error</Text>
                            <Text style={styles.errorText}>
                                {globalError}
                            </Text>
                        </Card>
                    ) : null}

                    {messages.map((m) => (
                        <View key={m.id} style={styles.chatMessageRow}>
                            {m.role === 'user' ? (
                                <View style={styles.codexUserBubble}>
                                    <Text style={styles.codexUserBubbleText}>
                                        {m.text}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.codexAssistantRow}>
                                    <View style={styles.codexAssistantAvatar}>
                                        <Bot color={palette.blue} size={16} />
                                    </View>
                                    <View style={styles.codexAssistantContent}>
                                        {m.tools && m.tools.length > 0 ? (
                                            <View style={styles.codexToolStrip}>
                                                {m.tools.map((event) => (
                                                    <View
                                                        key={event.title}
                                                        style={styles.codexToolChip}>
                                                        <Text style={styles.codexToolChipText}>
                                                            {event.status === 'running'
                                                                ? 'Streaming...'
                                                                : event.status}
                                                            {' · '}
                                                            {event.title}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : null}

                                        {m.isError ? (
                                            <View style={styles.codexErrorBubble}>
                                                <Text style={styles.codexErrorText}>
                                                    {m.text}
                                                </Text>
                                            </View>
                                        ) : m.text ? (
                                            <View style={styles.codexAssistantBubble}>
                                                <Text style={styles.codexResponseText}>
                                                    {m.text}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={styles.codexAssistantBubbleEmpty}>
                                                <Text style={styles.codexResponseTextMuted}>
                                                    Thinking...
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            )}
                        </View>
                    ))}
                    <View style={styles.codexScrollPadding} />
                </ScrollView>

                <View
                    style={[
                        styles.codexComposerDock,
                        Platform.OS === 'web' && styles.codexComposerDockWeb,
                    ]}>
                    <TextField
                        value={prompt}
                        onChangeText={setPrompt}
                        placeholder={
                            codexReady
                                ? moodleAgentConnected
                                    ? 'Message Codex'
                                    : 'Syncing Moodle'
                                : 'Connect ChatGPT'
                        }
                        multiline
                        style={styles.codexPromptInput}
                        editable={!composerDisabled}
                    />
                    <View style={styles.codexComposerActions}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Run Codex"
                            onPress={() => void runPrompt()}
                            disabled={composerDisabled || !prompt.trim()}
                            style={({ pressed }) => [
                                styles.codexSendButton,
                                Platform.OS === 'web' &&
                                    styles.codexSendButtonWeb,
                                pressed && styles.pressed,
                                (composerDisabled || !prompt.trim()) &&
                                    styles.buttonDisabled,
                            ]}>
                            <SendHorizontal color={palette.ink} size={22} />
                        </Pressable>
                    </View>
                </View>
            </View>
        </ScreenSection>
    );
}
