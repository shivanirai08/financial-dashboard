import { appEnv } from "@/env";
import type { PlaylistPreview } from "@/types";

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
    (playlistV2?.title as JsonRecord | undefined)?.text
  ];

  for (const candidate of candidates) {
    const name = asNonEmptyString(candidate);
    if (name) return name;
  }

  return "Unknown Playlist";
}

function parseTrackString(item: unknown): string | null {
  if (!isRecord(item)) return null;
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
  const artistName = isRecord(firstArtist)
    ? asNonEmptyString(firstArtist.name) ??
      asNonEmptyString((firstArtist.profile as JsonRecord | undefined)?.name)
    : null;

  if (!title || !artistName) return null;
  return `${title} - ${artistName}`;
}

function collectTrackStrings(payload: unknown): string[] {
  const tracks: string[] = [];
  const seen = new Set<string>();
  const visited = new WeakSet<object>();

  function walk(value: unknown) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        const parsed = parseTrackString(entry);
        if (parsed && !seen.has(parsed)) {
          seen.add(parsed);
          tracks.push(parsed);
        }
        walk(entry);
      });
      return;
    }

    if (!isRecord(value)) return;
    if (visited.has(value)) return;
    visited.add(value);

    Object.values(value).forEach((nested) => walk(nested));
  }

  walk(payload);
  return tracks;
}

async function fetchPlaylistPayload(playlistId: string, limit: number) {
  const response = await fetch(RAPIDAPI_PLAYLIST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-key": appEnv.rapidApiKey,
      "x-rapidapi-host": RAPIDAPI_HOST
    },
    body: JSON.stringify({ id: playlistId, limit })
  });

  if (!response.ok) {
    throw new Error(`RapidAPI error ${response.status}`);
  }

  return response.json();
}

export function extractSpotifyPlaylistId(input: string) {
  const raw = input.trim();
  if (!raw) return null;

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

export async function fetchSpotifyPlaylistDetails(playlistId: string) {
  const data = await fetchPlaylistPayload(playlistId, 0);
  return {
    id: playlistId,
    name: pickPlaylistName(data)
  };
}

export async function getPlaylistTracks(playlistId: string) {
  const data = await fetchPlaylistPayload(playlistId, 300);
  const tracks = collectTrackStrings(data);
  if (!tracks.length) {
    throw new Error("Invalid response from Spotify playlist source");
  }
  return tracks;
}

export async function getSpotifyPreview(input: string): Promise<PlaylistPreview> {
  const playlistId = extractSpotifyPlaylistId(input);
  if (!playlistId) {
    throw new Error("Invalid Spotify playlist URL or playlist ID.");
  }

  const playlist = await fetchSpotifyPlaylistDetails(playlistId);
  const trackStrings = await getPlaylistTracks(playlistId);

  return {
    playlistName: playlist.name,
    totalSongs: trackStrings.length,
    songs: trackStrings.map((trackString) => {
      const [name, artist] = trackString.split(" - ").map((item) => item.trim());
      return { name, artist };
    })
  };
}
