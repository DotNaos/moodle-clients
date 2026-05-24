import { describe, expect, test } from 'bun:test';

import {
    formatCalendarDateRange,
    parseCalendar,
    upcomingCalendarEvents,
} from '../src/calendar';

describe('calendar ICS parsing', () => {
    test('parses folded text, date ranges, and locations', () => {
        const events = parseCalendar(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:one
SUMMARY:Algorithmen des wissenschaftlichen Rechnens
DTSTART:20260521T081500Z
DTEND:20260521T100000Z
LOCATION:FHGR Raum 1
DESCRIPTION:Line one\\nline two
END:VEVENT
BEGIN:VEVENT
UID:two
SUMMARY:Long folded 
 title
DTSTART;VALUE=DATE:20260522
DTEND;VALUE=DATE:20260523
END:VEVENT
END:VCALENDAR`);

        expect(events).toHaveLength(2);
        expect(events[0]?.title).toBe(
            'Algorithmen des wissenschaftlichen Rechnens',
        );
        expect(events[0]?.location).toBe('FHGR Raum 1');
        expect(events[0]?.description).toBe('Line one\nline two');
        expect(events[1]?.title).toBe('Long folded title');
        expect(events[1]?.allDay).toBe(true);
        expect(formatCalendarDateRange(events[0]!)).toContain('21. Mai');
    });

    test('keeps today and future events', () => {
        const events = parseCalendar(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:past
SUMMARY:Past
DTSTART:20260520T081500Z
DTEND:20260520T100000Z
END:VEVENT
BEGIN:VEVENT
UID:future
SUMMARY:Future
DTSTART:20260521T081500Z
DTEND:20260521T100000Z
END:VEVENT
END:VCALENDAR`);

        const upcoming = upcomingCalendarEvents(
            events,
            new Date('2026-05-21T12:00:00+02:00'),
        );

        expect(upcoming.map((event) => event.uid)).toEqual(['future']);
    });
});
