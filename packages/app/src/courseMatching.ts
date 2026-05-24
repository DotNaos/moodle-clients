import type { CalendarEvent } from './calendar';
import type { MoodleCourse } from './moodle';

const COURSE_MATCH_THRESHOLD = 24;
const STOP_WORDS = new Set([
    'and',
    'bei',
    'der',
    'des',
    'die',
    'for',
    'im',
    'in',
    'of',
    'the',
    'und',
]);

export function findEventCourse(
    event: CalendarEvent,
    courses: readonly MoodleCourse[],
): MoodleCourse | null {
    const eventKey = normalizeSearchText(event.title);
    const eventTokens = new Set(contentWords(event.title));
    const eventCodeTokens = new Set(courseCodeTokens(event.title));
    let best: { course: MoodleCourse; score: number } | null = null;

    for (const course of courses) {
        const fullName = normalizeSearchText(course.fullName);
        const shortName = normalizeSearchText(course.shortName);
        const acronym = acronymFor(course.fullName);
        const contentKey = contentWords(`${course.fullName} ${course.shortName}`).join(' ');
        const eventContentKey = [...eventTokens].join(' ');
        const courseCodeTokens = new Set(
            courseCodesFor(course).flatMap((value) => [value.compact, value.prefix, value.number]),
        );
        let score = 0;

        if (fullName && eventKey.includes(fullName)) {
            score += 100;
        }
        if (shortName && eventKey.includes(shortName)) {
            score += 70;
        }
        if (
            contentKey &&
            eventContentKey &&
            (eventContentKey.includes(contentKey) || contentKey.includes(eventContentKey))
        ) {
            score += 100;
        }
        if (acronym && eventTokens.has(acronym)) {
            score += 60;
        }

        if ([...courseCodeTokens].some((token) => eventCodeTokens.has(token))) {
            score += 90;
        }

        const courseTokens = contentWords(`${course.fullName} ${course.shortName}`);
        for (const token of courseTokens) {
            if (eventTokens.has(token)) {
                score += 8;
            }
        }

        if (!best || score > best.score) {
            best = { course, score };
        }
    }

    return best && best.score >= COURSE_MATCH_THRESHOLD ? best.course : null;
}

export function eventMatchesCourse(event: CalendarEvent, course: MoodleCourse): boolean {
    return findEventCourse(event, [course])?.id === course.id;
}

export function textMatchesCourse(text: string, course: MoodleCourse): boolean {
    return eventMatchesCourse(
        {
            uid: text,
            title: text,
            startsAt: new Date(0).toISOString(),
            endsAt: null,
            location: null,
            description: null,
            allDay: false,
        },
        course,
    );
}

function acronymFor(value: string): string {
    return contentWords(value)
        .map((word) => word[0])
        .join('');
}

function isCourseCodeWord(word: string): boolean {
    return (
        /^(cds|dsc|dbm|wpm|fs|hs)$/.test(word) ||
        /^(fs|hs)\d{2}$/.test(word) ||
        /^\d+$/.test(word) ||
        /^[a-z]+_\d+$/.test(word)
    );
}

function contentWords(value: string): string[] {
    return normalizeSearchText(value)
        .split(' ')
        .filter(
            (word) =>
                word.length > 1 &&
                !STOP_WORDS.has(word) &&
                !isCourseCodeWord(word),
        );
}

function courseCodesFor(course: MoodleCourse): Array<{
    readonly compact: string;
    readonly prefix: string;
    readonly number: string;
}> {
    return courseCodeTokens(`${course.fullName} ${course.shortName}`).map((compact) => {
        const match = compact.match(/^([a-z]+)(\d+)$/);
        return {
            compact,
            prefix: match?.[1] ?? compact,
            number: match?.[2] ?? '',
        };
    });
}

function courseCodeTokens(value: string): string[] {
    const source = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const tokens: string[] = [];
    for (const match of source.matchAll(/\b(cds|dbm|dsc|wpm)[\s_-]*(\d{2,4})\b/g)) {
        tokens.push(`${match[1]}${match[2]}`);
    }
    return tokens;
}

function normalizeSearchText(value: string): string {
    const normalized = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&amp;|&/g, ' und ')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .toLowerCase()
        .trim();
    return normalized
        .split(' ')
        .map(normalizeWord)
        .join(' ')
        .trim();
}

function normalizeWord(word: string): string {
    switch (word) {
        case 'bank':
        case 'banking':
        case 'banks':
            return 'banken';
        case 'informatics':
            return 'informatik';
        default:
            return word;
    }
}
