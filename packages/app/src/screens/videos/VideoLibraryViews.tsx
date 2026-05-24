import { useMemo } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';

import { CourseArtwork } from '../../components/CourseArtwork';
import { EmptyState, PrimaryButton, SecondaryButton } from '../../components/ui';
import { ChevronLeft, Play, RefreshCw, Video } from '../../icons';
import type { ReplayCourse, ReplayRecording } from '../../replay';
import { formatReplayDate } from '../../replay';
import { replayStyles } from '../../replayStyles';
import { palette, styles } from '../../styles';
import type { CourseRecordingState } from './types';

export function Hero(props: {
    readonly course: ReplayCourse | null;
    readonly state: CourseRecordingState | null;
    readonly onOpenCourse: (course: ReplayCourse) => void;
    readonly onRefresh: () => void;
}) {
    const episodes = props.state?.recordings.length ?? 0;
    const loading = props.state?.loading ?? false;

    return (
        <View style={replayStyles.hero}>
            <CourseArtwork
                imageUrl={props.course?.imageUrl}
                title={props.course?.title ?? 'FS26 recordings'}
                fallbackLabel="FS26"
                style={replayStyles.heroArtwork}
                imageStyle={replayStyles.heroImage}
                fallbackTextStyle={replayStyles.heroFallbackText}
            />
            <View style={replayStyles.heroShade} />
            <View style={replayStyles.heroBottomShade} />
            <Text style={replayStyles.brand}>Study Replay</Text>
            <Text style={replayStyles.kicker}>Series</Text>
            <Text style={replayStyles.heroTitle} numberOfLines={4}>
                {props.course?.title ?? 'FS26 recordings'}
            </Text>
            <Text style={replayStyles.heroMeta}>
                FS26 · {loading ? 'Scanning recordings' : `${episodes} episodes`}
            </Text>
            <View style={replayStyles.heroActions}>
                <Pressable
                    disabled={!props.course}
                    accessibilityRole="button"
                    accessibilityLabel={
                        props.course
                            ? `Open highlighted recordings for ${props.course.title}`
                            : 'Open recordings'
                    }
                    style={replayStyles.heroButton}
                    onPress={() => props.course && props.onOpenCourse(props.course)}>
                    <Play color={palette.ink} size={18} />
                    <Text style={replayStyles.heroButtonText}>View Episodes</Text>
                </Pressable>
                <SecondaryButton
                    label="Refresh"
                    icon={RefreshCw}
                    fullWidth={false}
                    onPress={props.onRefresh}
                    disabled={!props.course || loading}
                />
            </View>
        </View>
    );
}

export function CourseTile(props: {
    readonly course: ReplayCourse;
    readonly state?: CourseRecordingState;
    readonly onPress: () => void;
}) {
    const loading = props.state?.loading ?? false;
    const episodes = props.state?.recordings.length ?? 0;
    const error = props.state?.error;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open course recordings for ${props.course.title}`}
            style={replayStyles.courseTile}
            onPress={props.onPress}>
            <CourseArtwork
                imageUrl={props.course.imageUrl}
                title={props.course.title}
                fallbackLabel="FS26"
                style={replayStyles.courseBanner}
                fallbackTextStyle={replayStyles.courseBannerFallback}
            />
            <View style={replayStyles.courseBody}>
                <Text style={replayStyles.courseTitle} numberOfLines={3}>
                    {props.course.title}
                </Text>
                <Text
                    style={[
                        replayStyles.courseMeta,
                        error ? replayStyles.courseError : null,
                    ]}
                    numberOfLines={2}>
                    {loading
                        ? 'Scanning...'
                        : error
                          ? 'Needs Webex session'
                          : `${episodes} episodes`}
                </Text>
            </View>
        </Pressable>
    );
}

export function CourseEpisodes(props: {
    readonly course: ReplayCourse;
    readonly state?: CourseRecordingState;
    readonly onBack: () => void;
    readonly onPlay: (recording: ReplayRecording) => void;
    readonly onRetry: () => void;
}) {
    const loading = props.state?.loading ?? false;
    const recordings = props.state?.recordings ?? [];

    return (
        <View style={replayStyles.screen}>
            <SafeAreaView>
                <View style={replayStyles.detailHeader}>
                    <View style={replayStyles.detailTopRow}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Back to video courses"
                            style={replayStyles.roundButton}
                            onPress={props.onBack}>
                            <ChevronLeft color={palette.text} size={24} />
                        </Pressable>
                        <Text style={replayStyles.detailTitle} numberOfLines={3}>
                            {props.course.title}
                        </Text>
                    </View>
                    <Text style={replayStyles.heroMeta}>
                        FS26 · {loading ? 'Scanning recordings' : `${recordings.length} episodes`}
                    </Text>
                </View>
            </SafeAreaView>
            {loading ? (
                <View style={styles.loadingPanel}>
                    <ActivityIndicator color={palette.text} />
                </View>
            ) : null}
            {!loading && recordings.length === 0 ? (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <EmptyState
                        title="No playable recordings yet"
                        body={
                            props.state?.error ||
                            'Open retry once a course-local Webex session is available.'
                        }
                        actionLabel="Retry"
                        onPress={props.onRetry}
                    />
                </ScrollView>
            ) : null}
            {recordings.length > 0 ? (
                <FlatList
                    data={recordings}
                    keyExtractor={(item) => item.recordingUuid}
                    contentContainerStyle={replayStyles.episodeList}
                    ListFooterComponent={<View style={replayStyles.episodeListFooter} />}
                    renderItem={({ item }) => (
                        <EpisodeRow recording={item} onPress={() => props.onPlay(item)} />
                    )}
                />
            ) : null}
        </View>
    );
}

function EpisodeRow(props: {
    readonly recording: ReplayRecording;
    readonly onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={formatEpisodeAccessibilityLabel(props.recording)}
            accessibilityHint="Opens the recording player"
            style={replayStyles.episode}
            onPress={props.onPress}>
            <View
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={replayStyles.episodeThumb}>
                <EpisodePreview recording={props.recording} />
            </View>
            <View style={replayStyles.episodeBody}>
                <Text style={replayStyles.episodeTitle} numberOfLines={1}>
                    {formatReplayDate(props.recording.recordingDate)}
                </Text>
                <Text style={replayStyles.episodeMeta} numberOfLines={2}>
                    {props.recording.sessionTitle}
                </Text>
                <View style={replayStyles.playPill}>
                    <Play color={palette.ink} size={13} />
                    <Text style={replayStyles.playText}>Play</Text>
                </View>
            </View>
        </Pressable>
    );
}

function formatEpisodeAccessibilityLabel(recording: ReplayRecording) {
    return `Play recording from ${formatReplayDate(recording.recordingDate)}, ${recording.sessionTitle}`;
}

function EpisodePreview(props: { readonly recording: ReplayRecording }) {
    if (props.recording.coverUrl) {
        return (
            <Image
                source={{ uri: props.recording.coverUrl }}
                resizeMode="cover"
                style={replayStyles.episodeThumbMedia}
                accessible={false}
            />
        );
    }
    return (
        <View style={replayStyles.episodeThumbFallback}>
            <Video color={palette.blue} size={24} />
        </View>
    );
}

export function ReplayPlayer(props: {
    readonly recording: ReplayRecording | null;
    readonly onClose: () => void;
}) {
    const source = useMemo<VideoSource | null>(
        () =>
            props.recording?.streamUrl
                ? { uri: props.recording.streamUrl, useCaching: false }
                : null,
        [props.recording?.streamUrl],
    );
    const player = useVideoPlayer(source, (instance) => {
        instance.play();
    });

    return (
        <Modal
            animationType="slide"
            visible={props.recording !== null}
            onRequestClose={props.onClose}>
            <SafeAreaView style={replayStyles.modal}>
                <View style={replayStyles.playerHeader}>
                    <View style={replayStyles.playerTitleWrap}>
                        <Text style={replayStyles.playerTitle}>
                            {props.recording
                                ? formatReplayDate(props.recording.recordingDate)
                                : 'Recording'}
                        </Text>
                        <Text style={replayStyles.playerSubtitle} numberOfLines={1}>
                            {props.recording?.courseName ?? ''}
                        </Text>
                    </View>
                    <PrimaryButton
                        label="Close"
                        fullWidth={false}
                        onPress={props.onClose}
                    />
                </View>
                {source ? (
                    <VideoView
                        player={player}
                        style={replayStyles.playerVideo}
                        fullscreenOptions={{ enable: true }}
                        allowsPictureInPicture
                        nativeControls
                        contentFit="contain"
                    />
                ) : (
                    <EmptyState
                        title="Stream unavailable"
                        body="This recording did not expose a playable stream URL."
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
}
