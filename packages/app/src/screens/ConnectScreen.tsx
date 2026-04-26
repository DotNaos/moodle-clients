import { useState } from 'react';
import { Text, View } from 'react-native';

import {
    ActionRow,
    Card,
    PrimaryButton,
    ScreenSection,
    SecondaryButton,
    SessionCard,
    TextField,
} from '../components/ui';
import { Link2, ScanLine } from '../icons';
import type { MoodleConnection } from '../moodle';
import { styles } from '../styles';

type ConnectScreenProps = Readonly<{
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
}>;

export function ConnectScreen(props: ConnectScreenProps) {
    const [showMoodlePaste, setShowMoodlePaste] = useState(false);
    const [showPairPaste, setShowPairPaste] = useState(false);

    return (
        <ScreenSection>
            {props.connection ? (
                <SessionCard
                    siteUrl={props.connection.moodleSiteUrl}
                    userId={props.connection.moodleUserId}
                />
            ) : null}

            <Card>
                <Text style={styles.heroLabel}>Step 1</Text>
                <Text style={styles.cardTitle}>
                    Connect this device to Moodle
                </Text>
                <Text style={styles.cardBody}>
                    Tip: turn off any school VPN before scanning. Moodle QR
                    login only works when the phone and the Moodle page reach
                    Moodle through the same network path.
                </Text>
                <ActionRow>
                    <PrimaryButton
                        label={props.busy ? 'Working...' : 'Scan'}
                        icon={ScanLine}
                        onPress={props.onScanMoodleQr}
                        disabled={props.busy}
                    />
                    <SecondaryButton
                        label={showMoodlePaste ? 'Submit' : 'Use paste'}
                        icon={Link2}
                        onPress={
                            showMoodlePaste
                                ? props.onUseMoodleQr
                                : () => setShowMoodlePaste(true)
                        }
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

            <Card raised>
                <Text style={styles.heroLabel}>Troubleshooting</Text>
                <Text style={styles.cardTitle}>If QR login fails</Text>
                <View style={styles.tipList}>
                    <Text style={styles.tipItem}>
                        • Turn off any{' '}
                        <Text style={styles.tipItemStrong}>school VPN</Text> on
                        the phone.
                    </Text>
                    <Text style={styles.tipItem}>
                        • Keep the phone and the Moodle page on the{' '}
                        <Text style={styles.tipItemStrong}>same Wi-Fi</Text>.
                    </Text>
                    <Text style={styles.tipItem}>
                        • Disable{' '}
                        <Text style={styles.tipItemStrong}>
                            iCloud Private Relay
                        </Text>{' '}
                        while connecting.
                    </Text>
                    <Text style={styles.tipItem}>
                        • If the QR code is shown on a laptop, use the{' '}
                        <Text style={styles.tipItemStrong}>
                            laptop web scanner
                        </Text>{' '}
                        instead of the phone camera.
                    </Text>
                </View>
            </Card>

            <Card>
                <Text style={styles.heroLabel}>Step 2</Text>
                <Text style={styles.cardTitle}>Pair a browser session</Text>
                <ActionRow>
                    <PrimaryButton
                        label="Scan"
                        icon={ScanLine}
                        onPress={props.onScanPairQr}
                        disabled={props.busy}
                    />
                    <SecondaryButton
                        label={showPairPaste ? 'Submit' : 'Use paste'}
                        icon={Link2}
                        onPress={
                            showPairPaste
                                ? props.onUsePairQr
                                : () => setShowPairPaste(true)
                        }
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
