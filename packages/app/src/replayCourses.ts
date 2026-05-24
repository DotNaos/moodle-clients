import type { MoodleCourse } from './moodle';
import { isFS26Course, sanitizeReplayCourseName } from './replayHelpers';
import type { ReplayCourse } from './replayTypes';

export function getFS26ReplayCourses(courses: MoodleCourse[]): ReplayCourse[] {
    return courses
        .filter(isFS26Course)
        .map((course) => ({
            id: course.id,
            term: 'FS26',
            title: sanitizeReplayCourseName(course.fullName || course.shortName),
            subtitle: course.shortName,
            imageUrl: course.courseImage ?? null,
            source: course,
        }))
        .sort((left, right) => left.title.localeCompare(right.title, 'de-CH'));
}
