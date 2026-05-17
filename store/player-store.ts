import { create } from "zustand";
import type { DbSong } from "@/lib/types";

export type RepeatMode = "off" | "all" | "one";

type PlayerStore = {
  songs: DbSong[];
  queue: number[];         // indices into songs[]
  currentQueuePos: number; // position within queue (-1 = nothing playing)
  isPlaying: boolean;
  showVideo: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  currentSong: DbSong | null;
  showQueue: boolean;

  initPlaylist: (songs: DbSong[]) => void;
  playAtIndex: (songIndex: number) => void;
  playNext: () => void;
  playPrev: () => void;
  setIsPlaying: (v: boolean) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleVideo: () => void;
  toggleQueue: () => void;
  updateLike: (songId: string, liked: boolean) => void;
  updateSongVideoId: (songId: string, videoId: string, url: string | null, thumbnail: string | null) => void;
  addSong: (song: DbSong) => void;
  removeSong: (songId: string) => void;
};

function makeDefaultQueue(count: number) {
  return Array.from({ length: count }, (_, i) => i);
}

function shuffleKeepFirst(arr: number[], first: number): number[] {
  const rest = arr.filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  songs: [],
  queue: [],
  currentQueuePos: -1,
  isPlaying: false,
  showVideo: false,
  showQueue: false,
  isShuffle: false,
  repeatMode: "off",
  currentSong: null,

  initPlaylist(songs) {
    set({
      songs,
      queue: makeDefaultQueue(songs.length),
      currentQueuePos: -1,
      isPlaying: false,
      currentSong: null,
    });
  },

  playAtIndex(songIndex) {
    const { queue, songs } = get();
    let queuePos = queue.indexOf(songIndex);
    if (queuePos < 0) queuePos = 0;
    set({ currentQueuePos: queuePos, isPlaying: true, currentSong: songs[songIndex] ?? null });
  },

  playNext() {
    const { queue, currentQueuePos, repeatMode, songs } = get();
    if (queue.length === 0) return;

    if (repeatMode === "one") {
      // Re-trigger the same song by resetting currentSong reference
      set((s) => ({ currentSong: s.currentSong ? { ...s.currentSong } : null, isPlaying: true }));
      return;
    }

    const next = currentQueuePos + 1;
    if (next >= queue.length) {
      if (repeatMode === "all") {
        set({ currentQueuePos: 0, currentSong: songs[queue[0]] ?? null, isPlaying: true });
      } else {
        set({ isPlaying: false });
      }
      return;
    }

    set({ currentQueuePos: next, currentSong: songs[queue[next]] ?? null, isPlaying: true });
  },

  playPrev() {
    const { queue, currentQueuePos, songs } = get();
    if (queue.length === 0) return;
    const prev = Math.max(0, currentQueuePos - 1);
    set({ currentQueuePos: prev, currentSong: songs[queue[prev]] ?? null, isPlaying: true });
  },

  setIsPlaying(v) {
    set({ isPlaying: v });
  },

  toggleShuffle() {
    const { isShuffle, queue, currentQueuePos, songs } = get();
    if (isShuffle) {
      const currentSongIndex = queue[currentQueuePos] ?? 0;
      const newQueue = makeDefaultQueue(songs.length);
      const newPos = newQueue.indexOf(currentSongIndex);
      set({ isShuffle: false, queue: newQueue, currentQueuePos: newPos >= 0 ? newPos : 0 });
    } else {
      const currentSongIndex = queue[currentQueuePos] ?? 0;
      const newQueue = shuffleKeepFirst(makeDefaultQueue(songs.length), currentSongIndex);
      set({ isShuffle: true, queue: newQueue, currentQueuePos: 0 });
    }
  },

  cycleRepeat() {
    const { repeatMode } = get();
    const next: RepeatMode =
      repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    set({ repeatMode: next });
  },

  toggleVideo() {
    set((s) => ({ showVideo: !s.showVideo }));
  },

  toggleQueue() {
    set((s) => ({ showQueue: !s.showQueue }));
  },

  updateSongVideoId(songId, videoId, url, thumbnail) {
    set((s) => ({
      songs: s.songs.map((song) =>
        song.id === songId
          ? { ...song, youtube_video_id: videoId, youtube_url: url, thumbnail: thumbnail ?? song.thumbnail }
          : song
      ),
      currentSong:
        s.currentSong?.id === songId
          ? { ...s.currentSong, youtube_video_id: videoId, youtube_url: url, thumbnail: thumbnail ?? s.currentSong.thumbnail }
          : s.currentSong,
    }));
  },

  updateLike(songId, liked) {
    set((s) => ({
      songs: s.songs.map((song) => (song.id === songId ? { ...song, liked } : song)),
      currentSong:
        s.currentSong?.id === songId ? { ...s.currentSong, liked } : s.currentSong,
    }));
  },

  addSong(song) {
    set((s) => ({
      songs: [...s.songs, song],
      queue: [...s.queue, s.songs.length],
    }));
  },

  removeSong(songId) {
    const { songs, queue, currentQueuePos, currentSong } = get();
    const songIndex = songs.findIndex((s) => s.id === songId);
    if (songIndex < 0) return;

    const newSongs = songs.filter((_, i) => i !== songIndex);
    // Remove queue entries pointing to removed song, shift down higher indices
    const newQueue = queue
      .filter((i) => i !== songIndex)
      .map((i) => (i > songIndex ? i - 1 : i));

    // Adjust currentQueuePos if needed
    const removedQueueIdx = queue.indexOf(songIndex);
    let newQueuePos = currentQueuePos;
    if (removedQueueIdx >= 0 && removedQueueIdx < currentQueuePos) {
      newQueuePos = currentQueuePos - 1;
    }
    newQueuePos = Math.max(0, Math.min(newQueuePos, newQueue.length - 1));

    const newCurrentSong =
      currentSong?.id === songId
        ? newQueue.length > 0
          ? newSongs[newQueue[newQueuePos]] ?? null
          : null
        : currentSong;

    set({
      songs: newSongs,
      queue: newQueue,
      currentQueuePos: newQueue.length > 0 ? newQueuePos : -1,
      currentSong: newCurrentSong,
    });
  },
}));
