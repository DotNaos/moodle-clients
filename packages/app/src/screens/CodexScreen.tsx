import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Card, ScreenSection, TextField } from '../components/ui';
import {
    getDefaultLocalCodexBaseUrl,
    streamCodexTask,
    type MoodleCodexContext,
    type CodexRunResponse,
    type CodexStreamEvent,
} from '../codex';
import { Bot, SendHorizontal } from '../icons';
import type {
    MoodleConnection,
    MoodleCourse,
    MoodleCourseSection,
} from '../moodle';
import { getCourseContents } from '../moodle';
import { palette, styles } from '../styles';

type CodexScreenProps = Readonly<{
    connection: MoodleConnection | null;
    courses: MoodleCourse[];
    courseContentsById: Record<number, MoodleCourseSection[]>;
}>;

export function CodexScreen(props: CodexScreenProps) {
    const [prompt, setPrompt] = useState(
        'Summarize what I should check before the next Moodle client release.',
    );
    const [localBaseUrl, setLocalBaseUrl] = useState(
        getDefaultLocalCodexBaseUrl(),
    );
    const [threadId, setThreadId] = useState<string | null>(null);
    const [result, setResult] = useState<CodexRunResponse | null>(null);
    const [streamedText, setStreamedText] = useState('');
    const [submittedPrompt, setSubmittedPrompt] = useState('');
    const [toolEvents, setToolEvents] = useState<
        Array<{ title: string; status: string }>
    >([]);
    const [syncedCourseContents, setSyncedCourseContents] = useState<
        Record<number, MoodleCourseSection[]>
    >({});
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    async function runPrompt() {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
            setErrorMessage('Enter a prompt for Codex first.');
            return;
        }

        setBusy(true);
        setErrorMessage('');
        setResult(null);
        setStreamedText('');
        setSubmittedPrompt(trimmedPrompt);
        setToolEvents([]);

        try {
            const moodleContext = await buildMoodleContext({
                ...props,
                courseContentsById: {
                    ...props.courseContentsById,
                    ...syncedCourseContents,
                },
            });
            const nextResult = await streamCodexTask(
                {
                    prompt: trimmedPrompt,
                    threadId,
                    moodleContext,
                },
                localBaseUrl,
                handleStreamEvent,
            );
            setResult(nextResult);
            setThreadId(nextResult.threadId);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'Codex could not complete the request.',
            );
        } finally {
            setBusy(false);
        }
    }

    function handleStreamEvent(event: CodexStreamEvent) {
        if (event.type === 'thread') {
            setThreadId(event.threadId);
            return;
        }

        if (event.type === 'message') {
            setStreamedText(event.text);
            return;
        }

        if (event.type === 'tool') {
            setToolEvents((current) => {
                const next = current.filter(
                    (item) => item.title !== event.title,
                );
                return [
                    ...next,
                    { title: event.title, status: event.status },
                ].slice(-4);
            });
        }
    }

    const visibleResponse = streamedText || result?.finalResponse || '';

    return (
        <ScreenSection>
            <View style={styles.codexRoot}>
                <ScrollView
                    style={styles.codexChatScroll}
                    contentContainerStyle={styles.codexChatContent}
                    keyboardShouldPersistTaps="handled">
                    <View style={styles.codexStatusBar}>
                        <View style={styles.codexIcon}>
                            <Bot color={palette.blue} size={21} />
                        </View>
                        <View style={styles.brandCopy}>
                            <Text style={styles.codexStatusTitle}>
                                Moodle tools ready
                            </Text>
                            <Text style={styles.codexStatusBody}>
                                Courses and loaded course files come directly
                                from the Moodle mobile API on this device.
                            </Text>
                        </View>
                    </View>

                    {Platform.OS !== 'web' ? (
                        <Card>
                            <Text style={styles.heroLabel}>
                                Local Codex URL
                            </Text>
                            <TextField
                                value={localBaseUrl}
                                onChangeText={setLocalBaseUrl}
                                placeholder="http://127.0.0.1:17333"
                            />
                        </Card>
                    ) : null}

                    {submittedPrompt ? (
                        <View style={styles.codexUserBubble}>
                            <Text style={styles.codexUserBubbleText}>
                                {submittedPrompt}
                            </Text>
                        </View>
                    ) : null}

                    {toolEvents.length > 0 ? (
                        <View style={styles.codexToolStrip}>
                            {toolEvents.map((event) => (
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

                    {visibleResponse ? (
                        <View style={styles.codexTranscriptPlain}>
                            <Text style={styles.codexResponseText}>
                                {visibleResponse}
                            </Text>
                            {result?.threadId ? (
                                <Text style={styles.metricHint}>
                                    Thread: {result.threadId}
                                </Text>
                            ) : null}
                        </View>
                    ) : (
                        <View style={styles.codexEmptyTranscriptPlain}>
                            <Text style={styles.codexEmptyTitle}>
                                Ask Codex about Moodle.
                            </Text>
                            <Text style={styles.codexEmptyBody}>
                                It can list your courses, inspect course files,
                                and use loaded Moodle file metadata without a
                                server-side Moodle CLI.
                            </Text>
                        </View>
                    )}

                    {errorMessage ? (
                        <Card>
                            <Text style={styles.heroLabel}>Codex error</Text>
                            <Text style={styles.errorText}>
                                {errorMessage}
                            </Text>
                        </Card>
                    ) : null}
                </ScrollView>

                <View
                    style={[
                        styles.codexComposerDock,
                        Platform.OS === 'web' && styles.codexComposerDockWeb,
                    ]}>
                    <TextField
                        value={prompt}
                        onChangeText={setPrompt}
                        placeholder="Ask anything"
                        multiline
                        style={styles.codexPromptInput}
                    />
                    <View style={styles.codexComposerActions}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Run Codex"
                            onPress={() => void runPrompt()}
                            disabled={busy}
                            style={({ pressed }) => [
                                styles.codexSendButton,
                                Platform.OS === 'web' &&
                                    styles.codexSendButtonWeb,
                                pressed && styles.pressed,
                                busy && styles.buttonDisabled,
                            ]}>
                            <SendHorizontal color={palette.ink} size={22} />
                        </Pressable>
                    </View>
                </View>
            </View>
        </ScreenSection>
    );
}

async function buildMoodleContext(
    props: CodexScreenProps,
): Promise<MoodleCodexContext | null> {
    if (!props.connection) {
        return null;
    }

    const courseContentsById = await ensureRelevantCourseContents(props);

    return {
        source: 'moodle-mobile-api',
        siteUrl: props.connection.moodleSiteUrl,
        userId: props.connection.moodleUserId,
        courses: props.courses.map((course) => ({
            id: course.id,
            fullName: course.fullName,
            shortName: course.shortName,
            categoryName: course.categoryName,
        })),
        courseContents: Object.entries(courseContentsById).map(
            ([courseId, sections]) => {
                const numericCourseId = Number(courseId);
                const course = props.courses.find(
                    (candidate) => candidate.id === numericCourseId,
                );
                return {
                    courseId: numericCourseId,
                    courseName: course?.fullName ?? `Course ${courseId}`,
                    sections: sections.map((section) => ({
                        name: section.name,
                        modules: section.modules.map((module) => ({
                            name: module.name,
                            type: module.modname ?? '',
                            files: module.contents.map((file) => ({
                                filename: file.filename,
                                mimeType: file.mimeType,
                                fileSize: file.fileSize,
                            })),
                        })),
                    })),
                };
            },
        ),
    };
}

async function ensureRelevantCourseContents(
    props: CodexScreenProps,
): Promise<Record<number, MoodleCourseSection[]>> {
    if (!props.connection || props.courses.length === 0) {
        return props.courseContentsById;
    }

    const coursesToLoad = props.courses
        .filter((course) => !props.courseContentsById[course.id])
        .slice(0, 8);

    if (coursesToLoad.length === 0) {
        return props.courseContentsById;
    }

    const loadedPairs = await Promise.all(
        coursesToLoad.map(async (course) => {
            try {
                return [
                    course.id,
                    await getCourseContents(props.connection!, course.id),
                ] as const;
            } catch {
                return [course.id, []] as const;
            }
        }),
    );

    return {
        ...props.courseContentsById,
        ...Object.fromEntries(loadedPairs),
    };
}
