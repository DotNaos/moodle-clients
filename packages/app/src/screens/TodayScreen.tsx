import { View } from 'react-native';

import {
    ActionRow,
    Card,
    CourseRow,
    EmptyState,
    HeroPanel,
    MetricTile,
    PrimaryButton,
    ScreenSection,
    SecondaryButton,
    SectionHeader,
} from '../components/ui';
import { compactUrl } from '../format';
import { BookOpen, RefreshCw, ScanLine } from '../icons';
import type { MoodleConnection, MoodleCourse, MoodleSiteInfo } from '../moodle';
import { styles } from '../styles';

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
    const recentCoursesContent = connected ? (
        recentCourses.length > 0 ? (
            <Card>
                {recentCourses.map((course) => (
                    <CourseRow
                        key={course.id}
                        course={course}
                        onPress={props.onOpenCourses}
                    />
                ))}
            </Card>
        ) : (
            <EmptyState
                title="No courses loaded yet"
                body="Refresh Moodle to load the course list."
                actionLabel="Refresh Moodle"
                onPress={props.onRefresh}
            />
        )
    ) : null;

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
                <SectionHeader kicker="Quick access" title="Recent courses" />
            ) : null}

            {recentCoursesContent}
        </ScreenSection>
    );
}
