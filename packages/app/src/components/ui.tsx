import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

import { compactUrl, getInitials } from "../format";
import type { IconComponent } from "../icons";
import { palette, styles } from "../styles";
import type { MoodleCourse } from "../moodle";

export function ScreenSection(props: { children: React.ReactNode }) {
  return <View style={styles.screen}>{props.children}</View>;
}

export function SectionHeader(props: { kicker?: string; title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        {props.kicker ? <Text style={styles.sectionKicker}>{props.kicker}</Text> : null}
        <Text style={styles.sectionTitle}>{props.title}</Text>
      </View>
      {props.action}
    </View>
  );
}

export function Card(props: {
  children: React.ReactNode;
  compact?: boolean;
  raised?: boolean;
  ready?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        props.compact && styles.cardCompact,
        props.raised && styles.cardRaised,
        props.ready && styles.heroPanelReady,
      ]}
    >
      {props.children}
    </View>
  );
}

export function HeroPanel(props: {
  kicker: string;
  title: string;
  body: string;
  ready?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.heroPanel, props.ready && styles.heroPanelReady]}>
      <View>
        <Text style={styles.heroLabel}>{props.kicker}</Text>
        <Text style={styles.heroTitle}>{props.title}</Text>
      </View>
      <Text style={styles.heroBody}>{props.body}</Text>
      {props.children}
    </View>
  );
}

export function PrimaryButton(props: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  icon?: IconComponent;
}) {
  const Icon = props.icon;
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (pressed || props.disabled) && styles.pressed,
      ]}
    >
      {Icon ? <Icon color={palette.ink} size={18} /> : null}
      <Text style={styles.primaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

export function SecondaryButton(props: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  icon?: IconComponent;
}) {
  const Icon = props.icon;
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        (pressed || props.disabled) && styles.pressed,
      ]}
    >
      {Icon ? <Icon color={palette.text} size={18} /> : null}
      <Text style={styles.secondaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

export function ActionRow(props: { children: React.ReactNode }) {
  return <View style={styles.actionRow}>{props.children}</View>;
}

export function MetricTile(props: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      {props.loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={styles.metricValue}>{props.value}</Text>
      )}
      {props.hint ? <Text style={styles.metricHint}>{props.hint}</Text> : null}
    </View>
  );
}

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={palette.subtle}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function CourseRow(props: {
  course: MoodleCourse;
  active?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.courseAvatar}>
        <Text style={styles.courseAvatarText}>{getInitials(props.course.shortName || props.course.fullName)}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{props.course.fullName}</Text>
        <Text style={styles.rowSubtitle}>{props.course.shortName}</Text>
      </View>
      {!props.course.visible ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Hidden</Text>
        </View>
      ) : null}
    </>
  );

  if (!props.onPress) {
    return <View style={[styles.listRow, props.active && styles.listRowActive]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.listRow,
        props.active && styles.listRowActive,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function EmptyState(props: {
  title: string;
  body: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <Card>
      <Text style={styles.cardTitle}>{props.title}</Text>
      <Text style={styles.cardBody}>{props.body}</Text>
      {props.actionLabel && props.onPress ? (
        <SecondaryButton label={props.actionLabel} onPress={props.onPress} />
      ) : null}
    </Card>
  );
}

export function SessionCard(props: {
  siteUrl?: string;
  siteName?: string;
  userName?: string;
  userId?: number;
}) {
  return (
    <Card ready>
      <Text style={styles.heroLabel}>Connected Session</Text>
      <Text style={styles.cardTitle}>{props.siteName ?? compactUrl(props.siteUrl ?? "")}</Text>
      {props.userName ? <Text style={styles.cardBody}>{props.userName}</Text> : null}
      {props.userId ? <Text style={styles.cardBody}>User {props.userId}</Text> : null}
      {props.siteUrl ? <Text style={styles.cardBody}>{compactUrl(props.siteUrl)}</Text> : null}
    </Card>
  );
}
