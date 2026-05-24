import { describe, expect, test } from 'bun:test';

import type { CalendarEvent } from '../src/calendar';
import { filterRecordingsByCourseEvents } from '../src/replayCalendarFilter';
import type { ReplayCourse, ReplayRecording } from '../src/replay';

describe('Replay calendar filtering', () => {
    test('keeps only recordings whose timestamp matches the selected course event', () => {
        const course = replayCourse(22583, 'Algorithmen des wissenschaftlichen Rechnens (cds-116) FS26');
        const recordings = [
            replayRecording('algo', 'Vorlesung-20260515 1038-1', '2026-05-15'),
            replayRecording('deep', 'Vorlesung-20260515 1338-1', '2026-05-15'),
        ];
        const events = [
            calendarEvent('Algorithmen des wissenschaftlichen Rechnens', '2026-05-15T09:15:00', '2026-05-15T10:45:00'),
            calendarEvent('Deep Learning', '2026-05-15T13:30:00', '2026-05-15T15:00:00'),
        ];

        expect(filterRecordingsByCourseEvents(course, recordings, events).map((item) => item.recordingUuid)).toEqual(['algo']);
    });

    test('does not assign recordings to unrelated courses on the same date', () => {
        const course = replayCourse(22585, 'Deep Learning (cds-108) FS26');
        const recordings = [
            replayRecording('algo', 'Vorlesung-20260515 1038-1', '2026-05-15'),
        ];
        const events = [
            calendarEvent('Deep Learning', '2026-05-15T13:30:00', '2026-05-15T15:00:00'),
        ];

        expect(filterRecordingsByCourseEvents(course, recordings, events)).toEqual([]);
    });

    test('keeps banking recordings when Webex reports the Moodle course id', () => {
        const course = replayCourse(22577, 'Data Science und Informatik bei Banken (cds-305) FS26');
        const recordings = [
            replayRecording('banking', 'Vorlesung-20260515 1238-1', '2026-05-15', {
                sourceCourseId: '22577',
                sourceCourseName: 'Data Science and Informatics in Banking',
            }),
            replayRecording('algo', 'Vorlesung-20260515 1038-1', '2026-05-15', {
                sourceCourseId: '22583',
                sourceCourseName: 'Algorithmen des wissenschaftlichen Rechnens',
            }),
        ];

        expect(filterRecordingsByCourseEvents(course, recordings, [])).toEqual([recordings[0]]);
    });

    test('matches banking calendar events by acronym', () => {
        const course = replayCourse(22577, 'Data Science und Informatik bei Banken (cds-305) FS26');
        const recordings = [
            replayRecording('banking', 'Vorlesung-20260515 1038-1', '2026-05-15'),
        ];
        const events = [
            calendarEvent('DSIB Vorlesung', '2026-05-15T09:15:00', '2026-05-15T10:45:00'),
        ];

        expect(filterRecordingsByCourseEvents(course, recordings, events)).toEqual(recordings);
    });
});

function replayCourse(id: number, name: string): ReplayCourse {
    return {
        id,
        term: 'FS26',
        title: name.replace(/\s*\([^)]*\)\s*FS26$/, ''),
        subtitle: 'FS26',
        imageUrl: null,
        source: {
            id,
            fullName: name,
            shortName: 'FS26',
            categoryName: 'FS26',
            visible: 1,
        },
    };
}

function replayRecording(
    recordingUuid: string,
    recordingName: string,
    recordingDate: string,
    source: Partial<Pick<ReplayRecording, 'sourceCourseId' | 'sourceCourseName'>> = {},
): ReplayRecording {
    return {
        recordingDate,
        recordingName,
        streamUrl: `https://example.com/${recordingUuid}.m3u8`,
        sourceUrl: null,
        recordingUuid,
        coverUrl: null,
        sessionTitle: 'Vorlesung',
        durationSeconds: 3600,
        courseId: 22583,
        courseName: 'Course',
        term: 'FS26',
        ...source,
    };
}

function calendarEvent(
    title: string,
    startsAt: string,
    endsAt: string,
): CalendarEvent {
    return {
        uid: title,
        title,
        startsAt,
        endsAt,
        location: null,
        description: null,
        allDay: false,
    };
}
