import { getRequiredEnv } from "@/lib/env";

type SpotifyClientCredentialsToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type SpotifyPlaylistDetailsResponse = {
  id: string;
  name: string;
};

type SpotifyTracksResponse = {
  items: Array<{
    track: {
      name: string;
      artists: Array<{ name: string }>;
    } | null;
  }>;
  next: string | null;
};

export function extractSpotifyPlaylistId(input: string) {
  const raw = input.trim();

  if (!raw) {
    return null;
  }

  // Direct playlist ID (22 characters)
  if (/^[a-zA-Z0-9]{22}$/.test(raw)) {
    return raw;
  }

  // Extract from URL
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

/** Get Spotify access token using client credentials (no user login needed) */
export async function getSpotifyToken() {
  const clientId = getRequiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SPOTIFY_CLIENT_SECRET");
  
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[getSpotifyToken] Failed:", response.status, text);
    throw new Error(`Spotify token error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as SpotifyClientCredentialsToken;
  return data.access_token;
}

/** Fetch playlist details (name, ID) */
export async function fetchSpotifyPlaylistDetails(playlistId: string) {
  const token = await getSpotifyToken();
  
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    {
      headers: { "Authorization": `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(`[fetchSpotifyPlaylistDetails] Failed:`, response.status, text);
    throw new Error(`Failed to fetch Spotify playlist ${playlistId}: ${response.status} ${text}`);
  }

  const data = (await response.json()) as SpotifyPlaylistDetailsResponse;
  return {
    id: data.id,
    name: data.name,
  };
}

/** Fetch playlist tracks in "Song - Artist" format for YouTube search */
export async function getPlaylistTracks(playlistId: string): Promise<string[]> {
  const token = await getSpotifyToken();
  const tracks: string[] = [];
  
  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(name,artists(name))),next`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[getPlaylistTracks] Failed:`, response.status, text);
      throw new Error(`Failed to fetch tracks for playlist ${playlistId}: ${response.status} ${text}`);
    }

    const data = (await response.json()) as SpotifyTracksResponse;

    // Extract track names in "Song - Artist" format
    tracks.push(
      ...data.items
        .filter((item) => item.track)
        .map((item) => `${item.track!.name} - ${item.track!.artists[0]?.name ?? "Unknown"}`)
    );

    nextUrl = data.next;
  }

  console.log(`[getPlaylistTracks] Found ${tracks.length} tracks for ${playlistId}`);
  return tracks;
}
