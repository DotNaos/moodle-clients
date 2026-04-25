import { Text, View } from "react-native";

import { CourseRow, ActionRow, EmptyState, HeroPanel, MetricTile, PrimaryButton, ScreenSection, SecondaryButton, SectionHeader } from "../components/ui";
import { compactUrl } from "../format";
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
        title={connected ? "Your Moodle workspace is connected." : "Connect Moodle once to unlock the app."}
        body={
          connected
            ? `Signed in to ${compactUrl(props.connection?.moodleSiteUrl ?? "")}. Continue with courses or pair another surface when needed.`
            : "Use the Moodle Mobile QR code to turn this app into your course browser and login companion."
        }
        ready={connected}
      >
        <ActionRow>
          {connected ? (
            <>
              <PrimaryButton label="Open courses" onPress={props.onOpenCourses} />
              <SecondaryButton label="Refresh" onPress={props.onRefresh} />
            </>
          ) : (
            <PrimaryButton label="Connect Moodle" onPress={props.onOpenConnect} />
          )}
        </ActionRow>
      </HeroPanel>

      <View style={styles.metricGrid}>
        <MetricTile label="Courses" value={String(props.courses.length)} loading={props.loading} hint="Loaded from Moodle" />
        <MetricTile label="Session" value={connected ? "Ready" : "Off"} hint={connected ? "Local token" : "Not connected"} />
      </View>

      {props.siteInfo ? (
        <View style={styles.card}>
          <Text style={styles.heroLabel}>Account</Text>
          <Text style={styles.cardTitle}>{props.siteInfo.siteName}</Text>
          <Text style={styles.cardBody}>{props.siteInfo.userName}</Text>
          <Text style={styles.cardBody}>{compactUrl(props.siteInfo.siteUrl)}</Text>
        </View>
      ) : null}

      <SectionHeader kicker="Next" title={connected ? "Pick up where you left off" : "Start here"} />

      {connected && recentCourses.length > 0 ? (
        <View style={styles.card}>
          {recentCourses.map((course) => (
            <CourseRow key={course.id} course={course} onPress={props.onOpenCourses} />
          ))}
        </View>
      ) : (
        <EmptyState
          title={connected ? "No courses loaded yet" : "No Moodle connection yet"}
          body={
            connected
              ? "Refresh Moodle to load the course list, then this area becomes your quick course launcher."
              : "Connect with the Moodle Mobile QR code. After that, Today becomes your study overview instead of a setup screen."
          }
          actionLabel={connected ? "Refresh Moodle" : "Open Connect"}
          onPress={connected ? props.onRefresh : props.onOpenConnect}
        />
      )}
    </ScreenSection>
  );
}
