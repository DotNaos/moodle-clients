import { Text, View } from "react-native";

import { CourseRow, ActionRow, EmptyState, HeroPanel, MetricTile, PrimaryButton, ScreenSection, SecondaryButton, SectionHeader } from "../components/ui";
import { compactUrl } from "../format";
import { BookOpen, RefreshCw, ScanLine } from "../icons";
import { styles } from "../styles";
import type { MoodleConnection, MoodleCourse, MoodleSiteInfo } from "../moodle";

export function TodayScreen(props: {
  connection: MoodleConnection | null;
  siteInfo: MoodleSiteInfo | null;
  courses: MoodleCourse[];
  loading: boolean;
  onRefresh: () => void;
  onOpenConnect: () => void;
  onOpenCourses: () => void;
}) {
  const connected = props.connection !== null;
  const recentCourses = props.courses.slice(0, 3);

  return (
    <ScreenSection>
      <HeroPanel
        kicker={connected ? "Ready to study" : "Setup needed"}
        title={connected ? "Moodle is connected." : "Connect Moodle"}
        body={
          connected
            ? `Signed in to ${compactUrl(props.connection?.moodleSiteUrl ?? "")}.`
            : "Scan the Moodle Mobile QR code once. The session stays local."
        }
        ready={connected}
      >
        <ActionRow>
          {connected ? (
            <>
              <PrimaryButton label="Courses" icon={BookOpen} onPress={props.onOpenCourses} />
              <SecondaryButton label="Refresh" icon={RefreshCw} onPress={props.onRefresh} />
            </>
          ) : (
            <PrimaryButton label="Connect" icon={ScanLine} onPress={props.onOpenConnect} />
          )}
        </ActionRow>
      </HeroPanel>

      {connected ? (
        <View style={styles.metricGrid}>
          <MetricTile label="Courses" value={String(props.courses.length)} loading={props.loading} hint="Loaded from Moodle" />
          <MetricTile label="Session" value="Ready" hint="Stored locally" />
        </View>
      ) : null}

      {connected ? <SectionHeader title="Recent courses" /> : null}

      {connected && recentCourses.length > 0 ? (
        <View style={styles.card}>
          {recentCourses.map((course) => (
            <CourseRow key={course.id} course={course} onPress={props.onOpenCourses} />
          ))}
        </View>
      ) : connected ? (
        <EmptyState
          title="No courses loaded yet"
          body="Refresh Moodle to load the course list."
          actionLabel="Refresh Moodle"
          onPress={props.onRefresh}
        />
      ) : null}
    </ScreenSection>
  );
}
