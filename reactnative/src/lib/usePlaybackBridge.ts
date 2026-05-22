import { useEffect } from "react";
import { nativeAudioController } from "@/lib/playback";
import { usePlayerStore } from "@/store/player-store";
import { useToastStore } from "@/store/toast-store";
import { State } from "react-native-track-player";

export function usePlaybackBridge() {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const queue = usePlayerStore((state) => state.queue);
  const currentQueuePos = usePlayerStore((state) => state.currentQueuePos);
  const songs = usePlayerStore((state) => state.songs);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrev = usePlayerStore((state) => state.playPrev);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setIsLoadingTrack = usePlayerStore((state) => state.setIsLoadingTrack);
  const setProgressState = usePlayerStore((state) => state.setProgressState);

  useEffect(() => {
    void nativeAudioController.init();
    nativeAudioController.setCallbacks({
      onPlayStateChange: (playing, state) => {
        if (playing || state === State.Buffering || state === State.Loading) {
          setIsLoadingTrack(false);
        }
        if (state === State.Paused || state === State.Stopped || state === State.Ended) {
          setIsPlaying(false);
        }
      },
      onTimeUpdate: (progress, duration) => {
        setProgressState(progress, duration);
      },
      onDuration: (duration) => {
        setProgressState(usePlayerStore.getState().progress, duration);
      },
      onEnded: () => {
        setProgressState(0, 0);
        playNext();
      },
      onRemotePlay: () => {
        setIsPlaying(true);
      },
      onRemotePause: () => {
        setIsPlaying(false);
      },
      onRemoteNext: () => {
        playNext();
      },
      onRemotePrev: () => {
        playPrev();
      },
      onError: (error) => {
        setIsLoadingTrack(false);
        useToastStore.getState().addToast(error.message || "Playback failed", "error");
      }
    });

    return () => {
      void nativeAudioController.stop();
    };
  }, [playNext, playPrev, setIsLoadingTrack, setIsPlaying, setProgressState]);

  useEffect(() => {
    if (!currentSong?.youtube_video_id) {
      void nativeAudioController.stop();
      return;
    }

    setIsLoadingTrack(true);
    void nativeAudioController.playSong(currentSong).catch((error: Error) => {
      setIsLoadingTrack(false);
      setIsPlaying(false);
      useToastStore.getState().addToast(error.message || "Failed to play track", "error");
    });
  }, [currentSong?.id, currentSong?.youtube_video_id, setIsLoadingTrack, setIsPlaying]);

  useEffect(() => {
    if (!currentSong) return;
    void nativeAudioController.syncPlaybackState(isPlaying).catch(() => {
      // Playback state sync is best-effort.
    });
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally omits currentSong?.id: song changes are handled by playSong (shouldPlay:true), only user-driven pause/play should sync

  useEffect(() => {
    const nextSongIndex = queue[currentQueuePos + 1];
    const nextSong = nextSongIndex != null ? songs[nextSongIndex] : null;
    nativeAudioController.setNextTrack(nextSong ?? null);
  }, [queue, currentQueuePos, songs]);

  useEffect(() => {
    const state = usePlayerStore.getState();
    if (!state.currentSong && state.isPlaying) {
      setIsPlaying(false);
    }
  }, [currentSong, setIsPlaying]);

}
