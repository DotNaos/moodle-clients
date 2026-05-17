import { Text, View } from 'react-native';

import {
    Card,
    EmptyState,
    ScreenSection,
    SecondaryButton,
    SessionCard,
} from '../components/ui';
import type { AppUpdateDiagnostics } from '../appUpdates';
import { compactUrl } from '../format';
import { Link2, RefreshCw } from '../icons';
import type { MoodleConnection, MoodleSiteInfo } from '../moodle';
import { styles } from '../styles';

type ProfileScreenProps = {
    readonly connection: MoodleConnection | null;
    readonly siteInfo: MoodleSiteInfo | null;
    readonly courseCount: number;
    readonly appVersion: string;
    readonly checkingForUpdate: boolean;
    readonly updateDiagnostics: AppUpdateDiagnostics;
    readonly onOpenConnect: () => void;
    readonly onCheckForUpdate: () => void;
    readonly onOpenDownload: () => void;
};

export function ProfileScreen(props: ProfileScreenProps) {
    const selfUpdateStatus = props.updateDiagnostics.selfUpdateEnabled
        ? 'Enabled'
        : 'Disabled';
    const updateChannel = formatUpdateValue(props.updateDiagnostics.channel);
    const runtimeVersion = formatUpdateValue(
        props.updateDiagnostics.runtimeVersion,
    );

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
            />

            <Card>
                <Text style={styles.heroLabel}>Local session</Text>
                <Text style={styles.cardTitle}>Stored on this device</Text>
                <Text style={styles.cardBody}>
                    The Moodle token is kept locally so the app can reopen
                    without scanning again.
                </Text>
                <Text style={styles.cardBody}>
                    Site: {compactUrl(props.connection.moodleSiteUrl)}
                </Text>
                <Text style={styles.cardBody}>
                    Courses loaded: {props.courseCount}
                </Text>
            </Card>

            <Card>
                <Text style={styles.heroLabel}>App updates</Text>
                <Text style={styles.cardTitle}>Version {props.appVersion}</Text>
                <Text style={styles.cardBody}>
                    The app checks for updates on startup. It applies app-only
                    updates automatically and keeps the latest download page one
                    tap away when a full install is needed.
                </Text>
                <Text style={styles.cardBody}>
                    Self-update: {selfUpdateStatus}
                </Text>
                <Text style={styles.cardBody}>Channel: {updateChannel}</Text>
                <Text style={styles.cardBody}>Runtime: {runtimeVersion}</Text>
                <View style={styles.actionRow}>
                    <SecondaryButton
                        label={
                            props.checkingForUpdate
                                ? 'Checking...'
                                : 'Check now'
                        }
                        icon={RefreshCw}
                        onPress={props.onCheckForUpdate}
                        disabled={props.checkingForUpdate}
                        fullWidth={false}
                    />
                    <SecondaryButton
                        label="Open download"
                        icon={Link2}
                        onPress={props.onOpenDownload}
                        fullWidth={false}
                    />
                </View>
            </Card>
        </ScreenSection>
    );
}

function formatUpdateValue(value: string | null): string {
    return value?.trim() ? value : 'not set';
}
