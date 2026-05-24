import {
    fetchCalendarEvents,
    type CalendarEvent,
} from './calendar';
import { eventMatchesCourse, textMatchesCourse } from './courseMatching';
import type { ReplayCourse, ReplayRecording } from './replay';

const RECORDING_EVENT_TOLERANCE_MS = 30 * 60 * 1000;

export async function filterRecordingsByCourseCalendar(
    course: ReplayCourse,
    recordings: readonly ReplayRecording[],
): Promise<ReplayRecording[]> {
    if (recordings.length === 0) {
        return [];
    }

    const { loadCalendarUrl } = await import('./storage');
    const calendarUrl = await loadCalendarUrl();
    if (!calendarUrl) {
        const matchedBySource = recordings.filter((recording) =>
            recordingMatchesCourseSource(recording, course),
        );
        logReplayFilter('calendar-missing', course, recordings, [], matchedBySource);
        return matchedBySource;
    }

    const events = await fetchCalendarEvents(calendarUrl);
    return filterRecordingsByCourseEvents(course, recordings, events);
}

export function filterRecordingsByCourseEvents(
    course: ReplayCourse,
    recordings: readonly ReplayRecording[],
    events: readonly CalendarEvent[],
): ReplayRecording[] {
    const courseEvents = events.filter((event) => eventMatchesCourse(event, course.source));
    const matchedBySource = recordings.filter((recording) =>
        recordingMatchesCourseSource(recording, course),
    );
    if (courseEvents.length === 0) {
        logReplayFilter('calendar-course-events-missing', course, recordings, courseEvents, matchedBySource);
        return matchedBySource;
    }

    const filtered = recordings.filter((recording) =>
        recordingMatchesCourseSource(recording, course) ||
        courseEvents.some((event) => recordingMatchesEvent(recording, event)),
    );
    logReplayFilter('calendar-filtered', course, recordings, courseEvents, filtered);
    return filtered;
}

function recordingMatchesCourseSource(recording: ReplayRecording, course: ReplayCourse): boolean {
    if (recording.sourceCourseId && recording.sourceCourseId === String(course.id)) {
        return true;
    }

    return Boolean(
        recording.sourceCourseName && textMatchesCourse(recording.sourceCourseName, course.source),
    );
}

function recordingMatchesEvent(recording: ReplayRecording, event: CalendarEvent): boolean {
    const recordingTime = recordingTimestamp(recording);
    const eventStart = new Date(event.startsAt);
    const eventEnd = event.endsAt ? new Date(event.endsAt) : eventStart;
    if (
        Number.isNaN(recordingTime.date.getTime()) ||
        Number.isNaN(eventStart.getTime()) ||
        Number.isNaN(eventEnd.getTime())
    ) {
        return false;
    }

    if (!sameLocalDay(recordingTime.date, eventStart)) {
        return false;
    }

    if (!recordingTime.hasTime) {
        return true;
    }

    const timestamp = recordingTime.date.getTime();
    return (
        timestamp >= eventStart.getTime() - RECORDING_EVENT_TOLERANCE_MS &&
        timestamp <= eventEnd.getTime() + RECORDING_EVENT_TOLERANCE_MS
    );
}

function recordingTimestamp(recording: ReplayRecording): { date: Date; hasTime: boolean } {
    const compact = [
        recording.recordingName,
        recording.sessionTitle,
        recording.recordingDate,
    ]
        .join(' ')
        .match(/(\d{4})(\d{2})(\d{2})[\s_-]?(\d{2})(\d{2})/);
    if (compact?.[1] && compact[2] && compact[3] && compact[4] && compact[5]) {
        return {
            date: new Date(
                Number(compact[1]),
                Number(compact[2]) - 1,
                Number(compact[3]),
                Number(compact[4]),
                Number(compact[5]),
            ),
            hasTime: true,
        };
    }

    return {
        date: new Date(`${recording.recordingDate}T12:00:00`),
        hasTime: false,
    };
}

function sameLocalDay(left: Date, right: Date): boolean {
    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    );
}

function logReplayFilter(
    stage: string,
    course: ReplayCourse,
    raw: readonly ReplayRecording[],
    courseEvents: readonly CalendarEvent[],
    filtered: readonly ReplayRecording[],
) {
    void import('./debug')
        .then(({ logDevInfo }) =>
            logDevInfo('Replay recording filter', {
                stage,
                courseId: course.id,
                courseTitle: course.title,
                rawCount: raw.length,
                courseEventCount: courseEvents.length,
                filteredCount: filtered.length,
                eventSamples: courseEvents.slice(0, 3).map((event) => event.title),
                recordingSamples: raw.slice(0, 3).map((recording) => ({
                    date: recording.recordingDate,
                    name: recording.recordingName,
                    sourceCourseId: recording.sourceCourseId ?? '',
                    sourceCourseName: recording.sourceCourseName ?? '',
                    matchedSource: recordingMatchesCourseSource(recording, course),
                    matchedEvent: courseEvents.some((event) => recordingMatchesEvent(recording, event)),
                })),
            }),
        )
        .catch(() => undefined);
}
