import { useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    ScrollView,
    Text,
    View,
} from 'react-native';

import { EmptyState } from '../components/ui';
import { logDevInfo } from '../debug';
import {
    getFS26ReplayCourses,
    loadReplayRecordings,
    recordingsFromWebexBridge,
    WebexBridgeRequiredError,
    type ReplayCourse,
    type ReplayRecording,
} from '../replay';
import { filterRecordingsByCourseCalendar } from '../replayCalendarFilter';
import { replayStyles } from '../replayStyles';
import { palette, styles } from '../styles';
import { CourseEpisodes, CourseTile, Hero, ReplayPlayer } from './videos/VideoLibraryViews';
import { WebexBridge } from './videos/WebexBridgeModal';
import type {
    ActiveWebexBridgeRequest,
    ActiveWebexBridgeResult,
    CourseRecordingState,
    VideosScreenProps,
} from './videos/types';

export function VideosScreen(props: VideosScreenProps) {
    const replayCourses = useMemo(
        () => getFS26ReplayCourses(props.courses),
        [props.courses],
    );
    const [recordingsByCourse, setRecordingsByCourse] = useState<
        Record<number, CourseRecordingState>
    >({});
    const [selectedCourseId, setSelectedCourseId] = useState<number | null>(
        null,
    );
    const [selectedRecording, setSelectedRecording] =
        useState<ReplayRecording | null>(null);
    const [bridgeRequest, setBridgeRequest] =
        useState<ActiveWebexBridgeRequest | null>(null);
    const nextLoadIdRef = useRef(1);
    const latestLoadIdByCourseRef = useRef<Record<number, number>>({});
    const retainedRecordingsByLoadIdRef = useRef<Record<number, ReplayRecording[]>>({});
    const selectedCourse =
        replayCourses.find((course) => course.id === selectedCourseId) ?? null;
    const heroCourse =
        replayCourses.find((course) => course.imageUrl) ??
        replayCourses[0] ??
        null;

    async function ensureRecordings(
        course: ReplayCourse,
        force = false,
        allowBridge = false,
        includeWebexLti = allowBridge,
    ) {
        if (!props.connection) {
            return;
        }
        const current = recordingsByCourse[course.id];
        if (!force && (current?.loading || current?.recordings.length)) {
            logDevInfo('Videos recordings load skipped by screen cache', {
                courseId: course.id,
                courseTitle: course.title,
                hasRecordings: Boolean(current?.recordings.length),
                hasError: Boolean(current?.error),
                loading: Boolean(current?.loading),
            });
            return;
        }

        const retainedRecordings = force ? [] : current?.recordings ?? [];
        const loadId = nextLoadIdRef.current;
        nextLoadIdRef.current += 1;
        latestLoadIdByCourseRef.current[course.id] = loadId;
        retainedRecordingsByLoadIdRef.current[loadId] = retainedRecordings;
        setCourseLoading(course.id, retainedRecordings);

        try {
            const recordings = await loadReplayRecordings(props.connection, course, {
                includeWebexLti,
                refresh: force,
            });
            finishCourseLoad(course.id, loadId, recordings, '');
        } catch (error) {
            handleRecordingLoadError({
                course,
                error,
                loadId,
                retainedRecordings,
                allowBridge,
            });
        }
    }

    function setCourseLoading(courseId: number, recordings: ReplayRecording[]) {
        setRecordingsByCourse((state) => ({
            ...state,
            [courseId]: { loading: true, recordings, error: '' },
        }));
    }

    function finishCourseLoad(
        courseId: number,
        loadId: number,
        recordings: ReplayRecording[],
        error: string,
    ) {
        delete retainedRecordingsByLoadIdRef.current[loadId];
        if (!isLatestCourseLoad(courseId, loadId)) {
            return;
        }
        setRecordingsByCourse((state) => ({
            ...state,
            [courseId]: { loading: false, recordings, error },
        }));
    }

    function handleRecordingLoadError(input: {
        readonly course: ReplayCourse;
        readonly error: unknown;
        readonly loadId: number;
        readonly retainedRecordings: ReplayRecording[];
        readonly allowBridge: boolean;
    }) {
        if (input.error instanceof WebexBridgeRequiredError) {
            if (input.allowBridge) {
                setBridgeRequest({ ...input.error.bridgeRequest, loadId: input.loadId });
            } else {
                delete retainedRecordingsByLoadIdRef.current[input.loadId];
            }
            finishCourseLoad(
                input.course.id,
                input.loadId,
                input.retainedRecordings,
                input.allowBridge
                    ? 'Webex needs a browser session. Sign in in the WebView to load recordings.'
                    : 'Open the course to connect Webex.',
            );
            return;
        }

        finishCourseLoad(
            input.course.id,
            input.loadId,
            input.retainedRecordings,
            input.error instanceof Error
                ? input.error.message
                : 'Recordings could not be loaded.',
        );
    }

    function openCourse(course: ReplayCourse) {
        logDevInfo('Videos course opened', {
            courseId: course.id,
            courseTitle: course.title,
        });
        setSelectedCourseId(course.id);
        setBridgeRequest(null);
        void ensureRecordings(course, false, true);
    }

    async function completeWebexBridge(result: ActiveWebexBridgeResult) {
        const course = replayCourses.find((candidate) => candidate.id === result.courseId);
        if (!course) {
            setBridgeRequest(null);
            return;
        }
        if (
            typeof result.loadId === 'number' &&
            !isLatestCourseLoad(result.courseId, result.loadId)
        ) {
            return;
        }

        const rawRecordings = recordingsFromWebexBridge(course, result);
        const recordings = await filterRecordingsByCourseCalendar(course, rawRecordings);
        logDevInfo('Videos Webex bridge completed', {
            courseId: course.id,
            courseTitle: course.title,
            rawCount: rawRecordings.length,
            count: recordings.length,
            rawSamples: rawRecordings.slice(0, 3).map((recording) => ({
                date: recording.recordingDate,
                name: recording.recordingName,
                sourceCourseId: recording.sourceCourseId ?? '',
                sourceCourseName: recording.sourceCourseName ?? '',
            })),
        });
        if (typeof result.loadId === 'number') {
            delete retainedRecordingsByLoadIdRef.current[result.loadId];
        }
        setRecordingsByCourse((state) => ({
            ...state,
            [course.id]: {
                loading: false,
                recordings,
                error: recordings.length ? '' : 'Webex returned no playable recordings.',
            },
        }));
        setBridgeRequest(null);
    }

    function failWebexBridge(courseId: number, message: string, loadId?: number) {
        if (typeof loadId === 'number' && !isLatestCourseLoad(courseId, loadId)) {
            return;
        }
        logDevInfo('Videos Webex bridge failed', {
            courseId,
            message,
            hasLoadId: typeof loadId === 'number',
        });
        const retainedRecordings =
            typeof loadId === 'number'
                ? retainedRecordingsByLoadIdRef.current[loadId] ?? []
                : [];
        if (typeof loadId === 'number') {
            delete retainedRecordingsByLoadIdRef.current[loadId];
        }
        setRecordingsByCourse((state) => ({
            ...state,
            [courseId]: {
                loading: false,
                recordings:
                    typeof loadId === 'number'
                        ? retainedRecordings
                        : state[courseId]?.recordings ?? [],
                error: message,
            },
        }));
    }

    function isLatestCourseLoad(courseId: number, loadId: number): boolean {
        return latestLoadIdByCourseRef.current[courseId] === loadId;
    }

    if (!props.connection) {
        return (
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <EmptyState
                    title="Videos are locked"
                    body="Connect Moodle once. Study Replay uses the same local session."
                    actionLabel="Connect Moodle"
                    onPress={props.onOpenConnect}
                />
            </ScrollView>
        );
    }

    if (selectedCourse) {
        return (
            <>
                <CourseEpisodes
                    course={selectedCourse}
                    state={recordingsByCourse[selectedCourse.id]}
                    onBack={() => setSelectedCourseId(null)}
                    onPlay={setSelectedRecording}
                    onRetry={() => void ensureRecordings(selectedCourse, true, true)}
                />
                <ReplayPlayer
                    recording={selectedRecording}
                    onClose={() => setSelectedRecording(null)}
                />
                <WebexBridge
                    request={bridgeRequest}
                    onRecordings={completeWebexBridge}
                    onError={failWebexBridge}
                    onClose={() => setBridgeRequest(null)}
                />
            </>
        );
    }

    return (
        <View style={replayStyles.screen}>
            <ScrollView contentContainerStyle={replayStyles.content}>
                <Hero
                    course={heroCourse}
                    state={heroCourse ? recordingsByCourse[heroCourse.id] : null}
                    onOpenCourse={openCourse}
                    onRefresh={() => heroCourse && openCourse(heroCourse)}
                />
                <View style={replayStyles.section}>
                    <Text style={replayStyles.sectionTitle}>FS26</Text>
                    {props.loadingCourses ? (
                        <View style={styles.loadingPanel}>
                            <ActivityIndicator color={palette.text} />
                        </View>
                    ) : null}
                    {!props.loadingCourses && replayCourses.length === 0 ? (
                        <EmptyState
                            title="No FS26 courses"
                            body="Refresh Moodle courses, then return to Videos."
                        />
                    ) : null}
                    <FlatList
                        data={replayCourses}
                        horizontal
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={replayStyles.stripContent}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <CourseTile
                                course={item}
                                state={recordingsByCourse[item.id]}
                                onPress={() => openCourse(item)}
                            />
                        )}
                    />
                </View>
            </ScrollView>
            <ReplayPlayer
                recording={selectedRecording}
                onClose={() => setSelectedRecording(null)}
            />
            <WebexBridge
                request={bridgeRequest}
                onRecordings={completeWebexBridge}
                onError={failWebexBridge}
                onClose={() => setBridgeRequest(null)}
            />
        </View>
    );
}
