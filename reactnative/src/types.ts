export type DbPlaylist = {
  id: string;
  spotify_playlist_id: string;
  slug: string;
  name: string;
  cover_image: string | null;
  created_at: string;
};

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

export type YoutubeSearchItem = {
  videoId: string;
  title: string;
  artist: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  url: string;
};

export type PlaylistPreviewSong = {
  name: string;
  artist: string;
};

export type PlaylistPreview = {
  playlistName: string;
  totalSongs: number;
  songs: PlaylistPreviewSong[];
};
