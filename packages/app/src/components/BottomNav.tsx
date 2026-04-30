import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bot, BookOpen, Link2, UserRound, type IconComponent } from '../icons';
import { palette, styles } from '../styles';
import type { AppView } from '../types';

const navItems: Array<{ id: AppView; label: string; icon: IconComponent }> = [
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'connect', label: 'Connect', icon: Link2 },
    { id: 'codex', label: 'Codex', icon: Bot },
    { id: 'profile', label: 'Profile', icon: UserRound },
];

type BottomNavProps = {
    readonly activeView: AppView;
    readonly onChangeView: (view: AppView) => void;
};

export function BottomNav(props: BottomNavProps) {
    const insets = useSafeAreaInsets();

    return (
        <View
            style={[
                styles.bottomNav,
                { paddingBottom: Math.max(insets.bottom, 14) + 6 },
            ]}>
            {navItems.map((item) => {
                const active = props.activeView === item.id;
                const Icon = item.icon;

                return (
                    <Pressable
                        key={item.id}
                        style={({ pressed }) => [
                            styles.navItemButton,
                            active && styles.navItemButtonActive,
                            pressed && styles.navItemButtonPressed,
                        ]}
                        onPress={() => props.onChangeView(item.id)}
                        accessibilityLabel={item.label}
                        accessibilityRole="button">
                        <Icon
                            color={
                                active ? palette.blue : palette.subtle
                            }
                            size={21}
                        />
                        <Text
                            style={[
                                styles.navLabel,
                                active && styles.navLabelActive,
                            ]}
                            numberOfLines={1}>
                            {item.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
