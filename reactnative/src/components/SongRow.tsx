import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { removeSong, toggleLikeSong, updateSongYoutubeMatch } from "@/lib/api";
import { usePlayerStore } from "@/store/player-store";
import { useToastStore } from "@/store/toast-store";
import { colors } from "@/theme";
import type { DbSong } from "@/types";
import { SongSearchModal } from "@/components/SongSearchModal";

type Props = {
  song: DbSong;
  index: number;
  onSongUpdated: (song: DbSong) => void;
  onSongRemoved: (songId: string) => void;
};

export function SongRow({ song, index, onSongUpdated, onSongRemoved }: Props) {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playAtIndex = usePlayerStore((state) => state.playAtIndex);
  const openVideo = usePlayerStore((state) => state.openVideo);
  const updateLike = usePlayerStore((state) => state.updateLike);
  const updateSongVideoId = usePlayerStore((state) => state.updateSongVideoId);
  const removeSongFromStore = usePlayerStore((state) => state.removeSong);

  const [menuOpen, setMenuOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isActive = currentSong?.id === song.id;
  const hasVideo = Boolean(song.youtube_video_id);

  const cardStyle = useMemo(
    () => [
      styles.card,
      isActive ? styles.cardActive : null,
      removing ? styles.cardRemoving : null
    ],
    [isActive, removing]
  );

  function handlePlay() {
    if (!hasVideo) return;
    playAtIndex(index);
  }

  async function handleLike() {
    if (likeLoading) return;
    const optimistic = !song.liked;
    setLikeLoading(true);
    updateLike(song.id, optimistic);
    onSongUpdated({ ...song, liked: optimistic });
    try {
      const liked = await toggleLikeSong(song.id);
      updateLike(song.id, liked);
      onSongUpdated({ ...song, liked });
    } catch {
      updateLike(song.id, song.liked);
      onSongUpdated(song);
      useToastStore.getState().addToast("Failed to update favorite", "error");
    } finally {
      setLikeLoading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeSong(song.id);
      removeSongFromStore(song.id);
      onSongRemoved(song.id);
      useToastStore.getState().addToast("Song removed", "success");
    } catch {
      setRemoving(false);
      useToastStore.getState().addToast("Failed to remove song", "error");
    } finally {
      setMenuOpen(false);
    }
  }

  return (
    <>
      <Pressable onPress={handlePlay} style={cardStyle}>
        <View style={styles.thumb}>
          <Ionicons
            color={isActive ? colors.cyan : colors.muted}
            name={isActive && isPlaying ? "pause" : "play"}
            size={18}
          />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.title, isActive && styles.titleActive]}>
            {song.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {song.artist}
          </Text>
          {!hasVideo ? <Text style={styles.noMatch}>No YouTube match</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable disabled={likeLoading} onPress={handleLike} style={styles.iconButton}>
            {likeLoading ? (
              <ActivityIndicator color={colors.cyan} size="small" />
            ) : (
              <Ionicons
                color={song.liked ? colors.rose : colors.muted}
                name={song.liked ? "heart" : "heart-outline"}
                size={18}
              />
            )}
          </Pressable>
          {hasVideo ? (
            <Pressable
              onPress={() => openVideo(song.youtube_video_id!)}
              style={styles.iconButton}
            >
              <Ionicons color={colors.muted} name="videocam-outline" size={18} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setMenuOpen(true)} style={styles.iconButton}>
            <Ionicons color={colors.muted} name="ellipsis-vertical" size={18} />
          </Pressable>
        </View>
      </Pressable>

      <Modal animationType="fade" transparent visible={menuOpen} onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>{song.title}</Text>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                setFixOpen(true);
              }}
              style={styles.menuItem}
            >
              <Ionicons color={colors.muted} name="search-outline" size={18} />
              <Text style={styles.menuItemText}>Change YouTube match</Text>
            </Pressable>
            <Pressable onPress={handleRemove} style={styles.menuItem}>
              <Ionicons color={colors.rose} name="trash-outline" size={18} />
              <Text style={[styles.menuItemText, { color: colors.rose }]}>Remove song</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SongSearchModal
        confirmLabel="Use"
        initialQuery={`${song.title} ${song.artist}`.trim()}
        onClose={() => setFixOpen(false)}
        onSelect={async (item) => {
          const thumbnail = item.thumbnailUrl ?? `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`;
          const updated = await updateSongYoutubeMatch(song.id, {
            youtube_video_id: item.videoId,
            youtube_url: item.url,
            thumbnail
          });
          updateSongVideoId(song.id, item.videoId, item.url, thumbnail);
          onSongUpdated(updated);
          useToastStore.getState().addToast("Song linked to YouTube", "success");
        }}
        title="Link to YouTube"
        visible={fixOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  cardActive: {
    backgroundColor: colors.cyanSoft,
    borderColor: "rgba(34, 211, 238, 0.35)"
  },
  cardRemoving: {
    opacity: 0.4
  },
  thumb: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  copy: {
    flex: 1
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  titleActive: {
    color: colors.cyan
  },
  artist: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4
  },
  noMatch: {
    color: colors.rose,
    fontSize: 11,
    marginTop: 6
  },
  actions: {
    flexDirection: "row",
    gap: 4
  },
  iconButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36
  },
  menuBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  menuSheet: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    width: "100%"
  },
  menuTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10
  },
  menuItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12
  },
  menuItemText: {
    color: colors.text,
    fontSize: 14
  }
});
