import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createPlaylist, fetchPlaylists, getPlaylistPreview, searchYoutube, syncSpotifyPublicPlaylist } from "@/lib/api";
import { PlaylistCard } from "@/components/PlaylistCard";
import { VideoModal } from "@/components/VideoModal";
import { colors } from "@/theme";
import type { PlaylistPreview, YoutubeSearchItem } from "@/types";
import type { RootStackParamList } from "../../App";
import { useToastStore } from "@/store/toast-store";
import { usePlayerStore } from "@/store/player-store";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const [playlists, setPlaylists] = useState<Array<{ id: string; name: string; slug: string; created_at: string }>>([]);
  const [likedCount, setLikedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PlaylistPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YoutubeSearchItem[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>("YouTube");

  const startPlaylistAtIndex = usePlayerStore((state) => state.startPlaylistAtIndex);

  const loadData = useCallback(async () => {
    const data = await fetchPlaylists();
    setPlaylists(data.playlists);
    setLikedCount(data.likedCount);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData()
        .catch(() => {
          useToastStore.getState().addToast("Failed to load library", "error");
        })
        .finally(() => setLoading(false));
    }, [loadData])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePreview() {
    if (!input.trim()) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const nextPreview = await getPlaylistPreview(input.trim());
      setPreview(nextPreview);
    } catch (error) {
      useToastStore.getState().addToast(
        error instanceof Error ? error.message : "Preview failed",
        "error"
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSync() {
    if (!input.trim()) return;
    setSyncLoading(true);
    try {
      const playlist = await syncSpotifyPublicPlaylist(input.trim());
      navigation.navigate("Playlist", { slug: playlist.slug });
    } catch (error) {
      useToastStore.getState().addToast(
        error instanceof Error ? error.message : "Sync failed",
        "error"
      );
      setSyncLoading(false);
    }
  }

  async function handleSearch() {
    if (!ytQuery.trim()) return;
    setYtLoading(true);
    try {
      const results = await searchYoutube(ytQuery.trim(), 8);
      setYtResults(results);
    } catch {
      useToastStore.getState().addToast("Search failed", "error");
    } finally {
      setYtLoading(false);
    }
  }

  async function handleCreatePlaylist() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const playlist = await createPlaylist(createName.trim());
      setCreateName("");
      await loadData();
      navigation.navigate("Playlist", { slug: playlist.slug });
    } catch (error) {
      useToastStore.getState().addToast(
        error instanceof Error ? error.message : "Failed to create playlist",
        "error"
      );
      setCreating(false);
    }
  }

  function handleQuickPlay(item: YoutubeSearchItem) {
    startPlaylistAtIndex(
      [
        {
          id: `search-${item.videoId}`,
          playlist_id: "search",
          title: item.title,
          artist: item.artist,
          youtube_video_id: item.videoId,
          youtube_url: item.url,
          thumbnail: item.thumbnailUrl ?? null,
          duration: item.durationSeconds,
          position: 0,
          liked: false,
          created_at: new Date().toISOString()
        }
      ],
      0
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 10, 24) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}
      >
        <LinearGradient colors={[colors.bg, colors.bgDeep]} style={styles.hero}>
          <Text style={styles.kicker}>Pulsebox</Text>
          <Text style={styles.heroTitle}>Your Spotify playlists, now native.</Text>
          <Text style={styles.heroBody}>
            Import public playlists, match tracks to YouTube, and play them with native audio instead of the Chrome media stack.
          </Text>
          <View style={styles.statsCard}>
            <Ionicons color={colors.rose} name="heart" size={18} />
            <Text style={styles.statsText}>{likedCount} liked songs</Text>
          </View>
        </LinearGradient>

        <View style={styles.panel}>
          <Text style={styles.panelKicker}>Spotify Playlist</Text>
          <Text style={styles.panelTitle}>Import and sync a playlist</Text>
          <TextInput
            onChangeText={setInput}
            placeholder="https://open.spotify.com/playlist/..."
            placeholderTextColor="#64748b"
            style={styles.input}
            value={input}
          />
          <View style={styles.row}>
            <Pressable disabled={previewLoading} onPress={handlePreview} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{previewLoading ? "Fetching..." : "Preview"}</Text>
            </Pressable>
            <Pressable disabled={syncLoading} onPress={handleSync} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{syncLoading ? "Syncing..." : "Sync"}</Text>
            </Pressable>
          </View>
          {syncLoading ? (
            <View style={styles.infoBox}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={styles.infoText}>
                Syncing playlist. Matching every track to YouTube can take a few minutes for long playlists.
              </Text>
            </View>
          ) : null}
          {preview ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>{preview.playlistName}</Text>
              <Text style={styles.previewMeta}>{preview.totalSongs} songs</Text>
              {preview.songs.slice(0, 8).map((song, index) => (
                <Text key={`${index}-${song.name}`} style={styles.previewSong}>
                  {index + 1}. {song.name} - {song.artist}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelKicker}>Quick Search</Text>
          <Text style={styles.panelTitle}>Search YouTube directly</Text>
          <View style={styles.searchRow}>
            <TextInput
              onChangeText={setYtQuery}
              placeholder="Song name, artist..."
              placeholderTextColor="#64748b"
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={ytQuery}
            />
            <Pressable onPress={handleSearch} style={styles.secondaryIconButton}>
              {ytLoading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Ionicons color={colors.text} name="search" size={18} />
              )}
            </Pressable>
          </View>
          {ytResults.map((item) => (
            <View key={item.videoId} style={styles.quickRow}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.quickTitle}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.quickArtist}>
                  {item.artist}
                </Text>
              </View>
              <Pressable onPress={() => handleQuickPlay(item)} style={styles.inlineButton}>
                <Text style={styles.inlineButtonText}>Play</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setVideoId(item.videoId);
                  setVideoTitle(item.title);
                }}
                style={styles.inlineButton}
              >
                <Text style={styles.inlineButtonText}>Video</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelKicker}>Create</Text>
          <Text style={styles.panelTitle}>Make an empty playlist</Text>
          <TextInput
            onChangeText={setCreateName}
            placeholder="Playlist name"
            placeholderTextColor="#64748b"
            style={styles.input}
            value={createName}
          />
          <Pressable disabled={creating} onPress={handleCreatePlaylist} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{creating ? "Creating..." : "Create playlist"}</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelKicker}>Library</Text>
          <Text style={styles.panelTitle}>Playlists</Text>
          {loading ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
          ) : playlists.length === 0 ? (
            <Text style={styles.empty}>No playlists yet.</Text>
          ) : (
            <View style={styles.list}>
              {playlists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  name={playlist.name}
                  onPress={() => navigation.navigate("Playlist", { slug: playlist.slug })}
                  subtitle={new Date(playlist.created_at).toLocaleDateString()}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <VideoModal
        onClose={() => setVideoId(null)}
        title={videoTitle}
        videoId={videoId}
        visible={Boolean(videoId)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 190,
    paddingHorizontal: 14,
    paddingTop: 24
  },
  hero: {
    borderRadius: 30,
    overflow: "hidden",
    paddingHorizontal: 22,
    paddingVertical: 24
  },
  kicker: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 38,
    marginTop: 10
  },
  heroBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10
  },
  statsCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  statsText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  panel: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 26,
    borderWidth: 1,
    padding: 16
  },
  panelKicker: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase"
  },
  panelTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 6
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    marginBottom: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.cyan,
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: colors.bgDeep,
    fontSize: 14,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    flex: 1,
    justifyContent: "center",
    minHeight: 48
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  infoBox: {
    alignItems: "flex-start",
    backgroundColor: colors.cyanSoft,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    padding: 12
  },
  infoText: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    lineHeight: 18
  },
  previewCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  previewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  previewMeta: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 10,
    marginTop: 4
  },
  previewSong: {
    color: colors.text,
    fontSize: 12,
    marginBottom: 5
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  secondaryIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  quickRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  quickTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  quickArtist: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4
  },
  inlineButton: {
    backgroundColor: colors.cyanSoft,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  inlineButtonText: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: "700"
  },
  list: {
    gap: 10,
    marginTop: 14
  },
  empty: {
    color: colors.muted,
    marginTop: 14
  }
});
