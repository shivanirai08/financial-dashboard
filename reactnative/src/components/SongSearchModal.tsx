import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { searchYoutube } from "@/lib/api";
import type { YoutubeSearchItem } from "@/types";
import { colors } from "@/theme";
import { formatDuration } from "@/utils/format";
import { useToastStore } from "@/store/toast-store";

type Props = {
  visible: boolean;
  title: string;
  initialQuery: string;
  confirmLabel: string;
  onClose: () => void;
  onSelect: (item: YoutubeSearchItem) => Promise<void> | void;
};

export function SongSearchModal({
  visible,
  title,
  initialQuery,
  confirmLabel,
  onClose,
  onSelect
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<YoutubeSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setResults([]);
      setSavingId(null);
    }
  }, [initialQuery, visible]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const items = await searchYoutube(query.trim(), 10);
      setResults(items);
    } catch {
      useToastStore.getState().addToast("Search failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(item: YoutubeSearchItem) {
    setSavingId(item.videoId);
    try {
      await onSelect(item);
      onClose();
    } catch (error) {
      useToastStore.getState().addToast(
        error instanceof Error ? error.message : "Action failed",
        "error"
      );
      setSavingId(null);
    }
  }

  return (
    <Modal animationType="slide" visible={visible} transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              placeholder="Search YouTube..."
              placeholderTextColor="#64748b"
              style={styles.input}
              value={query}
            />
            <Pressable onPress={handleSearch} style={styles.searchButton}>
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Ionicons name="search" size={18} color={colors.text} />
              )}
            </Pressable>
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.videoId}
            ListEmptyComponent={
              loading ? null : <Text style={styles.empty}>Search YouTube to find the right video</Text>
            }
            renderItem={({ item }: { item: YoutubeSearchItem }) => (
              <Pressable onPress={() => handleSelect(item)} style={styles.resultRow}>
                <View style={styles.resultCopy}>
                  <Text numberOfLines={1} style={styles.resultTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.resultArtist}>
                    {item.artist}
                  </Text>
                </View>
                <Text style={styles.resultDuration}>{formatDuration(item.durationSeconds)}</Text>
                <View style={styles.resultAction}>
                  {savingId === item.videoId ? (
                    <ActivityIndicator color={colors.cyan} />
                  ) : (
                    <Text style={styles.resultActionText}>{confirmLabel}</Text>
                  )}
                </View>
              </Pressable>
            )}
            style={styles.results}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.76)",
    flex: 1,
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    minHeight: "60%",
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  searchButton: {
    alignItems: "center",
    backgroundColor: colors.cyan,
    borderRadius: 16,
    justifyContent: "center",
    width: 52
  },
  results: {
    flex: 1
  },
  resultRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  resultCopy: {
    flex: 1
  },
  resultTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600"
  },
  resultArtist: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4
  },
  resultDuration: {
    color: colors.muted,
    fontSize: 12
  },
  resultAction: {
    minWidth: 44
  },
  resultActionText: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: "700"
  },
  empty: {
    color: colors.muted,
    marginTop: 28,
    textAlign: "center"
  }
});
