-- MP3 cache index for deterministic cleanup and access tracking
create table if not exists public.yt_mp3_cache_index (
  video_id text primary key,
  object_path text not null,
  size_bytes bigint not null,
  provider text,
  created_at timestamptz not null default now(),
  last_accessed timestamptz not null default now()
);

create index if not exists yt_mp3_cache_index_last_accessed_idx
  on public.yt_mp3_cache_index (last_accessed asc);

-- Monthly RapidAPI usage tracking by provider
create table if not exists public.yt_mp3_api_usage (
  provider text not null,
  month_key text not null,
  requests integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, month_key)
);
