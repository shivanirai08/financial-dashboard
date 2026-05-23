/** Supabase DB row — matches `playlists` table exactly. */
export type DbPlaylist = {
  id: string;
  spotify_playlist_id: string;
  slug: string;
  name: string;
  cover_image: string | null;
  created_at: string;
};

/** Supabase DB row — matches `songs` table exactly. */
export type DbSong = {
  id: string;
  playlist_id: string;
  title: string;
  artist: string;
  youtube_video_id: string | null;
  youtube_url: string | null;
  thumbnail: string | null;
  duration: number | null;
  position: number;
  liked: boolean;
  created_at: string;
};

export type PlaylistWithSongs = DbPlaylist & { songs: DbSong[] };

/** Kept for the YouTube search API route. */
export type YoutubeSearchResult = {
  videoId: string;
  url: string;
  title: string;
  channel: string;
};
