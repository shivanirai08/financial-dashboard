import { useState } from "react";
import {
  type GestureResponderEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayerStore } from "@/store/player-store";
import { nativeAudioController } from "@/lib/playback";
import { toggleLikeSong } from "@/lib/api";
import { colors } from "@/theme";
import { formatClock } from "@/utils/format";
import { VideoModal } from "@/components/VideoModal";
import { useToastStore } from "@/store/toast-store";

export function PlayerOverlay() {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  const {
    currentSong,
    isPlaying,
    isLoadingTrack,
    progress,
    duration,
    songs,
    queue,
    currentQueuePos,
    isShuffle,
    repeatMode,
    playNext,
    playPrev,
    setIsPlaying,
    toggleShuffle,
    cycleRepeat,
    updateLike,
    video,
    closeVideo
  } = usePlayerStore();

  if (!currentSong) {
    return (
      <VideoModal
        onClose={closeVideo}
        title="YouTube"
        videoId={video.videoId}
        visible={video.visible}
      />
    );
  }

  const queueSongs = queue.map((index) => songs[index]).filter(Boolean);

  return (
    <>
      <Pressable
        onPress={() => setExpanded(true)}
        style={[styles.miniBar, { bottom: insets.bottom + 58 }]}
      >
        <View style={styles.miniCopy}>
          <Text numberOfLines={1} style={styles.miniTitle}>
            {currentSong.title}
          </Text>
          <Text numberOfLines={1} style={styles.miniArtist}>
            {currentSong.artist}
          </Text>
        </View>
        <View style={styles.miniActions}>
          <Pressable
              onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              playPrev();
            }}
            style={styles.miniIcon}
          >
            <Ionicons color={colors.text} name="play-skip-back" size={20} />
          </Pressable>
          <Pressable
              onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              setIsPlaying(!isPlaying);
            }}
            style={styles.miniPlay}
          >
            <Ionicons
              color={colors.text}
              name={isLoadingTrack ? "hourglass-outline" : isPlaying ? "pause" : "play"}
              size={18}
            />
          </Pressable>
          <Pressable
              onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              playNext();
            }}
            style={styles.miniIcon}
          >
            <Ionicons color={colors.text} name="play-skip-forward" size={20} />
          </Pressable>
        </View>
      </Pressable>

      <Modal animationType="slide" visible={expanded} onRequestClose={() => setExpanded(false)}>
        <View style={styles.fullscreen}>
          <View style={[styles.dragHandle, { marginTop: insets.top + 8 }]} />
          <View style={styles.fullHeader}>
            <Pressable onPress={() => setExpanded(false)} style={styles.headerIcon}>
              <Ionicons color={colors.text} name="chevron-down" size={24} />
            </Pressable>
            <Text style={styles.headerTitle}>Now Playing</Text>
            <Pressable
              onPress={() => currentSong.youtube_video_id && usePlayerStore.getState().openVideo(currentSong.youtube_video_id)}
              style={styles.headerIcon}
            >
              <Ionicons color={colors.text} name="videocam-outline" size={20} />
            </Pressable>
          </View>

          <View style={styles.heroArtwork}>
            <Ionicons color={colors.cyan} name="musical-notes-outline" size={92} />
          </View>

          <View style={styles.songMeta}>
            <Text numberOfLines={2} style={styles.songTitle}>
              {currentSong.title}
            </Text>
            <Text numberOfLines={1} style={styles.songArtist}>
              {currentSong.artist}
            </Text>
          </View>

          <View style={styles.progressWrap}>
            <Slider
              maximumTrackTintColor="rgba(255,255,255,0.16)"
              minimumTrackTintColor={colors.cyan}
              onSlidingComplete={(value: number) => {
                void nativeAudioController.seekTo(value);
              }}
              thumbTintColor={colors.cyan}
              value={progress}
              maximumValue={Math.max(duration, 1)}
              minimumValue={0}
            />
            <View style={styles.progressMeta}>
              <Text style={styles.progressText}>{formatClock(progress)}</Text>
              <Text style={styles.progressText}>{formatClock(duration)}</Text>
            </View>
          </View>

          <View style={styles.transport}>
            <Pressable onPress={toggleShuffle} style={styles.transportButton}>
              <Ionicons
                color={isShuffle ? colors.cyan : colors.muted}
                name="shuffle"
                size={20}
              />
            </Pressable>
            <Pressable onPress={playPrev} style={styles.transportButton}>
              <Ionicons color={colors.text} name="play-skip-back" size={28} />
            </Pressable>
            <Pressable onPress={() => setIsPlaying(!isPlaying)} style={styles.transportPlay}>
              <Ionicons
                color={colors.text}
                name={isLoadingTrack ? "hourglass-outline" : isPlaying ? "pause" : "play"}
                size={28}
              />
            </Pressable>
            <Pressable onPress={playNext} style={styles.transportButton}>
              <Ionicons color={colors.text} name="play-skip-forward" size={28} />
            </Pressable>
            <Pressable onPress={cycleRepeat} style={styles.transportButton}>
              <Ionicons
                color={repeatMode === "off" ? colors.muted : colors.cyan}
                name={repeatMode === "one" ? "repeat-outline" : "repeat"}
                size={20}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={async () => {
              const optimistic = !currentSong.liked;
              updateLike(currentSong.id, optimistic);
              try {
                const liked = await toggleLikeSong(currentSong.id);
                updateLike(currentSong.id, liked);
              } catch {
                updateLike(currentSong.id, currentSong.liked);
                useToastStore.getState().addToast("Failed to update favorite", "error");
              }
            }}
            style={styles.likeButton}
          >
            <Ionicons
              color={currentSong.liked ? colors.rose : colors.muted}
              name={currentSong.liked ? "heart" : "heart-outline"}
              size={18}
            />
            <Text style={styles.likeText}>{currentSong.liked ? "Liked" : "Add to favorites"}</Text>
          </Pressable>

          <View style={styles.queueCard}>
            <Text style={styles.queueTitle}>Queue</Text>
            <ScrollView contentContainerStyle={styles.queueList}>
              {queueSongs.map((song, index) => (
                <Pressable
                  key={song.id}
                  onPress={() => usePlayerStore.getState().playAtIndex(queue[index])}
                  style={[
                    styles.queueItem,
                    index === currentQueuePos ? styles.queueItemActive : null
                  ]}
                >
                  <Text numberOfLines={1} style={styles.queueSongTitle}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.queueSongArtist}>
                    {song.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <VideoModal
        onClose={closeVideo}
        title={currentSong.title}
        videoId={video.videoId}
        visible={video.visible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  miniBar: {
    alignItems: "center",
    backgroundColor: "rgba(4,7,13,0.97)",
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    left: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: "absolute",
    right: 12,
    zIndex: 50
  },
  miniCopy: {
    flex: 1
  },
  miniTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  miniArtist: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3
  },
  miniActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  miniIcon: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 34
  },
  miniPlay: {
    alignItems: "center",
    backgroundColor: colors.cyanSoft,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  fullscreen: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: 18
  },
  dragHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    height: 5,
    marginBottom: 18,
    width: 44
  },
  fullHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  headerIcon: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  heroArtwork: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 34,
    borderWidth: 1,
    height: 280,
    justifyContent: "center",
    marginTop: 28
  },
  songMeta: {
    marginTop: 24
  },
  songTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800"
  },
  songArtist: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 8
  },
  progressWrap: {
    marginTop: 22
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressText: {
    color: colors.muted,
    fontSize: 12
  },
  transport: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18
  },
  transportButton: {
    alignItems: "center",
    height: 52,
    justifyContent: "center",
    width: 52
  },
  transportPlay: {
    alignItems: "center",
    backgroundColor: colors.cyanSoft,
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    width: 68
  },
  likeButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 18
  },
  likeText: {
    color: colors.muted,
    fontSize: 13
  },
  queueCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    marginBottom: 32,
    marginTop: 22,
    padding: 14
  },
  queueTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10
  },
  queueList: {
    gap: 8,
    paddingBottom: 12
  },
  queueItem: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  queueItemActive: {
    backgroundColor: colors.cyanSoft
  },
  queueSongTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  queueSongArtist: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3
  }
});
