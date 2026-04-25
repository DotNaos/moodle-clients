import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useMemo, useState } from "react";

import { CourseRow, Card, EmptyState, ScreenSection, SectionHeader, SecondaryButton, TextField } from "../components/ui";
import { stripHtml } from "../format";
import { ChevronRight, FileText, RefreshCw, Search } from "../icons";
import { palette, styles } from "../styles";
import type { MoodleConnection, MoodleCourse, MoodleCourseFile, MoodleCourseSection } from "../moodle";

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
  onOpenFile: (file: MoodleCourseFile) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return props.courses;
    }

    return props.courses.filter((course) =>
      `${course.fullName} ${course.shortName} ${course.categoryName}`.toLowerCase().includes(normalized),
    );
  }, [props.courses, query]);
  const groupedCourses = useMemo(() => groupCourses(filteredCourses), [filteredCourses]);

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

  return (
    <ScreenSection>
      <SectionHeader
        title="Courses"
        action={<SecondaryButton label="Refresh" icon={RefreshCw} onPress={props.onRefresh} />}
      />

      <View style={styles.searchRow}>
        <Search color={palette.subtle} size={18} />
        <TextField value={query} onChangeText={setQuery} placeholder="Search courses" style={styles.searchInput} />
      </View>

      <Card compact>
        {props.loadingDashboard ? (
          <ActivityIndicator color={palette.text} />
        ) : groupedCourses.length > 0 ? (
          groupedCourses.map((group) => (
            <View key={group.name} style={styles.courseGroup}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              {group.courses.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  active={props.selectedCourseId === course.id}
                  onPress={() => props.onSelectCourse(course.id)}
                />
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No courses match this search.</Text>
        )}
      </Card>

      {props.currentCourse ? (
        <Card>
          <Text style={styles.cardTitle}>{props.currentCourse.fullName}</Text>
          <Text style={styles.rowSubtitle}>{props.currentCourse.categoryName}</Text>

          {props.loadingCourseId === props.currentCourse.id ? (
            <ActivityIndicator color={palette.text} />
          ) : props.sections.length > 0 ? (
            props.sections.map((section, index) => (
              <View key={`${props.currentCourse?.id}-${section.id ?? index}`} style={styles.sectionCard}>
                <Text style={styles.rowTitle}>{section.name || `Section ${index + 1}`}</Text>
                {section.summary ? <Text style={styles.cardBody}>{stripHtml(section.summary)}</Text> : null}
                {section.modules.length > 0 ? (
                  section.modules.map((module, moduleIndex) => (
                    <View key={`${module.id ?? moduleIndex}-${module.name}`} style={styles.moduleBlock}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle}>{module.name}</Text>
                        {module.modname ? <Text style={styles.rowSubtitle}>{module.modname}</Text> : null}
                      </View>
                      {module.contents.length > 0 ? (
                        <View style={styles.fileList}>
                          {module.contents.map((file) => (
                            <FileRow
                              key={`${file.fileUrl}-${file.filename}`}
                              file={file}
                              onPress={() => props.onOpenFile(file)}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No modules in this section.</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Select or refresh this course to load its sections.</Text>
          )}
        </Card>
      ) : null}
    </ScreenSection>
  );
}

function FileRow(props: { file: MoodleCourseFile; onPress: () => void }) {
  const isPdf =
    props.file.mimeType === "application/pdf" || props.file.filename.toLowerCase().endsWith(".pdf");
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
    const name = course.categoryName || "Other courses";
    groups.set(name, [...(groups.get(name) ?? []), course]);
  });

  return Array.from(groups.entries()).map(([name, groupCourses]) => ({
    name,
    courses: groupCourses,
  }));
}
