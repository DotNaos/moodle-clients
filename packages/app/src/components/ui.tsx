import { Button, Input as HeroInput } from 'heroui-native';
import {
    ActivityIndicator,
    Pressable,
    Text,
    View,
    type StyleProp,
    type TextInputProps,
    type TextStyle,
    type ViewStyle,
} from 'react-native';

import { compactUrl, getInitials } from '../format';
import type { IconComponent } from '../icons';
import type { MoodleCourse } from '../moodle';
import { palette, styles } from '../styles';

type ScreenSectionProps = {
    readonly children: React.ReactNode;
};

type SectionHeaderProps = {
    readonly kicker?: string;
    readonly title: string;
    readonly action?: React.ReactNode;
};

type CardProps = {
    readonly children: React.ReactNode;
    readonly compact?: boolean;
    readonly raised?: boolean;
    readonly ready?: boolean;
};

type HeroPanelProps = {
    readonly kicker: string;
    readonly title: string;
    readonly body: string;
    readonly ready?: boolean;
    readonly children?: React.ReactNode;
};

type AppButtonProps = {
    readonly label: string;
    readonly onPress: () => void | Promise<void>;
    readonly disabled?: boolean;
    readonly icon?: IconComponent;
    readonly fullWidth?: boolean;
    readonly style?: StyleProp<ViewStyle>;
    readonly labelStyle?: StyleProp<TextStyle>;
};

type GhostButtonProps = AppButtonProps & {
    readonly size?: 'sm' | 'lg';
};

type MetricTileProps = {
    readonly label: string;
    readonly value: string;
    readonly hint?: string;
    readonly loading?: boolean;
};

type CourseRowProps = {
    readonly course: MoodleCourse;
    readonly active?: boolean;
    readonly onPress?: () => void;
};

type EmptyStateProps = {
    readonly title: string;
    readonly body: string;
    readonly actionLabel?: string;
    readonly onPress?: () => void;
};

type SessionCardProps = {
    readonly siteUrl?: string;
    readonly siteName?: string;
    readonly userName?: string;
};

type AppTextFieldProps = TextInputProps;

export function ScreenSection(props: ScreenSectionProps) {
    return <View style={styles.screen}>{props.children}</View>;
}

export function SectionHeader(props: SectionHeaderProps) {
    return (
        <View style={styles.sectionHeader}>
            <View>
                {props.kicker ? (
                    <Text style={styles.sectionKicker}>{props.kicker}</Text>
                ) : null}
                <Text style={styles.sectionTitle}>{props.title}</Text>
            </View>
            {props.action}
        </View>
    );
}

export function Card(props: CardProps) {
    return (
        <View
            style={[
                styles.surfaceFrame,
                props.raised && styles.surfaceFrameRaised,
                props.ready && styles.surfaceFrameReady,
            ]}>
            <View
                style={[
                    styles.card,
                    props.compact && styles.cardCompact,
                    props.raised && styles.cardRaised,
                    props.ready && styles.heroPanelReady,
                ]}>
                {props.children}
            </View>
        </View>
    );
}

export function HeroPanel(props: HeroPanelProps) {
    return (
        <View
            style={[
                styles.surfaceFrame,
                styles.heroSurface,
                props.ready && styles.surfaceFrameReady,
            ]}>
            <View
                style={[
                    styles.heroPanel,
                    props.ready && styles.heroPanelReady,
                ]}>
                <View style={styles.brandCopy}>
                    <Text style={styles.heroLabel}>{props.kicker}</Text>
                    <Text style={styles.heroTitle}>{props.title}</Text>
                </View>
                <Text style={styles.heroBody}>{props.body}</Text>
                {props.children}
            </View>
        </View>
    );
}

export function PrimaryButton(props: AppButtonProps) {
    const Icon = props.icon;
    const shouldFillWidth = props.fullWidth !== false;

    return (
        <Button
            size="lg"
            feedbackVariant="scale"
            isDisabled={props.disabled}
            onPress={props.onPress}
            style={[
                styles.buttonBase,
                styles.primaryButton,
                shouldFillWidth && styles.buttonFill,
                props.style,
                props.disabled && styles.buttonDisabled,
            ]}>
            {Icon ? <Icon color={palette.ink} size={18} /> : null}
            <Button.Label
                numberOfLines={1}
                style={[styles.primaryButtonText, props.labelStyle]}>
                {props.label}
            </Button.Label>
        </Button>
    );
}

export function SecondaryButton(props: AppButtonProps) {
    const Icon = props.icon;
    const shouldFillWidth = props.fullWidth !== false;

    return (
        <Button
            size="lg"
            feedbackVariant="scale"
            isDisabled={props.disabled}
            onPress={props.onPress}
            style={[
                styles.buttonBase,
                styles.secondaryButton,
                shouldFillWidth && styles.buttonFill,
                props.style,
                props.disabled && styles.buttonDisabled,
            ]}>
            {Icon ? <Icon color={palette.text} size={18} /> : null}
            <Button.Label
                numberOfLines={1}
                style={[styles.secondaryButtonText, props.labelStyle]}>
                {props.label}
            </Button.Label>
        </Button>
    );
}

export function GhostButton(props: GhostButtonProps) {
    const Icon = props.icon;
    const shouldFillWidth = props.fullWidth === true;

    return (
        <Button
            size={props.size ?? 'lg'}
            feedbackVariant="scale"
            isDisabled={props.disabled}
            onPress={props.onPress}
            style={[
                styles.ghostButton,
                props.size === 'sm' && styles.buttonSmall,
                shouldFillWidth && styles.buttonFill,
                props.style,
                props.disabled && styles.buttonDisabled,
            ]}>
            {Icon ? (
                <Icon
                    color={palette.text}
                    size={props.size === 'sm' ? 14 : 18}
                />
            ) : null}
            <Button.Label
                numberOfLines={1}
                style={[
                    styles.ghostButtonText,
                    props.size === 'sm' && styles.buttonSmallText,
                    props.labelStyle,
                ]}>
                {props.label}
            </Button.Label>
        </Button>
    );
}

export function ActionRow(props: ScreenSectionProps) {
    return <View style={styles.actionRow}>{props.children}</View>;
}

export function MetricTile(props: MetricTileProps) {
    return (
        <View style={{ flex: 1 }}>
            <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{props.label}</Text>
                {props.loading ? (
                    <ActivityIndicator color={palette.text} />
                ) : (
                    <Text style={styles.metricValue}>{props.value}</Text>
                )}
                {props.hint ? (
                    <Text style={styles.metricHint}>{props.hint}</Text>
                ) : null}
            </View>
        </View>
    );
}

export function TextField({ style, ...inputProps }: AppTextFieldProps) {
    return (
        <HeroInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="rgba(248, 250, 252, 0.4)"
            {...inputProps}
            style={[styles.input, style]}
        />
    );
}

export function CourseRow(props: CourseRowProps) {
    const isHidden = props.course.visible === 0;
    const content = (
        <View>
            <View
                style={[styles.listRow, props.active && styles.listRowActive]}>
                <View style={styles.courseAvatar}>
                    <Text style={styles.courseAvatarText}>
                        {getInitials(
                            props.course.shortName || props.course.fullName,
                        )}
                    </Text>
                </View>
                <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{props.course.fullName}</Text>
                    <Text style={styles.rowSubtitle}>
                        {props.course.shortName}
                    </Text>
                </View>
                {isHidden ? (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>Hidden</Text>
                    </View>
                ) : null}
            </View>
        </View>
    );

    if (!props.onPress) {
        return content;
    }

    return (
        <Pressable
            onPress={props.onPress}
            style={({ pressed }) => [pressed && styles.pressed]}>
            {content}
        </Pressable>
    );
}

export function EmptyState(props: EmptyStateProps) {
    return (
        <Card>
            <Text style={styles.cardTitle}>{props.title}</Text>
            <Text style={styles.cardBody}>{props.body}</Text>
            {props.actionLabel && props.onPress ? (
                <SecondaryButton
                    label={props.actionLabel}
                    onPress={props.onPress}
                />
            ) : null}
        </Card>
    );
}

export function SessionCard(props: SessionCardProps) {
    return (
        <Card ready>
            <Text style={styles.heroLabel}>Connected</Text>
            <Text style={styles.cardTitle}>
                {props.siteName ?? compactUrl(props.siteUrl ?? '')}
            </Text>
            {props.userName ? (
                <Text style={styles.cardBody}>{props.userName}</Text>
            ) : null}
        </Card>
    );
}
