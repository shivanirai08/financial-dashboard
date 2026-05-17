/** Minimal YouTube IFrame Player API type declarations. */

declare namespace YT {
  const enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: number;
  }

  interface PlayerVars {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    rel?: 0 | 1;
    modestbranding?: 0 | 1;
    playsinline?: 0 | 1;
  }

  interface PlayerOptions {
    videoId?: string;
    width?: number | string;
    height?: number | string;
    playerVars?: PlayerVars;
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: PlayerEvent) => void;
    };
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    loadVideoById(videoId: string): void;
    cueVideoById(videoId: string): void;
    getCurrentTime(): number;
    getDuration(): number;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    getPlayerState(): number;
    destroy(): void;
  }
}

interface Window {
  YT: typeof YT;
  onYouTubeIframeAPIReady: () => void;
}
