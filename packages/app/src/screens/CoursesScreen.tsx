import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useMemo } from "react";

import { EmptyState, ScreenSection, SectionHeader, SecondaryButton } from "../components/ui";
import { stripHtml } from "../format";
import { ChevronLeft, ChevronRight, FileText, RefreshCw } from "../icons";
import { palette, styles } from "../styles";
import type {
  MoodleConnection,
  MoodleCourse,
  MoodleCourseFile,
  MoodleCourseModule,
  MoodleCourseSection,
} from "../moodle";

export function CoursesScreen(props: {
  connection: MoodleConnection | null;
  courses: MoodleCourse[];
  selectedCourseId: number | null;
  sections: MoodleCourseSection[];
  currentCourse: MoodleCourse | null;
  loadingDashboard: boolean;
  loadingCourseId: number | null;
  onRefresh: () => void;
  onOpenConnect: () => void;
  onSelectCourse: (courseId: number) => void;
  onBackToCourses: () => void;
  onOpenFile: (file: MoodleCourseFile) => void;
}) {
  const groupedCourses = useMemo(() => groupCourses(props.courses), [props.courses]);

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

  return (
    <ScreenSection>
      <SectionHeader
        title="Courses"
        action={<SecondaryButton label="Refresh" icon={RefreshCw} onPress={props.onRefresh} />}
      />

      {props.loadingDashboard ? (
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={palette.text} />
        </View>
      ) : groupedCourses.length > 0 ? (
        <View style={styles.courseList}>
          {groupedCourses.map((group) => (
            <View key={group.name} style={styles.courseGroup}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              <View style={styles.plainList}>
                {group.courses.map((course) => (
                  <CourseListRow key={course.id} course={course} onPress={() => props.onSelectCourse(course.id)} />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState title="No courses" body="Refresh Moodle once the session is connected." />
      )}
    </ScreenSection>
  );
}

function CourseDetail(props: {
  course: MoodleCourse;
  sections: MoodleCourseSection[];
  loading: boolean;
  onBack: () => void;
  onOpenFile: (file: MoodleCourseFile) => void;
}) {
  return (
    <ScreenSection>
      <View style={styles.drilldownHeader}>
        <Pressable onPress={props.onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <ChevronLeft color={palette.text} size={20} />
        </Pressable>
        <View style={styles.rowText}>
          <Text style={styles.sectionKicker}>{props.course.categoryName}</Text>
          <Text style={styles.sectionTitle} numberOfLines={2}>
            {props.course.fullName}
          </Text>
        </View>
      </View>

      {props.loading ? (
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={palette.text} />
        </View>
      ) : props.sections.length > 0 ? (
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
      ) : (
        <EmptyState title="No content loaded" body="Refresh this course or try again later." />
      )}
    </ScreenSection>
  );
}

function CourseSection(props: {
  section: MoodleCourseSection;
  index: number;
  onOpenFile: (file: MoodleCourseFile) => void;
}) {
  const modulesWithFiles = props.section.modules.filter((module) => module.contents.length > 0);

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.rowTitle}>{props.section.name || `Section ${props.index + 1}`}</Text>
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
    </View>
  );
}

function ModuleFiles(props: {
  module: MoodleCourseModule;
  onOpenFile: (file: MoodleCourseFile) => void;
}) {
  return (
    <View style={styles.resourceGroup}>
      <Text style={styles.resourceGroupTitle} numberOfLines={2}>
        {props.module.name}
      </Text>
      {props.module.contents.map((file) => (
        <FileRow key={`${file.fileUrl}-${file.filename}`} file={file} onPress={() => props.onOpenFile(file)} />
      ))}
    </View>
  );
}

function CourseListRow(props: { course: MoodleCourse; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.courseListRow, pressed && styles.pressed]}>
      <View style={styles.rowText}>
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

function FileRow(props: { file: MoodleCourseFile; onPress: () => void }) {
  const isPdf = props.file.mimeType === "application/pdf" || props.file.filename.toLowerCase().endsWith(".pdf");
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.fileRow, pressed && styles.pressed]}>
      <FileText color={isPdf ? palette.red : palette.blue} size={18} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {props.file.filename}
        </Text>
        <Text style={styles.rowSubtitle}>{isPdf ? "PDF" : props.file.mimeType || "File"}</Text>
      </View>
      <ChevronRight color={palette.subtle} size={18} />
    </Pressable>
  );
}

function groupCourses(courses: MoodleCourse[]): Array<{ name: string; courses: MoodleCourse[] }> {
  const groups = new Map<string, MoodleCourse[]>();
  courses.forEach((course) => {
    const name = course.categoryName || course.rawCategory || "Other courses";
    groups.set(name, [...(groups.get(name) ?? []), course]);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => compareSemesterGroups(left, right))
    .map(([name, groupCourses]) => ({
      name,
      courses: [...groupCourses].sort((left, right) => left.fullName.localeCompare(right.fullName)),
    }));
}

function compareSemesterGroups(left: string, right: string): number {
  return semesterRank(right) - semesterRank(left) || left.localeCompare(right);
}

function semesterRank(value: string): number {
  const match = value.match(/^(HS|FS)(\d{2})$/i);
  if (!match) {
    return 0;
  }

  const year = Number.parseInt(match[2] ?? "0", 10);
  const season = match[1]?.toUpperCase() === "HS" ? 2 : 1;
  return year * 10 + season;
}
