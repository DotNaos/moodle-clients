import type { MoodleCodexContext } from '../codex';
import { getCourseContents, type MoodleCourseSection } from '../moodle';
import { getSearchTokens } from './codexScreenActions';
import type { CodexScreenProps } from './CodexScreen';

type BuildMoodleContextOptions = Readonly<{
    prompt?: string;
    loadMissingCourseContents?: boolean;
}>;

export async function buildMoodleContext(
    props: CodexScreenProps,
    options: BuildMoodleContextOptions = {},
): Promise<MoodleCodexContext | null> {
    if (!props.connection) {
        return null;
    }

    const courseContentsById = options.loadMissingCourseContents
        ? await ensureRelevantCourseContents(props, options.prompt ?? '')
        : props.courseContentsById;

    return {
        source: 'moodle-mobile-api',
        siteUrl: props.connection.moodleSiteUrl,
        userId: props.connection.moodleUserId,
        activeView: props.activeView,
        selectedCourseId: props.selectedCourseId,
        courses: props.courses.map((course) => ({
            id: course.id,
            fullName: course.fullName,
            shortName: course.shortName,
            categoryName: course.categoryName,
        })),
        courseContents: Object.entries(courseContentsById).map(
            ([courseId, sections]) => {
                const numericCourseId = Number(courseId);
                const course = props.courses.find(
                    (candidate) => candidate.id === numericCourseId,
                );
                return {
                    courseId: numericCourseId,
                    courseName: course?.fullName ?? `Course ${courseId}`,
                    sections: sections.map((section) => ({
                        name: section.name,
                        modules: section.modules.map((module) => ({
                            id: module.id,
                            name: module.name,
                            type: module.modname ?? '',
                            files: module.contents.map((file) => ({
                                filename: file.filename,
                                mimeType: file.mimeType,
                                fileSize: file.fileSize,
                                resourceId: file.fileUrl,
                            })),
                        })),
                    })),
                };
            },
        ),
    };
}

async function ensureRelevantCourseContents(
    props: CodexScreenProps,
    prompt: string,
): Promise<Record<number, MoodleCourseSection[]>> {
    if (!props.connection || props.courses.length === 0) {
        return props.courseContentsById;
    }

    const promptTokens = getSearchTokens(prompt);
    const matchingCourses = promptTokens.length > 0
        ? props.courses.filter((course) =>
              promptTokens.some((token) =>
                  `${course.fullName} ${course.shortName}`
                      .toLowerCase()
                      .includes(token),
              ),
          )
        : [];
    const candidateCourses =
        matchingCourses.length > 0 ? matchingCourses : props.courses.slice(0, 4);
    const coursesToLoad = candidateCourses
        .filter((course) => !props.courseContentsById[course.id])
        .slice(0, 4);

    if (coursesToLoad.length === 0) {
        return props.courseContentsById;
    }

    const loadedPairs = await Promise.all(
        coursesToLoad.map(async (course) => {
            try {
                return [
                    course.id,
                    await getCourseContents(props.connection!, course.id),
                ] as const;
            } catch {
                return [course.id, []] as const;
            }
        }),
    );

    return {
        ...props.courseContentsById,
        ...Object.fromEntries(loadedPairs),
    };
}
