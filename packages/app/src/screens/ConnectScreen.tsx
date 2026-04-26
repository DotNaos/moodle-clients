import { useState } from 'react';
import { Text, View } from 'react-native';

import {
    ActionRow,
    PrimaryButton,
    ScreenSection,
    SecondaryButton,
    SessionCard,
    TextField,
} from '../components/ui';
import { QRImageUpload } from '../components/QRImageUpload';
import { CircleHelp, Link2, ScanLine } from '../icons';
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
    onUseMoodleQrValue: (value: string) => void;
    onMoodleQrUploadError: (message: string) => void;
    onScanPairQr: () => void;
    onUsePairQr: () => void;
}>;

export function ConnectScreen(props: ConnectScreenProps) {
    const [showMoodlePaste, setShowMoodlePaste] = useState(false);
    const [showPairPaste, setShowPairPaste] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    return (
        <ScreenSection>
            {props.connection ? (
                <SessionCard
                    siteUrl={props.connection.moodleSiteUrl}
                    userId={props.connection.moodleUserId}
                />
            ) : null}

            <View style={styles.connectSection}>
                <Text style={styles.cardTitle}>
                    Connect this device to Moodle
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
                    <QRImageUpload
                        label="Upload QR"
                        disabled={props.busy}
                        onDecoded={props.onUseMoodleQrValue}
                        onError={props.onMoodleQrUploadError}
                    />
                    <SecondaryButton
                        label="Info"
                        icon={CircleHelp}
                        onPress={() => setShowHelp((current) => !current)}
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

                {showHelp ? <TroubleshootingInfo /> : null}
            </View>

            <View style={styles.connectSection}>
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
            </View>
        </ScreenSection>
    );
}

function TroubleshootingInfo() {
    return (
        <View style={styles.infoPanel}>
            <Text style={styles.cardTitle}>If QR login fails</Text>
            <View style={styles.tipList}>
                <Text style={styles.tipItem}>
                    • Turn off any{' '}
                    <Text style={styles.tipItemStrong}>school VPN</Text> on the
                    phone.
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
            </View>
        </View>
    );
}
