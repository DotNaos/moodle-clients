import { Linking } from 'react-native';
import type { Dispatch, SetStateAction } from 'react';

import {
    getAuthenticatedFileUrl,
    getCourseContents,
    type MoodleConnection,
    type MoodleCourseFile,
    type MoodleCourseSection,
} from './moodle';
import type { AppView } from './types';

type PdfPreview = {
    title: string;
    url: string;
};

type CodexAppActionsOptions = Readonly<{
    connection: MoodleConnection | null;
    courseContentsById: Record<number, MoodleCourseSection[]>;
    setActiveView: Dispatch<SetStateAction<AppView>>;
    setSelectedCourseId: Dispatch<SetStateAction<number | null>>;
    setCourseContentsById: Dispatch<
        SetStateAction<Record<number, MoodleCourseSection[]>>
    >;
    setPdfPreview: Dispatch<SetStateAction<PdfPreview | null>>;
    loadCourseContents: (
        connection: MoodleConnection,
        courseId: number,
    ) => Promise<void>;
}>;

export function createCodexAppActions(options: CodexAppActionsOptions) {
    return {
        openMoodleFile: (file: MoodleCourseFile) => {
            if (!options.connection) {
                return;
            }
            openMoodleFile(options.connection, file, options.setPdfPreview);
        },
        openCourseFromCodex: async (courseId: number) => {
            options.setActiveView('courses');
            options.setSelectedCourseId(courseId);
            if (options.connection && !options.courseContentsById[courseId]) {
                await options.loadCourseContents(options.connection, courseId);
            }
        },
        loadCourseContentsFromCodex: async (courseId: number) => {
            if (options.connection && !options.courseContentsById[courseId]) {
                await options.loadCourseContents(options.connection, courseId);
            }
        },
        openResourceFromCodex: async (
            courseId: number,
            resourceId?: string | null,
            filename?: string | null,
        ) => {
            if (!options.connection) {
                return;
            }

            options.setActiveView('courses');
            options.setSelectedCourseId(courseId);

            const sections = await getLoadedOrFetchSections(options, courseId);
            const match = findCourseFile(sections, resourceId, filename);
            if (match) {
                openMoodleFile(
                    options.connection,
                    match,
                    options.setPdfPreview,
                );
            }
        },
    };
}

function openMoodleFile(
    connection: MoodleConnection,
    file: MoodleCourseFile,
    setPdfPreview: Dispatch<SetStateAction<PdfPreview | null>>,
): void {
    const url = getAuthenticatedFileUrl(connection, file.fileUrl);
    if (
        file.mimeType === 'application/pdf' ||
        file.filename.toLowerCase().endsWith('.pdf')
    ) {
        setPdfPreview({
            title: file.filename,
            url,
        });
        return;
    }

    void Linking.openURL(url);
}

async function getLoadedOrFetchSections(
    options: CodexAppActionsOptions,
    courseId: number,
): Promise<MoodleCourseSection[]> {
    const loaded = options.courseContentsById[courseId];
    if (loaded) {
        return loaded;
    }
    if (!options.connection) {
        return [];
    }

    const sections = await getCourseContents(options.connection, courseId);
    options.setCourseContentsById((current) => ({
        ...current,
        [courseId]: sections,
    }));
    return sections;
}

function findCourseFile(
    sections: MoodleCourseSection[],
    resourceId?: string | null,
    filename?: string | null,
): MoodleCourseFile | null {
    const normalizedFilename = filename?.trim().toLowerCase() ?? '';
    return sections
        .flatMap((section) => section.modules)
        .flatMap((module) => module.contents)
        .find((file) => {
            if (resourceId && file.fileUrl === resourceId) {
                return true;
            }
            if (
                normalizedFilename &&
                file.filename.toLowerCase() === normalizedFilename
            ) {
                return true;
            }
            return (
                !resourceId &&
                !normalizedFilename &&
                (file.mimeType === 'application/pdf' ||
                    file.filename.toLowerCase().endsWith('.pdf'))
            );
        }) ?? null;
}
