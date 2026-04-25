import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type { AppView } from "../types";

const navItems: Array<{ id: AppView; label: string }> = [
  { id: "today", label: "Today" },
  { id: "courses", label: "Courses" },
  { id: "connect", label: "Connect" },
  { id: "profile", label: "Profile" },
];

export function BottomNav(props: {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {navItems.map((item) => {
        const active = props.activeView === item.id;
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
            <View style={[styles.navMarker, active && styles.navMarkerActive]} />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
