import { Card } from 'heroui-native';
import { Pressable, Text, View } from 'react-native';

import { Link2, X } from '../icons';
import { palette, styles } from '../styles';
import { SecondaryButton } from './ui';

type AppUpdateBannerProps = Readonly<{
    title: string;
    message: string;
    withBottomNav?: boolean;
    onDownload: () => void | Promise<void>;
    onDismiss: () => void;
}>;

export function AppUpdateBanner(props: AppUpdateBannerProps) {
    return (
        <View
            style={[
                styles.floatingBannerContainer,
                props.withBottomNav &&
                    styles.floatingBannerContainerWithBottomNav,
            ]}>
            <Card
                variant="tertiary"
                animation="disable-all"
                style={styles.floatingBannerCard}>
                <View style={styles.statusBanner}>
                    <View style={styles.statusBannerHeaderRow}>
                        <View style={styles.statusBannerTitleRow}>
                            <Link2 color={palette.text} size={18} />
                            <Text style={styles.statusTitle}>
                                {props.title}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityLabel="Dismiss app update"
                            onPress={props.onDismiss}
                            style={styles.statusBannerDismissButton}>
                            <X size={16} color="rgba(248,250,252,0.7)" />
                        </Pressable>
                    </View>
                    <Text style={styles.statusBody}>{props.message}</Text>
                    <SecondaryButton
                        label="Open download"
                        icon={Link2}
                        onPress={props.onDownload}
                    />
                </View>
            </Card>
        </View>
    );
}
