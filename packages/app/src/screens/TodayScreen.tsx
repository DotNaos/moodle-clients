import { Image, Pressable, Text, View } from 'react-native';

import {
    ActionRow,
    EmptyState,
    HeroPanel,
    MetricTile,
    PrimaryButton,
    ScreenSection,
    SecondaryButton,
} from '../components/ui';
import { compactUrl, sanitizeCourseName } from '../format';
import { BookOpen, ChevronRight, RefreshCw, ScanLine } from '../icons';
import type { MoodleConnection, MoodleCourse, MoodleSiteInfo } from '../moodle';
import { palette, styles } from '../styles';

type TodayScreenProps = {
    readonly connection: MoodleConnection | null;
    readonly siteInfo: MoodleSiteInfo | null;
    readonly courses: MoodleCourse[];
    readonly loading: boolean;
    readonly onRefresh: () => void;
    readonly onOpenConnect: () => void;
    readonly onOpenCourses: () => void;
};

export function TodayScreen(props: TodayScreenProps) {
    const connected = props.connection !== null;
    const recentCourses = props.courses.slice(0, 3);
    const destinationLabel =
        props.siteInfo?.siteName ??
        compactUrl(props.connection?.moodleSiteUrl ?? '');

    let recentCoursesContent = null;
    if (connected) {
        if (recentCourses.length > 0) {
            recentCoursesContent = (
                <View style={styles.courseListOuter}>
                    <View style={styles.plainList}>
                        {recentCourses.map((course) => (
                            <Pressable
                                key={course.id}
                                onPress={props.onOpenCourses}
                                style={({ pressed }) => [
                                    styles.courseListRowPlain,
                                    pressed
                                        ? [styles.pressed, { opacity: 0.8 }]
                                        : null,
                                ]}>
                                <View style={styles.courseImagePreview}>
                                    {course.courseImage ? (
                                        <Image
                                            source={{ uri: course.courseImage }}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                            }}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <Text style={styles.courseAvatarText}>
                                            {course.shortName
                                                .slice(0, 2)
                                                .toUpperCase()}
                                        </Text>
                                    )}
                                </View>
                                <View style={styles.courseListRowContent}>
                                    <Text
                                        style={styles.rowTitle}
                                        numberOfLines={2}>
                                        {sanitizeCourseName(course.fullName)}
                                    </Text>
                                </View>
                                <ChevronRight
                                    color={palette.subtle}
                                    size={18}
                                />
                            </Pressable>
                        ))}
                    </View>
                </View>
            );
        } else {
            recentCoursesContent = (
                <EmptyState
                    title="No courses loaded yet"
                    body="Refresh Moodle to load the course list."
                    actionLabel="Refresh Moodle"
                    onPress={props.onRefresh}
                />
            );
        }
    }

    return (
        <ScreenSection>
            <HeroPanel
                kicker={connected ? 'Ready to study' : 'Setup needed'}
                title={connected ? 'Moodle is connected.' : 'Connect Moodle'}
                body={
                    connected
                        ? `Signed in to ${destinationLabel}.`
                        : 'Scan the Moodle Mobile QR code once. The session stays local.'
                }
                ready={connected}>
                <ActionRow>
                    {connected ? (
                        <>
                            <PrimaryButton
                                label="Courses"
                                icon={BookOpen}
                                onPress={props.onOpenCourses}
                            />
                            <SecondaryButton
                                label="Refresh"
                                icon={RefreshCw}
                                onPress={props.onRefresh}
                            />
                        </>
                    ) : (
                        <PrimaryButton
                            label="Connect"
                            icon={ScanLine}
                            onPress={props.onOpenConnect}
                        />
                    )}
                </ActionRow>
            </HeroPanel>

            {connected ? (
                <View style={styles.metricGrid}>
                    <MetricTile
                        label="Courses"
                        value={String(props.courses.length)}
                        loading={props.loading}
                        hint="Loaded from Moodle"
                    />
                    <MetricTile
                        label="Session"
                        value="Ready"
                        hint="Stored locally"
                    />
                </View>
            ) : null}

            {connected ? (
                <Text style={styles.groupTitlePlain}>Recent courses</Text>
            ) : null}

            {recentCoursesContent}
        </ScreenSection>
    );
}
