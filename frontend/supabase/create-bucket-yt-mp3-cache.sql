-- Run this in Supabase SQL editor to create the bucket for caching
insert into storage.buckets (id, name, public) values ('yt-mp3-cache', 'yt-mp3-cache', true)
on conflict (id) do nothing;