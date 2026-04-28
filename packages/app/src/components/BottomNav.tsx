import { Button, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import {
    BookOpen,
    Link2,
    UserRound,
    type IconComponent,
} from '../icons';
import { styles } from '../styles';
import type { AppView } from '../types';

const navItems: Array<{ id: AppView; label: string; icon: IconComponent }> = [
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'connect', label: 'Connect', icon: Link2 },
    { id: 'profile', label: 'Profile', icon: UserRound },
];

type BottomNavProps = {
    readonly activeView: AppView;
    readonly onChangeView: (view: AppView) => void;
};

export function BottomNav(props: BottomNavProps) {
    const [activeIconColor, inactiveIconColor] = useThemeColor([
        'accent-foreground',
        'default-foreground',
    ]);

    return (
        <View style={styles.bottomNav}>
            {navItems.map((item) => {
                const active = props.activeView === item.id;
                const Icon = item.icon;
                const buttonVariant = active ? 'primary' : 'ghost';
                const iconColor = active ? activeIconColor : inactiveIconColor;

                return (
                    <Button
                        key={item.id}
                        variant={buttonVariant}
                        feedbackVariant="scale"
                        size="md"
                        onPress={() => props.onChangeView(item.id)}
                        className="flex-1"
                        accessibilityLabel={item.label}>
                        <View style={styles.navItem}>
                            <Icon color={iconColor} size={21} />
                            <Button.Label
                                style={[
                                    styles.navLabel,
                                    active && styles.navLabelActive,
                                ]}>
                                {item.label}
                            </Button.Label>
                        </View>
                    </Button>
                );
            })}
        </View>
    );
}
