import { getRequiredEnv } from "@/lib/env";

type JsonRecord = Record<string, unknown>;

const RAPIDAPI_HOST = "spotify-web-api3.p.rapidapi.com";
const RAPIDAPI_PLAYLIST_ENDPOINT =
  "https://spotify-web-api3.p.rapidapi.com/v1/social/spotify/getplaylist";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickPlaylistName(payload: unknown): string {
  if (!isRecord(payload)) {
    return "Unknown Playlist";
  }

  const data = isRecord(payload.data) ? payload.data : undefined;
  const playlistV2 = isRecord(data?.playlistV2) ? data.playlistV2 : undefined;

  const candidates: Array<unknown> = [
    payload.name,
    data?.name,
    (payload.playlist as JsonRecord | undefined)?.name,
    (data?.playlist as JsonRecord | undefined)?.name,
    playlistV2?.name,
    (playlistV2?.title as JsonRecord | undefined)?.text,
    (payload.title as JsonRecord | undefined)?.text,
    (data?.title as JsonRecord | undefined)?.text,
  ];

  for (const candidate of candidates) {
    const name = asNonEmptyString(candidate);
    if (name) {
      return name;
    }
  }

  return "Unknown Playlist";
}

function parseTrackString(item: unknown): string | null {
  if (!isRecord(item)) {
    return null;
  }

  // spotify-web-api3 payload: data.playlistV2.content.items[*].item.data
  const itemNode = isRecord(item.item) ? item.item : item;
  const dataNode = isRecord(itemNode.data) ? itemNode.data : itemNode;
  const base = isRecord(dataNode.track)
    ? dataNode.track
    : isRecord(item.track)
      ? item.track
      : dataNode;

  const title = asNonEmptyString(base.name);
  const artistsField = base.artists;
  const artists = Array.isArray(artistsField)
    ? artistsField
    : isRecord(artistsField) && Array.isArray(artistsField.items)
      ? artistsField.items
      : [];

  const firstArtist = artists[0];
  let artistName: string | null = null;

  if (isRecord(firstArtist)) {
    artistName =
      asNonEmptyString(firstArtist.name) ??
      asNonEmptyString((firstArtist.profile as JsonRecord | undefined)?.name);
  }

  if (!title || !artistName) {
    return null;
  }

  return `${title} - ${artistName}`;
}

function collectTrackStrings(payload: unknown): string[] {
  const tracks: string[] = [];
  const seenTrackValues = new Set<string>();
  const visited = new WeakSet<object>();

  function walk(value: unknown) {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const parsed = parseTrackString(entry);
        if (parsed && !seenTrackValues.has(parsed)) {
          seenTrackValues.add(parsed);
          tracks.push(parsed);
        }
        walk(entry);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    for (const nested of Object.values(value)) {
      walk(nested);
    }
  }

  walk(payload);
  return tracks;
}

async function fetchPlaylistPayload(playlistId: string, limit: number) {
  const apiKey = getRequiredEnv("RAPIDAPI_KEY");

  const response = await fetch(RAPIDAPI_PLAYLIST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
    body: JSON.stringify({
      id: playlistId,
      limit,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RapidAPI error ${response.status}: ${text}`);
  }

  return response.json();
}

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

/** Fetch playlist details using RapidAPI scraper */
export async function fetchSpotifyPlaylistDetails(playlistId: string) {
  try {
    const data = await fetchPlaylistPayload(playlistId, 0);
    const name = pickPlaylistName(data);

    return {
      id: playlistId,
      name,
    };
  } catch (error) {
    console.error("[fetchSpotifyPlaylistDetails] Error:", error);
    throw error;
  }
}

/** Fetch playlist tracks in "Song - Artist" format for YouTube search */
export async function getPlaylistTracks(playlistId: string): Promise<string[]> {
  try {
    console.log(`[getPlaylistTracks] Fetching tracks for ${playlistId}...`);

    const data = await fetchPlaylistPayload(playlistId, 300);
    console.log(
      `[getPlaylistTracks] Response received:`,
      JSON.stringify(data).substring(0, 200)
    );

    const tracks = collectTrackStrings(data);

    if (tracks.length === 0) {
      console.error("[getPlaylistTracks] No tracks found in payload:", data);
      throw new Error("Invalid response from RapidAPI - missing tracks data");
    }

    console.log(`[getPlaylistTracks] Found ${tracks.length} tracks for ${playlistId}`);
    return tracks;
  } catch (error) {
    console.error(`[getPlaylistTracks] Error:`, error);
    throw error;
  }
}
