import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToastStore } from "@/store/toast-store";
import { colors } from "@/theme";

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  const containerStyle = useMemo(
    () => [styles.container, { top: insets.top + 8 }],
    [insets.top]
  );

  return (
    <View pointerEvents="box-none" style={containerStyle}>
      {toasts.map((toast) => (
        <Pressable key={toast.id} onPress={() => removeToast(toast.id)} style={styles.toast}>
          <View
            style={[
              styles.accent,
              toast.type === "success"
                ? { backgroundColor: colors.green }
                : toast.type === "error"
                  ? { backgroundColor: colors.rose }
                  : { backgroundColor: colors.cyan }
            ]}
          />
          <Text style={styles.message}>{toast.message}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 80,
    gap: 8
  },
  toast: {
    alignItems: "center",
    backgroundColor: "rgba(4,7,13,0.96)",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  accent: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  message: {
    color: colors.text,
    flex: 1,
    fontSize: 13
  }
});
