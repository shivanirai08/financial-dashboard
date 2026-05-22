import { create } from "zustand";
import type { DbSong } from "@/types";

export type RepeatMode = "off" | "all" | "one";

type VideoState = {
  visible: boolean;
  videoId: string | null;
};

type PlayerStore = {
  songs: DbSong[];
  queue: number[];
  currentQueuePos: number;
  currentSong: DbSong | null;
  isPlaying: boolean;
  isLoadingTrack: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  progress: number;
  duration: number;
  video: VideoState;
  initPlaylist: (songs: DbSong[]) => void;
  playAtIndex: (songIndex: number) => void;
  playNext: () => void;
  playPrev: () => void;
  setIsPlaying: (value: boolean) => void;
  setIsLoadingTrack: (value: boolean) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setProgressState: (progress: number, duration: number) => void;
  updateLike: (songId: string, liked: boolean) => void;
  updateSongVideoId: (
    songId: string,
    videoId: string,
    url: string | null,
    thumbnail: string | null
  ) => void;
  addSong: (song: DbSong) => void;
  removeSong: (songId: string) => void;
  openVideo: (videoId: string) => void;
  closeVideo: () => void;
};

function makeDefaultQueue(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

function shuffleKeepFirst(arr: number[], first: number) {
  const rest = arr.filter((item) => item !== first);
  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [rest[index], rest[swapIndex]] = [rest[swapIndex], rest[index]];
  }
  return [first, ...rest];
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  songs: [],
  queue: [],
  currentQueuePos: -1,
  currentSong: null,
  isPlaying: false,
  isLoadingTrack: false,
  isShuffle: false,
  repeatMode: "off",
  progress: 0,
  duration: 0,
  video: { visible: false, videoId: null },

  initPlaylist(songs) {
    set({
      songs,
      queue: makeDefaultQueue(songs.length),
      currentQueuePos: -1,
      currentSong: null,
      isPlaying: false,
      isLoadingTrack: false,
      progress: 0,
      duration: 0
    });
  },

  playAtIndex(songIndex) {
    const { queue, songs } = get();
    let queuePos = queue.indexOf(songIndex);
    if (queuePos < 0) {
      queuePos = 0;
    }
    set({
      currentQueuePos: queuePos,
      currentSong: songs[songIndex] ?? null,
      isPlaying: true,
      isLoadingTrack: true,
      progress: 0,
      duration: 0
    });
  },

  playNext() {
    const { queue, currentQueuePos, repeatMode, songs } = get();
    if (queue.length === 0) return;

    if (repeatMode === "one") {
      set((state) => ({
        currentSong: state.currentSong ? { ...state.currentSong } : null,
        isPlaying: true,
        isLoadingTrack: true,
        progress: 0,
        duration: 0
      }));
      return;
    }

    const next = currentQueuePos + 1;
    if (next >= queue.length) {
      if (repeatMode === "all") {
        set({
          currentQueuePos: 0,
          currentSong: songs[queue[0]] ?? null,
          isPlaying: true,
          isLoadingTrack: true,
          progress: 0,
          duration: 0
        });
      } else {
        set({ isPlaying: false, progress: 0 });
      }
      return;
    }

    set({
      currentQueuePos: next,
      currentSong: songs[queue[next]] ?? null,
      isPlaying: true,
      isLoadingTrack: true,
      progress: 0,
      duration: 0
    });
  },

  playPrev() {
    const { queue, currentQueuePos, songs } = get();
    if (queue.length === 0) return;
    const prev = Math.max(0, currentQueuePos - 1);
    set({
      currentQueuePos: prev,
      currentSong: songs[queue[prev]] ?? null,
      isPlaying: true,
      isLoadingTrack: true,
      progress: 0,
      duration: 0
    });
  },

  setIsPlaying(value) {
    set({ isPlaying: value });
  },

  setIsLoadingTrack(value) {
    set({ isLoadingTrack: value });
  },

  toggleShuffle() {
    const { isShuffle, queue, currentQueuePos, songs } = get();
    if (isShuffle) {
      const currentSongIndex = queue[currentQueuePos] ?? 0;
      const newQueue = makeDefaultQueue(songs.length);
      set({
        isShuffle: false,
        queue: newQueue,
        currentQueuePos: newQueue.indexOf(currentSongIndex)
      });
      return;
    }

    const currentSongIndex = queue[currentQueuePos] ?? 0;
    set({
      isShuffle: true,
      queue: shuffleKeepFirst(makeDefaultQueue(songs.length), currentSongIndex),
      currentQueuePos: 0
    });
  },

  cycleRepeat() {
    const { repeatMode } = get();
    set({
      repeatMode:
        repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off"
    });
  },

  setProgressState(progress, duration) {
    set({ progress, duration });
  },

  updateLike(songId, liked) {
    set((state) => ({
      songs: state.songs.map((song) => (song.id === songId ? { ...song, liked } : song)),
      currentSong:
        state.currentSong?.id === songId
          ? { ...state.currentSong, liked }
          : state.currentSong
    }));
  },

  updateSongVideoId(songId, videoId, url, thumbnail) {
    set((state) => ({
      songs: state.songs.map((song) =>
        song.id === songId
          ? {
              ...song,
              youtube_video_id: videoId,
              youtube_url: url,
              thumbnail: thumbnail ?? song.thumbnail
            }
          : song
      ),
      currentSong:
        state.currentSong?.id === songId
          ? {
              ...state.currentSong,
              youtube_video_id: videoId,
              youtube_url: url,
              thumbnail: thumbnail ?? state.currentSong.thumbnail
            }
          : state.currentSong
    }));
  },

  addSong(song) {
    set((state) => ({
      songs: [...state.songs, song],
      queue: [...state.queue, state.songs.length]
    }));
  },

  removeSong(songId) {
    const { songs, queue, currentQueuePos, currentSong } = get();
    const songIndex = songs.findIndex((song) => song.id === songId);
    if (songIndex < 0) return;

    const newSongs = songs.filter((_, index) => index !== songIndex);
    const newQueue = queue
      .filter((item) => item !== songIndex)
      .map((item) => (item > songIndex ? item - 1 : item));
    const removedQueueIndex = queue.indexOf(songIndex);
    let newQueuePos = currentQueuePos;
    if (removedQueueIndex >= 0 && removedQueueIndex < currentQueuePos) {
      newQueuePos = currentQueuePos - 1;
    }
    newQueuePos = Math.max(0, Math.min(newQueuePos, newQueue.length - 1));

    set({
      songs: newSongs,
      queue: newQueue,
      currentQueuePos: newQueue.length ? newQueuePos : -1,
      currentSong:
        currentSong?.id === songId
          ? newQueue.length
            ? newSongs[newQueue[newQueuePos]] ?? null
            : null
          : currentSong
    });
  },

  openVideo(videoId) {
    set({ video: { visible: true, videoId } });
  },

  closeVideo() {
    set({ video: { visible: false, videoId: null } });
  }
}));
