import { describe, expect, test } from 'bun:test';

import type { CalendarEvent } from '../src/calendar';
import { eventMatchesCourse, findEventCourse } from '../src/courseMatching';
import type { MoodleCourse } from '../src/moodle';

describe('course matching', () => {
    test('matches short two-word course names without the Moodle suffix', () => {
        expect(
            eventMatchesCourse(
                calendarEvent('Deep Learning'),
                moodleCourse(22585, 'Deep Learning (cds-108) FS26'),
            ),
        ).toBe(true);
    });

    test('matches the banking course by acronym', () => {
        expect(
            eventMatchesCourse(
                calendarEvent('DSIB Vorlesung'),
                moodleCourse(
                    22577,
                    'Data Science und Informatik bei Banken (cds-305) FS26',
                ),
            ),
        ).toBe(true);
    });

    test('matches the banking course by English wording', () => {
        expect(
            eventMatchesCourse(
                calendarEvent('Data Science and Informatics in Banking'),
                moodleCourse(
                    22577,
                    'Data Science und Informatik bei Banken (cds-305) FS26',
                ),
            ),
        ).toBe(true);
    });

    test('uses course codes as a strong signal', () => {
        const courses = [
            moodleCourse(22583, 'Algorithmen des wissenschaftlichen Rechnens (cds-116) FS26'),
            moodleCourse(22577, 'Data Science und Informatik bei Banken (cds-305) FS26'),
        ];

        expect(findEventCourse(calendarEvent('CDS-305 Prüfung'), courses)?.id).toBe(22577);
    });
});

function moodleCourse(id: number, fullName: string): MoodleCourse {
    return {
        id,
        fullName,
        shortName: fullName.match(/\(([^)]+)\)/)?.[1] ?? 'FS26',
        categoryName: 'FS26',
        visible: 1,
    };
}

function calendarEvent(title: string): CalendarEvent {
    return {
        uid: title,
        title,
        startsAt: '2026-05-15T09:15:00.000Z',
        endsAt: '2026-05-15T10:45:00.000Z',
        location: null,
        description: null,
        allDay: false,
    };
}
