import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';

import {
    Card,
    EmptyState,
    ScreenSection,
    SecondaryButton,
} from '../components/ui';
import { stripHtml } from '../format';
import { ChevronLeft, ChevronRight, FileText, RefreshCw } from '../icons';
import type {
    MoodleConnection,
    MoodleCourse,
    MoodleCourseFile,
    MoodleCourseModule,
    MoodleCourseSection,
} from '../moodle';
import { palette, styles } from '../styles';

type CoursesScreenProps = {
    readonly connection: MoodleConnection | null;
    readonly courses: MoodleCourse[];
    readonly sections: MoodleCourseSection[];
    readonly currentCourse: MoodleCourse | null;
    readonly loadingDashboard: boolean;
    readonly loadingCourseId: number | null;
    readonly onRefresh: () => void;
    readonly onOpenConnect: () => void;
    readonly onSelectCourse: (courseId: number) => void;
    readonly onBackToCourses: () => void;
    readonly onOpenFile: (file: MoodleCourseFile) => void;
};

type CourseDetailProps = {
    readonly course: MoodleCourse;
    readonly sections: MoodleCourseSection[];
    readonly loading: boolean;
    readonly onBack: () => void;
    readonly onOpenFile: (file: MoodleCourseFile) => void;
};

type CourseSectionProps = {
    readonly section: MoodleCourseSection;
    readonly index: number;
    readonly onOpenFile: (file: MoodleCourseFile) => void;
};

type ModuleFilesProps = {
    readonly module: MoodleCourseModule;
    readonly onOpenFile: (file: MoodleCourseFile) => void;
};

type CourseListRowProps = {
    readonly course: MoodleCourse;
    readonly onPress: () => void;
};

type FileRowProps = {
    readonly file: MoodleCourseFile;
    readonly onPress: () => void;
};

export function CoursesScreen(props: CoursesScreenProps) {
    const groupedCourses = useMemo(
        () => groupCourses(props.courses),
        [props.courses],
    );

    if (!props.connection) {
        return (
            <ScreenSection>
                <EmptyState
                    title="Courses are locked"
                    body="Connect Moodle first."
                    actionLabel="Connect Moodle"
                    onPress={props.onOpenConnect}
                />
            </ScreenSection>
        );
    }

    if (props.currentCourse) {
        return (
            <CourseDetail
                course={props.currentCourse}
                sections={props.sections}
                loading={props.loadingCourseId === props.currentCourse.id}
                onBack={props.onBackToCourses}
                onOpenFile={props.onOpenFile}
            />
        );
    }

    let coursesContent: React.ReactNode;

    if (props.loadingDashboard) {
        coursesContent = (
            <View style={styles.loadingPanel}>
                <ActivityIndicator color={palette.text} />
            </View>
        );
    } else if (groupedCourses.length > 0) {
// Removes the SectionHeader and double Cards
        coursesContent = (
            <View style={styles.courseListOuter}>
                {groupedCourses.map((group) => (
                    <View key={group.name} style={styles.courseGroup}>
                        <Text style={styles.groupTitlePlain}>{group.name}</Text>
                        <View style={styles.plainList}>
                            {group.courses.map((course) => (
                                <CourseListRow
                                    key={course.id}
                                    course={course}
                                    onPress={() =>
                                        props.onSelectCourse(course.id)
                                    }
                                />
                            ))}
                        </View>
                    </View>
                ))}
            </View>
        );
    } else {
        coursesContent = (
            <EmptyState
                title="No courses"
                body="Refresh Moodle once the session is connected."
            />
        );
    }

    return (
        <ScreenSection>
            <View style={styles.courseTopBar}>
                <Text style={styles.appTitle}>Courses</Text>
                <SecondaryButton
                    label="Refresh"
                    icon={RefreshCw}
                    onPress={props.onRefresh}
                    fullWidth={false}
                />
            </View>
            {coursesContent}
        </ScreenSection>
    );
}

function CourseDetail(props: CourseDetailProps) {
    let detailContent: React.ReactNode;

    if (props.loading) {
        detailContent = (
            <View style={styles.loadingPanel}>
                <ActivityIndicator color={palette.text} />
            </View>
        );
    } else if (props.sections.length > 0) {
        detailContent = (
            <View style={styles.courseList}>
                {props.sections.map((section, index) => (
                    <CourseSection
                        key={`${props.course.id}-${section.id ?? index}`}
                        section={section}
                        index={index}
                        onOpenFile={props.onOpenFile}
                    />
                ))}
            </View>
        );
    } else {
        detailContent = (
            <EmptyState
                title="No content loaded"
                body="Refresh this course or try again later."
            />
        );
    }

    return (
        <ScreenSection>
            <Card>
                <View style={styles.drilldownHeader}>
                    <Pressable
                        onPress={props.onBack}
                        style={({ pressed }) => [
                            styles.backButton,
                            pressed && styles.pressed,
                        ]}>
                        <ChevronLeft color={palette.text} size={20} />
                    </Pressable>
                    <View style={styles.rowText}>
                        <Text style={styles.sectionKicker}>
                            {props.course.categoryName}
                        </Text>
                        <Text style={styles.sectionTitle} numberOfLines={2}>
                            {props.course.fullName}
                        </Text>
                    </View>
                </View>
            </Card>
            {detailContent}
        </ScreenSection>
    );
}

function CourseSection(props: CourseSectionProps) {
    const modulesWithFiles = props.section.modules.filter(
        (module) => module.contents.length > 0,
    );

    return (
        <Card>
            <Text style={styles.rowTitle}>
                {props.section.name || `Section ${props.index + 1}`}
            </Text>
            {props.section.summary ? (
                <Text style={styles.sectionSummary} numberOfLines={3}>
                    {stripHtml(props.section.summary)}
                </Text>
            ) : null}

            {modulesWithFiles.length > 0 ? (
                <View style={styles.fileList}>
                    {modulesWithFiles.map((module, moduleIndex) => (
                        <ModuleFiles
                            key={`${module.id ?? moduleIndex}-${module.name}`}
                            module={module}
                            onOpenFile={props.onOpenFile}
                        />
                    ))}
                </View>
            ) : (
                <Text style={styles.emptyText}>No files in this section.</Text>
            )}
        </Card>
    );
}

function ModuleFiles(props: ModuleFilesProps) {
    return (
        <View style={styles.resourceGroup}>
            <Text style={styles.resourceGroupTitle} numberOfLines={2}>
                {props.module.name}
            </Text>
            {props.module.contents.map((file) => (
                <FileRow
                    key={`${file.fileUrl}-${file.filename}`}
                    file={file}
                    onPress={() => props.onOpenFile(file)}
                />
            ))}
        </View>
    );
}

function CourseListRow(props: CourseListRowProps) {
    return (
        <Pressable
            onPress={props.onPress}
            style={({ pressed }) => [
                styles.courseListRowPlain,
                pressed ? [styles.dimmed, { opacity: 0.8 }] : null,
            ]}>
            <View style={styles.courseImagePreview}>
                {props.course.courseImage ? (
                    <Image 
                        source={{ uri: props.course.courseImage }} 
                        style={{ width: '100%', height: '100%', resizeMode: 'cover' } as any} 
                    />
                ) : (
                    <Text style={styles.courseAvatarText}>
                        {props.course.shortName.slice(0, 2).toUpperCase()}
                    </Text>
                )}
            </View>
            <View style={styles.courseListRowContent}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                    {props.course.fullName}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {props.course.shortName}
                </Text>
            </View>
            <ChevronRight color={palette.subtle} size={18} />
        </Pressable>
    );
}

function FileRow(props: FileRowProps) {
    const isPdf =
        props.file.mimeType === 'application/pdf' ||
        props.file.filename.toLowerCase().endsWith('.pdf');

    return (
        <Pressable
            onPress={props.onPress}
            style={({ pressed }) => [pressed && styles.pressed]}>
            <Card compact raised>
                <View style={styles.fileRow}>
                    <FileText
                        color={isPdf ? palette.red : palette.blue}
                        size={18}
                    />
                    <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={2}>
                            {props.file.filename}
                        </Text>
                        <Text style={styles.rowSubtitle}>
                            {isPdf ? 'PDF' : props.file.mimeType || 'File'}
                        </Text>
                    </View>
                    <ChevronRight color={palette.subtle} size={18} />
                </View>
            </Card>
        </Pressable>
    );
}

function groupCourses(
    courses: MoodleCourse[],
): Array<{ name: string; courses: MoodleCourse[] }> {
    const groups = new Map<string, MoodleCourse[]>();
    courses.forEach((course) => {
        const name =
            course.categoryName || course.rawCategory || 'Other courses';
        groups.set(name, [...(groups.get(name) ?? []), course]);
    });

    return Array.from(groups.entries())
        .sort(([left], [right]) => compareSemesterGroups(left, right))
        .map(([name, grouped]) => ({
            name,
            courses: [...grouped].sort((left, right) =>
                left.fullName.localeCompare(right.fullName),
            ),
        }));
}

function compareSemesterGroups(left: string, right: string): number {
    return (
        semesterRank(right) - semesterRank(left) || left.localeCompare(right)
    );
}

function semesterRank(value: string): number {
    const match = /^(HS|FS)(\d{2})$/i.exec(value);
    if (!match) {
        return 0;
    }

    const year = Number.parseInt(match[2] ?? '0', 10);
    const season = match[1]?.toUpperCase() === 'HS' ? 2 : 1;
    return year * 10 + season;
}
