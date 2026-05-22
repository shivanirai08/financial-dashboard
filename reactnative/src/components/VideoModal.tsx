import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  videoId: string | null;
  title?: string;
  onClose: () => void;
};

export function VideoModal({ visible, videoId, title, onClose }: Props) {
  return (
    <Modal animationType="slide" visible={visible} transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text numberOfLines={1} style={styles.title}>
              {title ?? "Video"}
            </Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" color={colors.text} size={20} />
            </Pressable>
          </View>
          <View style={styles.playerWrap}>
            {videoId ? <YoutubePlayer height={240} play videoId={videoId} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    flex: 1,
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    minHeight: 340,
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: "100%"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    marginRight: 12
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  playerWrap: {
    borderRadius: 18,
    overflow: "hidden"
  }
});
