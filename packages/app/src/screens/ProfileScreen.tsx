import { Text } from "react-native";

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
          The Moodle token is kept locally so the app can reopen without scanning again.
        </Text>
        <Text style={styles.cardBody}>Site: {compactUrl(props.connection.moodleSiteUrl)}</Text>
        <Text style={styles.cardBody}>Courses loaded: {props.courseCount}</Text>
      </Card>
    </ScreenSection>
  );
}
