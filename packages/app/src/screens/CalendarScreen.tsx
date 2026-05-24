import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
    fetchCalendarEvents,
    formatCalendarDateRange,
    upcomingCalendarEvents,
    type CalendarEvent,
} from '../calendar';
import {
    EmptyState,
    PrimaryButton,
    ScreenSection,
    SecondaryButton,
    TextField,
} from '../components/ui';
import { findEventCourse } from '../courseMatching';
import { CalendarDays, ChevronRight, RefreshCw } from '../icons';
import type { MoodleCourse } from '../moodle';
import { loadCalendarUrl, storeCalendarUrl } from '../storage';
import { palette, styles } from '../styles';

type CalendarScreenProps = {
    readonly courses: MoodleCourse[];
    readonly onOpenCourse: (courseId: number) => void;
};

export function CalendarScreen(props: CalendarScreenProps) {
    const [calendarUrl, setCalendarUrl] = useState('');
    const [savedUrl, setSavedUrl] = useState('');
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        let mounted = true;
        void loadCalendarUrl()
            .then((storedUrl) => {
                if (!mounted) {
                    return;
                }
                if (!storedUrl) {
                    setLoading(false);
                    return;
                }
                setCalendarUrl(storedUrl);
                setSavedUrl(storedUrl);
                return loadEvents(storedUrl);
            })
            .catch((error) => {
                if (mounted) {
                    setErrorMessage(getMessage(error));
                    setLoading(false);
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    const upcomingEvents = useMemo(
        () => upcomingCalendarEvents(events).slice(0, 80),
        [events],
    );
    const changed = calendarUrl.trim() !== savedUrl.trim();

    async function loadEvents(url = savedUrl) {
        const nextUrl = url.trim();
        if (!nextUrl) {
            setEvents([]);
            setErrorMessage('');
            setLoading(false);
            return;
        }

        setLoading(true);
        setErrorMessage('');
        try {
            const nextEvents = await fetchCalendarEvents(nextUrl);
            setEvents(nextEvents);
        } catch (error) {
            setEvents([]);
            setErrorMessage(getMessage(error));
        } finally {
            setLoading(false);
        }
    }

    async function saveAndReload() {
        const nextUrl = calendarUrl.trim();
        if (!isLikelyCalendarUrl(nextUrl)) {
            setErrorMessage('Enter a valid calendar URL.');
            return;
        }

        setSaving(true);
        setErrorMessage('');
        try {
            await storeCalendarUrl(nextUrl);
            setSavedUrl(nextUrl);
            await loadEvents(nextUrl);
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            <ScreenSection>
                <View style={styles.calendarHero}>
                    <View style={styles.calendarHeroIcon}>
                        <CalendarDays color={palette.blue} size={24} />
                    </View>
                    <View style={styles.brandCopy}>
                        <Text style={styles.heroLabel}>Schedule</Text>
                        <Text style={styles.heroTitle}>FHGR Calendar</Text>
                        <Text style={styles.heroBody}>
                            Paste your personal FHGR ICS link. The URL stays on
                            this device and the app reads the calendar directly.
                        </Text>
                    </View>
                </View>

                <View style={styles.calendarSettings}>
                    <TextField
                        value={calendarUrl}
                        onChangeText={setCalendarUrl}
                        autoCapitalize="none"
                        keyboardType="url"
                        placeholder="https://my.fhgr.ch/ics/.../basic.ics"
                        returnKeyType="done"
                    />
                    <View style={styles.actionRow}>
                        <PrimaryButton
                            label={saving ? 'Saving...' : 'Save calendar'}
                            onPress={saveAndReload}
                            disabled={saving || loading || !changed}
                            fullWidth={false}
                        />
                        <SecondaryButton
                            label={loading ? 'Refreshing...' : 'Refresh'}
                            icon={RefreshCw}
                            onPress={() => loadEvents()}
                            disabled={loading || saving}
                            fullWidth={false}
                        />
                    </View>
                </View>

                {errorMessage ? (
                    <EmptyState
                        title="Calendar unavailable"
                        body={errorMessage}
                        actionLabel="Retry"
                        onPress={() => loadEvents()}
                    />
                ) : null}

                {loading ? (
                    <View style={styles.calendarLoading}>
                        <ActivityIndicator color={palette.text} />
                        <Text style={styles.cardBody}>Loading calendar...</Text>
                    </View>
                ) : null}

                {!loading && !errorMessage && !savedUrl ? (
                    <EmptyState
                        title="No calendar connected"
                        body="Add your personal FHGR calendar link to show your schedule here."
                    />
                ) : null}

                {!loading &&
                !errorMessage &&
                savedUrl &&
                upcomingEvents.length === 0 ? (
                    <EmptyState
                        title="No upcoming events"
                        body="The calendar loaded, but it has no upcoming entries."
                        actionLabel="Refresh"
                        onPress={() => loadEvents()}
                    />
                ) : null}

                {!loading && upcomingEvents.length > 0 ? (
                    <View style={styles.calendarList}>
                        <Text style={styles.groupTitle}>Upcoming</Text>
                        {upcomingEvents.map((event) => (
                            <CalendarEventRow
                                key={event.uid}
                                event={event}
                                course={findEventCourse(event, props.courses)}
                                onOpenCourse={props.onOpenCourse}
                            />
                        ))}
                    </View>
                ) : null}
            </ScreenSection>
        </ScrollView>
    );
}

function CalendarEventRow(props: {
    readonly event: CalendarEvent;
    readonly course: MoodleCourse | null;
    readonly onOpenCourse: (courseId: number) => void;
}) {
    return (
        <Pressable
            style={({ pressed }) => [
                styles.calendarEventRow,
                pressed && styles.pressed,
            ]}
            disabled={!props.course}
            onPress={() => {
                if (props.course) {
                    props.onOpenCourse(props.course.id);
                }
            }}
            accessibilityLabel={
                props.course
                    ? `Open course for ${props.event.title}`
                    : props.event.title
            }
            accessibilityRole="button">
            <View style={styles.calendarDateBlock}>
                <Text style={styles.calendarDateDay}>
                    {dayLabel(props.event.startsAt)}
                </Text>
                <Text style={styles.calendarDateMonth}>
                    {monthLabel(props.event.startsAt)}
                </Text>
            </View>
            <View style={styles.calendarEventBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                    {props.event.title}
                </Text>
                <Text style={styles.rowSubtitle}>
                    {formatCalendarDateRange(props.event)}
                </Text>
                {props.event.location ? (
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                        {props.event.location}
                    </Text>
                ) : null}
                {props.course ? (
                    <Text style={styles.calendarCourseHint} numberOfLines={1}>
                        {props.course.fullName}
                    </Text>
                ) : null}
            </View>
            {props.course ? (
                <ChevronRight color={palette.red} size={22} />
            ) : null}
        </Pressable>
    );
}

function dayLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '--';
    }
    return new Intl.DateTimeFormat('de-CH', { day: '2-digit' }).format(date);
}

function monthLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return new Intl.DateTimeFormat('de-CH', { month: 'short' })
        .format(date)
        .replace('.', '');
}

function isLikelyCalendarUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol);
    } catch {
        return false;
    }
}

function getMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'The calendar could not be loaded.';
}
