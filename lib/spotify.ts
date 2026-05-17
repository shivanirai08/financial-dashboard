import crypto from "node:crypto";
import { getRequiredEnv } from "@/lib/env";
import type { SpotifyToken } from "@/lib/types";

type SpotifyPlaylistResponse = {
  items: Array<{
    id: string;
    name: string;
  }>;
  next: string | null;
};

type SpotifyTracksResponse = {
  items: Array<{
    track: {
      id: string | null;
      name: string;
      album: { name: string };
      artists: Array<{ name: string }>;
    } | null;
  }>;
  next: string | null;
};

type SpotifyClientCredentialsToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type SpotifyPlaylistDetailsResponse = {
  id: string;
  name: string;
};

export function createSpotifyState() {
  return crypto.randomBytes(24).toString("hex");
}

export async function exchangeSpotifyCode(code: string): Promise<SpotifyToken> {
  const clientId = getRequiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SPOTIFY_CLIENT_SECRET");
  const redirectUri = getRequiredEnv("SPOTIFY_REDIRECT_URI");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Spotify authorization code.");
  }

  return response.json();
}

export function extractSpotifyPlaylistId(input: string) {
  const raw = input.trim();

  if (!raw) {
    return null;
  }

  if (/^[a-zA-Z0-9]{22}$/.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const playlistIndex = segments.findIndex((segment) => segment === "playlist");
    const candidate = playlistIndex >= 0 ? segments[playlistIndex + 1] : null;

    if (candidate && /^[a-zA-Z0-9]{22}$/.test(candidate)) {
      return candidate;
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchSpotifyAppAccessToken() {
  const clientId = getRequiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SPOTIFY_CLIENT_SECRET");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to get Spotify app access token.");
  }

  const data = (await response.json()) as SpotifyClientCredentialsToken;
  return data.access_token;
}

export async function fetchSpotifyPlaylistDetails(
  accessToken: string,
  playlistId: string,
) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify playlist ${playlistId}.`);
  }

  const data = (await response.json()) as SpotifyPlaylistDetailsResponse;
  return {
    id: data.id,
    name: data.name,
  };
}

export async function refreshSpotifyToken(
  refreshToken: string,
): Promise<SpotifyToken> {
  const clientId = getRequiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SPOTIFY_CLIENT_SECRET");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Spotify token.");
  }

  const refreshed = (await response.json()) as SpotifyToken;
  return {
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? refreshToken,
  };
}

export async function fetchSpotifyPlaylists(accessToken: string) {
  const playlists: Array<{ id: string; name: string }> = [];
  let nextUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Spotify playlists.");
    }

    const data = (await response.json()) as SpotifyPlaylistResponse;
    playlists.push(...data.items.map((item) => ({ id: item.id, name: item.name })));
    nextUrl = data.next;
  }

  return playlists;
}

export async function fetchSpotifyPlaylistTracks(
  accessToken: string,
  playlistId: string,
) {
  const tracks: Array<{
    id: string;
    title: string;
    artist: string;
    album: string;
    spotifyTrackId: string | null;
  }> = [];

  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100` +
    `&fields=items(track(id,name,album(name),artists(name))),next`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tracks for playlist ${playlistId}.`);
    }

    const data = (await response.json()) as SpotifyTracksResponse;

    tracks.push(
      ...data.items
        .filter((item) => item.track)
        .map((item) => ({
          id: item.track?.id ?? crypto.randomUUID(),
          title: item.track?.name ?? "Unknown track",
          artist:
            item.track?.artists.map((artist) => artist.name).join(", ") ??
            "Unknown artist",
          album: item.track?.album.name ?? "Unknown album",
          spotifyTrackId: item.track?.id ?? null,
        })),
    );

    nextUrl = data.next;
  }

  return tracks;
}

export async function fetchSpotifyPlaylistTrackNames(
  accessToken: string,
  playlistId: string,
) {
  const songs: Array<{ title: string; artist: string }> = [];

  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100` +
    `&fields=items(track(name,artists(name))),next`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch track names for playlist ${playlistId}.`);
    }

    const data = (await response.json()) as SpotifyTracksResponse;

    songs.push(
      ...data.items
        .filter((item) => item.track)
        .map((item) => ({
          title: item.track?.name ?? "Unknown track",
          artist:
            item.track?.artists.map((artist) => artist.name).join(", ") ??
            "Unknown artist",
        })),
    );

    nextUrl = data.next;
  }

  return songs;
}
