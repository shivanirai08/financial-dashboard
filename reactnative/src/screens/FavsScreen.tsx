import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { fetchLikedSongs } from "@/lib/api";
import { SongRow } from "@/components/SongRow";
import { usePlayerStore } from "@/store/player-store";
import { colors } from "@/theme";
import type { DbSong } from "@/types";
import { useToastStore } from "@/store/toast-store";

export function FavsScreen() {
  const [songs, setSongs] = useState<DbSong[]>([]);
  const [loading, setLoading] = useState(true);
  const initPlaylist = usePlayerStore((state) => state.initPlaylist);

  const loadSongs = useCallback(async () => {
    const nextSongs = await fetchLikedSongs();
    setSongs(nextSongs);
    initPlaylist(nextSongs);
  }, [initPlaylist]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadSongs()
        .catch(() => {
          useToastStore.getState().addToast("Failed to load favorites", "error");
        })
        .finally(() => setLoading(false));
    }, [loadSongs])
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Favorites</Text>
        <Text style={styles.title}>Liked Songs</Text>
        <Text style={styles.body}>Everything you marked with a heart across playlists.</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
      ) : songs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No liked songs yet.</Text>
          <Text style={styles.emptyHint}>Tap the heart on any song to add it here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {songs.map((song, index) => (
            <SongRow
              index={index}
              key={song.id}
              onSongRemoved={(songId) => {
                const nextSongs = songs.filter((item) => item.id !== songId);
                setSongs(nextSongs);
                initPlaylist(nextSongs);
              }}
              onSongUpdated={(updatedSong) => {
                const nextSongs = songs.map((item) => (item.id === updatedSong.id ? updatedSong : item));
                setSongs(nextSongs);
                initPlaylist(nextSongs);
              }}
              song={song}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 190,
    paddingHorizontal: 14,
    paddingTop: 20
  },
  header: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    padding: 18
  },
  kicker: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 8
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 18,
    padding: 20
  },
  emptyText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  emptyHint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6
  },
  list: {
    gap: 10,
    marginTop: 18
  }
});
