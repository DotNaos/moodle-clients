import type { MoodleCodexAction } from '../codex';
import type { CodexScreenProps } from './CodexScreen';

export function getSearchTokens(value: string): string[] {
    return value
        .toLowerCase()
        .split(/[^a-z0-9äöüß]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
        .filter(
            (token) =>
                ![
                    'course',
                    'courses',
                    'kurs',
                    'kurse',
                    'zeige',
                    'list',
                    'what',
                    'which',
                    'about',
                    'moodle',
                ].includes(token),
        );
}

export async function applyCodexActions(
    actions: MoodleCodexAction[],
    props: CodexScreenProps,
): Promise<void> {
    for (const action of actions) {
        if (action.type === 'navigate_tab') {
            props.onNavigateTab(action.view);
            continue;
        }

        if (action.type === 'show_profile') {
            props.onNavigateTab('profile');
            continue;
        }

        if (action.type === 'open_course') {
            const courseId = parseCourseId(action.courseId);
            if (courseId) {
                await props.onOpenCourse(courseId);
            }
            continue;
        }

        if (action.type === 'load_course_contents') {
            const courseId = parseCourseId(action.courseId);
            if (courseId) {
                await props.onLoadCourseContents(courseId);
            }
            continue;
        }

        if (action.type === 'open_pdf') {
            const courseId = parseCourseId(action.courseId);
            if (courseId) {
                await props.onOpenResource(
                    courseId,
                    action.resourceId,
                    action.filename,
                );
            }
        }
    }
}

function parseCourseId(value: string): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
