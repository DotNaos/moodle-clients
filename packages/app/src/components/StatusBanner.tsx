import { Card } from 'heroui-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { X } from '../icons';
import { palette, styles } from '../styles';

export function StatusBanner(
    props: Readonly<{
        busy: boolean;
        infoMessage: string;
        errorMessage: string;
        withBottomNav?: boolean;
        errorDetails?: readonly string[];
    }>,
) {
    const isError = Boolean(props.errorMessage);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        setDismissed(false);
    }, [props.busy, props.infoMessage, props.errorMessage]);

    if (dismissed || (!props.busy && !props.errorMessage)) {
        return null;
    }

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
                style={[
                    styles.floatingBannerCard,
                    isError && styles.floatingBannerCardError,
                ]}>
                <View
                    style={[
                        styles.statusBanner,
                        isError
                            ? styles.statusBannerError
                            : styles.statusBannerInfo,
                    ]}>
                    <View style={styles.statusBannerHeaderRow}>
                        <View style={styles.statusBannerTitleRow}>
                            {props.busy ? (
                                <ActivityIndicator color={palette.text} />
                            ) : null}
                            <Text style={styles.statusTitle}>
                                {isError ? 'Needs attention' : 'Working'}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityLabel="Dismiss status banner"
                            onPress={() => setDismissed(true)}
                            style={styles.statusBannerDismissButton}>
                            <X size={16} color="rgba(248,250,252,0.7)" />
                        </Pressable>
                    </View>
                    <Text style={styles.statusBody}>{props.infoMessage}</Text>
                    {isError ? (
                        <>
                            <Text style={styles.errorText}>
                                {props.errorMessage}
                            </Text>
                            {props.errorDetails?.map((detail) => (
                                <Text
                                    key={detail}
                                    style={styles.statusDebugText}>
                                    {detail}
                                </Text>
                            ))}
                        </>
                    ) : null}
                </View>
            </Card>
        </View>
    );
}
