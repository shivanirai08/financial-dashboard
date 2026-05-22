import { supabase } from "@/lib/supabase";
import { slugify } from "@/utils/slug";
import { extractSpotifyPlaylistId, fetchSpotifyPlaylistDetails, getPlaylistTracks, getSpotifyPreview } from "@/utils/spotify";
import { searchYouTubeVideos } from "@/utils/youtube";
import type { DbPlaylist, DbSong } from "@/types";

export async function fetchPlaylists() {
  const [playlistsResult, likedResult] = await Promise.all([
    supabase.from("playlists").select("id, name, slug, created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("songs").select("id", { count: "exact", head: true }).eq("liked", true)
  ]);

  if (playlistsResult.error) throw playlistsResult.error;
  if (likedResult.error) throw likedResult.error;

  return {
    playlists: (playlistsResult.data ?? []) as Pick<DbPlaylist, "id" | "name" | "slug" | "created_at">[],
    likedCount: likedResult.count ?? 0
  };
}

export async function fetchLikedSongs() {
  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("liked", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DbSong[];
}

export async function fetchPlaylistBySlug(slug: string) {
  const { data: playlist, error: playlistError } = await supabase
    .from("playlists")
    .select("*")
    .eq("slug", slug)
    .single();

  if (playlistError || !playlist) {
    throw playlistError ?? new Error("Playlist not found");
  }

  const { data: songs, error: songsError } = await supabase
    .from("songs")
    .select("*")
    .eq("playlist_id", playlist.id)
    .order("position", { ascending: true });

  if (songsError) throw songsError;

  return {
    playlist: playlist as DbPlaylist,
    songs: (songs ?? []) as DbSong[]
  };
}

export async function createPlaylist(name: string) {
  let slug = slugify(name);
  const { data: existing } = await supabase.from("playlists").select("slug").eq("slug", slug).maybeSingle();
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  const { data, error } = await supabase
    .from("playlists")
    .insert({
      spotify_playlist_id: `manual-${slug}-${Date.now()}`,
      slug,
      name: name.trim(),
      cover_image: null
    })
    .select()
    .single();

  if (error) throw error;
  return data as DbPlaylist;
}

export async function renamePlaylist(id: string, name: string) {
  const { data, error } = await supabase
    .from("playlists")
    .update({ name: name.trim() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as DbPlaylist;
}

export async function deletePlaylist(id: string) {
  const { error } = await supabase.from("playlists").delete().eq("id", id);
  if (error) throw error;
}

export async function addSongToPlaylist(
  playlistId: string,
  input: {
    title: string;
    artist?: string;
    youtube_video_id?: string;
    youtube_url?: string;
    thumbnail?: string | null;
    duration?: number | null;
  }
) {
  const { data: lastSong } = await supabase
    .from("songs")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastSong?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("songs")
    .insert({
      playlist_id: playlistId,
      title: input.title,
      artist: input.artist ?? "",
      youtube_video_id: input.youtube_video_id ?? null,
      youtube_url: input.youtube_url ?? null,
      thumbnail: input.thumbnail ?? null,
      duration: input.duration ?? null,
      position,
      liked: false
    })
    .select()
    .single();

  if (error) throw error;
  return data as DbSong;
}

export async function removeSong(songId: string) {
  const { error } = await supabase.from("songs").delete().eq("id", songId);
  if (error) throw error;
}

export async function toggleLikeSong(songId: string) {
  const { data: song, error: fetchError } = await supabase
    .from("songs")
    .select("liked")
    .eq("id", songId)
    .single();

  if (fetchError || !song) {
    throw fetchError ?? new Error("Song not found");
  }

  const newLiked = !song.liked;
  const { error } = await supabase.from("songs").update({ liked: newLiked }).eq("id", songId);
  if (error) throw error;
  return newLiked;
}

export async function updateSongYoutubeMatch(
  songId: string,
  input: {
    youtube_video_id: string;
    youtube_url?: string;
    thumbnail?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("songs")
    .update({
      youtube_video_id: input.youtube_video_id,
      youtube_url: input.youtube_url ?? null,
      thumbnail: input.thumbnail ?? null
    })
    .eq("id", songId)
    .select()
    .single();

  if (error) throw error;
  return data as DbSong;
}

export async function getPlaylistPreview(input: string) {
  return getSpotifyPreview(input);
}

export async function syncSpotifyPublicPlaylist(input: string) {
  const playlistId = extractSpotifyPlaylistId(input);
  if (!playlistId) {
    throw new Error("Invalid Spotify playlist URL or ID.");
  }

  const details = await fetchSpotifyPlaylistDetails(playlistId);
  const trackStrings = await getPlaylistTracks(playlistId);
  const baseSlug = slugify(details.name) || playlistId;

  const { data: existingSlug } = await supabase
    .from("playlists")
    .select("slug, spotify_playlist_id")
    .eq("slug", baseSlug)
    .maybeSingle();

  const slug =
    existingSlug && existingSlug.spotify_playlist_id !== playlistId
      ? `${baseSlug}-${Date.now()}`
      : baseSlug;

  const { data: playlist, error: playlistError } = await supabase
    .from("playlists")
    .upsert(
      {
        spotify_playlist_id: playlistId,
        slug,
        name: details.name,
        cover_image: null
      },
      { onConflict: "spotify_playlist_id" }
    )
    .select()
    .single();

  if (playlistError || !playlist) {
    throw playlistError ?? new Error("Failed to save playlist");
  }

  await supabase.from("songs").delete().eq("playlist_id", playlist.id);

  const songsToInsert: Omit<DbSong, "id" | "created_at">[] = [];
  for (let index = 0; index < trackStrings.length; index += 1) {
    const parts = trackStrings[index].split(" - ").map((value) => value.trim());
    const title = parts[0] || "Unknown";
    const artist = parts[1] || "Unknown";

    let youtube_video_id: string | null = null;
    let youtube_url: string | null = null;
    let thumbnail: string | null = null;
    let duration: number | null = null;

    try {
      const result = (await searchYouTubeVideos(`${title} ${artist} song`, 1))[0];
      if (result) {
        youtube_video_id = result.videoId;
        youtube_url = result.url;
        thumbnail = result.thumbnailUrl ?? `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`;
        duration = result.durationSeconds;
      }
    } catch {
      // Continue per-song just like the web flow.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    songsToInsert.push({
      playlist_id: playlist.id,
      title,
      artist,
      youtube_video_id,
      youtube_url,
      thumbnail,
      duration,
      position: index,
      liked: false
    });
  }

  const { error: songsError } = await supabase.from("songs").insert(songsToInsert);
  if (songsError) throw songsError;

  return playlist as DbPlaylist;
}

export async function searchYoutube(query: string, limit = 10) {
  return searchYouTubeVideos(query, limit);
}
