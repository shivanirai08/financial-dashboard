import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

type Props = {
  name: string;
  subtitle: string;
  onPress: () => void;
};

export function PlaylistCard({ name, subtitle, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="musical-notes-outline" size={20} color={colors.cyan} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>
          {name}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  cardPressed: {
    opacity: 0.82
  },
  copy: {
    flex: 1
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.cyanSoft,
    borderRadius: 14,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3
  }
});
