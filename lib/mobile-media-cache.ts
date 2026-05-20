"use client";

const MEDIA_CACHE_NAME = "pulsebox-mobile-audio-v1";

class MobileMediaCache {
  private blobUrls = new Map<string, string>();
  private inflight = new Map<string, Promise<string>>();

  private isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "caches" in window &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    );
  }

  private getCacheKey(videoId: string): string {
    if (typeof window === "undefined") {
      return `/__pulsebox_audio__/${videoId}`;
    }

    return new URL(`/__pulsebox_audio__/${videoId}`, window.location.origin).toString();
  }

  private async materializeBlobUrl(videoId: string, response: Response): Promise<string> {
    const existing = this.blobUrls.get(videoId);
    if (existing) {
      return existing;
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const previous = this.blobUrls.get(videoId);
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.blobUrls.set(videoId, blobUrl);
    return blobUrl;
  }

  async getCachedSrc(videoId: string): Promise<string | null> {
    const existing = this.blobUrls.get(videoId);
    if (existing) {
      return existing;
    }

    if (!this.isSupported()) {
      return null;
    }

    const cache = await caches.open(MEDIA_CACHE_NAME);
    const response = await cache.match(this.getCacheKey(videoId));
    if (!response) {
      return null;
    }

    return this.materializeBlobUrl(videoId, response);
  }

  async prefetchTrack(videoId: string): Promise<string> {
    const existing = await this.getCachedSrc(videoId);
    if (existing) {
      return existing;
    }

    const inflight = this.inflight.get(videoId);
    if (inflight) {
      return inflight;
    }

    const task = (async () => {
      if (!this.isSupported()) {
        throw new Error("CacheStorage is not supported on this device");
      }

      const response = await fetch(`/api/youtube/audio-mp3/${videoId}/stream?flow=cache`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Media prefetch failed: ${response.status}`);
      }

      const cache = await caches.open(MEDIA_CACHE_NAME);
      await cache.put(this.getCacheKey(videoId), response.clone());
      return this.materializeBlobUrl(videoId, response);
    })();

    this.inflight.set(videoId, task);

    try {
      return await task;
    } finally {
      this.inflight.delete(videoId);
    }
  }
}

export const mobileMediaCache = new MobileMediaCache();
