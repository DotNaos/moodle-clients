import { Text } from "react-native";

import { ActionRow, Card, PrimaryButton, ScreenSection, SecondaryButton, SessionCard, TextField } from "../components/ui";
import { styles } from "../styles";
import type { MoodleConnection } from "../moodle";

export function ConnectScreen(props: {
  busy: boolean;
  connection: MoodleConnection | null;
  moodleQrInput: string;
  pairQrInput: string;
  onChangeMoodleQr: (value: string) => void;
  onChangePairQr: (value: string) => void;
  onScanMoodleQr: () => void;
  onUseMoodleQr: () => void;
  onScanPairQr: () => void;
  onUsePairQr: () => void;
}) {
  return (
    <ScreenSection>
      {props.connection ? (
        <SessionCard siteUrl={props.connection.moodleSiteUrl} userId={props.connection.moodleUserId} />
      ) : null}

      <Card>
        <Text style={styles.heroLabel}>Step 1</Text>
        <Text style={styles.cardTitle}>Connect this device to Moodle</Text>
        <Text style={styles.cardBody}>
          Start with the scanner. The paste field stays here for testing or fallback cases.
        </Text>
        <ActionRow>
          <PrimaryButton
            label={props.busy ? "Working..." : "Scan Moodle QR"}
            onPress={props.onScanMoodleQr}
            disabled={props.busy}
          />
          <SecondaryButton label="Use pasted link" onPress={props.onUseMoodleQr} disabled={props.busy} />
        </ActionRow>
        <TextField
          value={props.moodleQrInput}
          onChangeText={props.onChangeMoodleQr}
          placeholder="moodlemobile://https://..."
        />
      </Card>

      <Card>
        <Text style={styles.heroLabel}>Step 2</Text>
        <Text style={styles.cardTitle}>Pair a browser session</Text>
        <Text style={styles.cardBody}>
          When the web app or GPT OAuth flow shows a pairing QR, scan it here to hand over the Moodle connection.
        </Text>
        <ActionRow>
          <PrimaryButton label="Scan pairing QR" onPress={props.onScanPairQr} disabled={props.busy} />
          <SecondaryButton label="Use pasted QR" onPress={props.onUsePairQr} disabled={props.busy} />
        </ActionRow>
        <TextField
          value={props.pairQrInput}
          onChangeText={props.onChangePairQr}
          placeholder="moodlereadonlyproxy://pair?pairId=..."
        />
      </Card>
    </ScreenSection>
  );
}
