import { Text, View } from "react-native";

import { Card, EmptyState, ScreenSection, SessionCard } from "../components/ui";
import { compactUrl } from "../format";
import { styles } from "../styles";
import type { MoodleConnection, MoodleSiteInfo } from "../moodle";

export function ProfileScreen(props: {
  connection: MoodleConnection | null;
  siteInfo: MoodleSiteInfo | null;
  courseCount: number;
  onOpenConnect: () => void;
}) {
  if (!props.connection) {
    return (
      <ScreenSection>
        <EmptyState
          title="No local Moodle profile"
          body="Connect Moodle to create a local session on this device."
          actionLabel="Connect Moodle"
          onPress={props.onOpenConnect}
        />
      </ScreenSection>
    );
  }

  return (
    <ScreenSection>
      <SessionCard
        siteUrl={props.connection.moodleSiteUrl}
        siteName={props.siteInfo?.siteName}
        userName={props.siteInfo?.userName}
        userId={props.siteInfo?.userId ?? props.connection.moodleUserId}
      />

      <Card>
        <Text style={styles.heroLabel}>Local session</Text>
        <Text style={styles.cardTitle}>Stored on this device</Text>
        <Text style={styles.cardBody}>
          The current app session is intended to stay local to this browser or phone. Moodle content is loaded from Moodle when needed.
        </Text>
        <Text style={styles.cardBody}>Site: {compactUrl(props.connection.moodleSiteUrl)}</Text>
        <Text style={styles.cardBody}>Courses loaded: {props.courseCount}</Text>
      </Card>

      <Card>
        <Text style={styles.heroLabel}>Coming next</Text>
        <View style={styles.sectionCard}>
          <Text style={styles.rowTitle}>Pinned courses</Text>
          <Text style={styles.rowSubtitle}>Choose the courses that should appear first on Today.</Text>
        </View>
        <View style={styles.sectionCard}>
          <Text style={styles.rowTitle}>Display density</Text>
          <Text style={styles.rowSubtitle}>Switch between compact and relaxed course views.</Text>
        </View>
        <View style={styles.sectionCard}>
          <Text style={styles.rowTitle}>Sync behavior</Text>
          <Text style={styles.rowSubtitle}>Control what is kept local and what is fetched live from Moodle.</Text>
        </View>
      </Card>
    </ScreenSection>
  );
}
