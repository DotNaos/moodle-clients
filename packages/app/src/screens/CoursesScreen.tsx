import { ActivityIndicator, Text, View } from "react-native";
import { useMemo, useState } from "react";

import { CourseRow, Card, EmptyState, ScreenSection, SectionHeader, SecondaryButton, TextField } from "../components/ui";
import { stripHtml } from "../format";
import { palette, styles } from "../styles";
import type { MoodleConnection, MoodleCourse, MoodleCourseSection } from "../moodle";

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
}) {
  const [query, setQuery] = useState("");
  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return props.courses;
    }

    return props.courses.filter((course) =>
      `${course.fullName} ${course.shortName}`.toLowerCase().includes(normalized),
    );
  }, [props.courses, query]);

  if (!props.connection) {
    return (
      <ScreenSection>
        <EmptyState
          title="Courses are locked"
          body="Connect Moodle first. After that this screen becomes the main course browser."
          actionLabel="Connect Moodle"
          onPress={props.onOpenConnect}
        />
      </ScreenSection>
    );
  }

  return (
    <ScreenSection>
      <SectionHeader
        kicker="Moodle"
        title="Courses"
        action={<SecondaryButton label="Refresh" onPress={props.onRefresh} />}
      />

      <TextField value={query} onChangeText={setQuery} placeholder="Search courses" />

      <Card>
        {props.loadingDashboard ? (
          <ActivityIndicator color={palette.text} />
        ) : filteredCourses.length > 0 ? (
          filteredCourses.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              active={props.selectedCourseId === course.id}
              onPress={() => props.onSelectCourse(course.id)}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>No courses match this search.</Text>
        )}
      </Card>

      {props.currentCourse ? (
        <Card raised>
          <Text style={styles.heroLabel}>Selected course</Text>
          <Text style={styles.cardTitle}>{props.currentCourse.fullName}</Text>
          <Text style={styles.cardBody}>{props.currentCourse.shortName}</Text>

          {props.loadingCourseId === props.currentCourse.id ? (
            <ActivityIndicator color={palette.text} />
          ) : props.sections.length > 0 ? (
            props.sections.map((section, index) => (
              <View key={`${props.currentCourse?.id}-${section.id ?? index}`} style={styles.sectionCard}>
                <Text style={styles.rowTitle}>{section.name || `Section ${index + 1}`}</Text>
                {section.summary ? <Text style={styles.cardBody}>{stripHtml(section.summary)}</Text> : null}
                {section.modules.length > 0 ? (
                  section.modules.map((module, moduleIndex) => (
                    <View key={`${module.id ?? moduleIndex}-${module.name}`} style={styles.moduleRow}>
                      <View style={styles.moduleRail} />
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle}>{module.name}</Text>
                        {module.modname ? <Text style={styles.rowSubtitle}>{module.modname}</Text> : null}
                        {module.url ? <Text style={styles.moduleLink}>{module.url}</Text> : null}
                      </View>
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
