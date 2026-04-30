import { Text } from 'react-native';

import { Card, EmptyState, ScreenSection, SessionCard } from '../components/ui';
import { compactUrl } from '../format';
import type { MoodleConnection, MoodleSiteInfo } from '../moodle';
import { styles } from '../styles';

type ProfileScreenProps = {
    readonly connection: MoodleConnection | null;
    readonly siteInfo: MoodleSiteInfo | null;
    readonly courseCount: number;
    readonly onOpenConnect: () => void;
};

export function ProfileScreen(props: ProfileScreenProps) {
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
        </ScreenSection>
    );
}
