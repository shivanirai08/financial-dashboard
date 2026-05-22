import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addSongToPlaylist, deletePlaylist, fetchPlaylistBySlug, renamePlaylist } from "@/lib/api";
import { SongRow } from "@/components/SongRow";
import { SongSearchModal } from "@/components/SongSearchModal";
import { usePlayerStore } from "@/store/player-store";
import { colors } from "@/theme";
import type { DbPlaylist, DbSong, YoutubeSearchItem } from "@/types";
import type { RootStackParamList } from "../../App";
import { useToastStore } from "@/store/toast-store";

type Route = RouteProp<RootStackParamList, "Playlist">;
type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function PlaylistScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const [playlist, setPlaylist] = useState<DbPlaylist | null>(null);
  const [songs, setSongs] = useState<DbSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSong, setShowAddSong] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [renaming, setRenaming] = useState(false);

  const addSong = usePlayerStore((state) => state.addSong);

  const loadPage = useCallback(async () => {
    const data = await fetchPlaylistBySlug(route.params.slug);
    setPlaylist(data.playlist);
    setSongs(data.songs);
  }, [route.params.slug]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadPage()
        .catch(() => {
          useToastStore.getState().addToast("Failed to load playlist", "error");
        })
        .finally(() => setLoading(false));
    }, [loadPage])
  );

  async function handleRename() {
    if (!playlist || !nameInput.trim()) return;
    setRenaming(true);
    try {
      const next = await renamePlaylist(playlist.id, nameInput.trim());
      setPlaylist(next);
      setEditing(false);
      useToastStore.getState().addToast("Playlist renamed", "success");
    } catch {
      useToastStore.getState().addToast("Failed to rename playlist", "error");
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    if (!playlist) return;
    Alert.alert("Delete playlist?", "This removes the playlist and all its songs.", [
      { text: "Cancel", style: "cancel" },
      {
        style: "destructive",
        text: "Delete",
        onPress: async () => {
          try {
            await deletePlaylist(playlist.id);
            useToastStore.getState().addToast("Playlist deleted", "success");
            navigation.goBack();
          } catch {
            useToastStore.getState().addToast("Failed to delete playlist", "error");
          }
        }
      }
    ]);
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={styles.loader}>
        <Text style={{ color: colors.text }}>Playlist not found.</Text>
      </View>
    );
  }

  const matchedCount = songs.filter((song) => song.youtube_video_id).length;

  return (
    <>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 10, 24) }]}>
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
              <Ionicons color={colors.text} name="arrow-back" size={18} />
            </Pressable>
            <View style={styles.headerActions}>
              <Pressable onPress={() => setShowAddSong(true)} style={styles.addButton}>
                <Ionicons color={colors.cyan} name="add" size={18} />
                <Text style={styles.addButtonText}>Add song</Text>
              </Pressable>
              <Pressable onPress={handleDelete} style={styles.headerButton}>
                <Ionicons color={colors.rose} name="trash-outline" size={18} />
              </Pressable>
            </View>
          </View>

          <Text style={styles.headerKicker}>Playlist</Text>
          {editing ? (
            <View style={styles.editRow}>
              <TextInput
                onChangeText={setNameInput}
                placeholder="Playlist name"
                placeholderTextColor="#64748b"
                style={styles.editInput}
                value={nameInput}
              />
              <Pressable disabled={renaming} onPress={handleRename} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>{renaming ? "..." : "Save"}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.titleRow}>
              <Text style={styles.title}>{playlist.name}</Text>
              <Pressable
                onPress={() => {
                  setNameInput(playlist.name);
                  setEditing(true);
                }}
              >
                <Ionicons color={colors.muted} name="create-outline" size={18} />
              </Pressable>
            </View>
          )}
          <Text style={styles.meta}>
            {songs.length} songs · {matchedCount} matched on YouTube · {new Date(playlist.created_at).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.songList}>
          {songs.length === 0 ? (
            <Text style={styles.empty}>No songs in this playlist yet.</Text>
          ) : (
            songs.map((song, index) => (
              <SongRow
                index={index}
                key={song.id}
                songs={songs}
                onSongRemoved={(songId) => {
                  const nextSongs = songs.filter((item) => item.id !== songId);
                  setSongs(nextSongs);
                }}
                onSongUpdated={(updatedSong) => {
                  setSongs(songs.map((item) => (item.id === updatedSong.id ? updatedSong : item)));
                }}
                song={song}
              />
            ))
          )}
        </View>
      </ScrollView>

      <SongSearchModal
        confirmLabel="Add"
        initialQuery=""
        onClose={() => setShowAddSong(false)}
        onSelect={async (item: YoutubeSearchItem) => {
          const thumbnail = item.thumbnailUrl ?? `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`;
          const song = await addSongToPlaylist(playlist.id, {
            title: item.title,
            artist: item.artist,
            youtube_video_id: item.videoId,
            youtube_url: item.url,
            thumbnail,
            duration: item.durationSeconds
          });
          setSongs([...songs, song]);
          addSong(song);
          useToastStore.getState().addToast(`Added "${item.title}"`, "success");
        }}
        title="Add Song"
        visible={showAddSong}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loader: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center"
  },
  content: {
    paddingBottom: 190,
    paddingHorizontal: 14,
    paddingTop: 24
  },
  headerCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    padding: 16
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  headerActions: {
    flexDirection: "row",
    gap: 8
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.cyanSoft,
    borderRadius: 16,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12
  },
  addButtonText: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: "700"
  },
  headerKicker: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    marginTop: 14,
    textTransform: "uppercase"
  },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 32,
    marginRight: 12
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10
  },
  songList: {
    gap: 10,
    marginTop: 16
  },
  empty: {
    color: colors.muted,
    fontSize: 14
  },
  editRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  editInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.cyan,
    borderRadius: 14,
    justifyContent: "center",
    minWidth: 64,
    paddingVertical: 12
  },
  saveButtonText: {
    color: colors.bgDeep,
    fontSize: 13,
    fontWeight: "800"
  }
});
