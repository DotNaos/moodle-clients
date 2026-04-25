import { Text } from "react-native";
import { useState } from "react";

import { ActionRow, Card, PrimaryButton, ScreenSection, SecondaryButton, SessionCard, TextField } from "../components/ui";
import { Link2, ScanLine } from "../icons";
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
  const [showMoodlePaste, setShowMoodlePaste] = useState(false);
  const [showPairPaste, setShowPairPaste] = useState(false);

  return (
    <ScreenSection>
      {props.connection ? (
        <SessionCard siteUrl={props.connection.moodleSiteUrl} userId={props.connection.moodleUserId} />
      ) : null}

      <Card>
        <Text style={styles.heroLabel}>Step 1</Text>
        <Text style={styles.cardTitle}>Connect this device to Moodle</Text>
        <ActionRow>
          <PrimaryButton
            label={props.busy ? "Working..." : "Scan"}
            icon={ScanLine}
            onPress={props.onScanMoodleQr}
            disabled={props.busy}
          />
          <SecondaryButton
            label={showMoodlePaste ? "Submit" : "Use paste"}
            icon={Link2}
            onPress={showMoodlePaste ? props.onUseMoodleQr : () => setShowMoodlePaste(true)}
            disabled={props.busy}
          />
        </ActionRow>
        {showMoodlePaste ? (
          <TextField
            value={props.moodleQrInput}
            onChangeText={props.onChangeMoodleQr}
            placeholder="moodlemobile://https://..."
          />
        ) : null}
      </Card>

      <Card>
        <Text style={styles.heroLabel}>Step 2</Text>
        <Text style={styles.cardTitle}>Pair a browser session</Text>
        <ActionRow>
          <PrimaryButton label="Scan" icon={ScanLine} onPress={props.onScanPairQr} disabled={props.busy} />
          <SecondaryButton
            label={showPairPaste ? "Submit" : "Use paste"}
            icon={Link2}
            onPress={showPairPaste ? props.onUsePairQr : () => setShowPairPaste(true)}
            disabled={props.busy}
          />
        </ActionRow>
        {showPairPaste ? (
          <TextField
            value={props.pairQrInput}
            onChangeText={props.onChangePairQr}
            placeholder="moodlereadonlyproxy://pair?pairId=..."
          />
        ) : null}
      </Card>
    </ScreenSection>
  );
}
