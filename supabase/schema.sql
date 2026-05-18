-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS playlists (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_playlist_id TEXT        UNIQUE NOT NULL,
  slug                TEXT        UNIQUE NOT NULL,
  name                TEXT        NOT NULL,
  cover_image         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS songs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id      UUID        NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  artist           TEXT        NOT NULL,
  youtube_video_id TEXT,
  youtube_url      TEXT,
  thumbnail        TEXT,
  duration         INTEGER,
  position         INTEGER     NOT NULL DEFAULT 0,
  liked            BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS songs_playlist_id_idx       ON songs(playlist_id);
CREATE INDEX IF NOT EXISTS songs_playlist_position_idx ON songs(playlist_id, position);
