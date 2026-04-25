import { Pressable, Text, View } from "react-native";

import { BookOpen, CalendarDays, Link2, UserRound, type IconComponent } from "../icons";
import { palette, styles } from "../styles";
import type { AppView } from "../types";

const navItems: Array<{ id: AppView; label: string; icon: IconComponent }> = [
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "courses", label: "Courses", icon: BookOpen },
  { id: "connect", label: "Connect", icon: Link2 },
  { id: "profile", label: "Profile", icon: UserRound },
];

export function BottomNav(props: {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {navItems.map((item) => {
        const active = props.activeView === item.id;
        const Icon = item.icon;
        return (
          <Pressable
            key={item.id}
            onPress={() => props.onChangeView(item.id)}
            style={({ pressed }) => [
              styles.navItem,
              active && styles.navItemActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon color={active ? palette.text : palette.subtle} size={21} />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
