import { createClient } from "@supabase/supabase-js";

type ProviderName = "youtube-mp36" | "youtube-mp3-2025";

type ProviderResult = {
  provider: ProviderName;
  streamUrl: string;
};

type CacheRow = {
  video_id: string;
  object_path: string;
  size_bytes: number;
  provider: string | null;
  last_accessed: string | null;
};

export type EnsureCachedResult = {
  status: "ok";
  link: string;
  cached: boolean;
  provider: ProviderName | "cache";
};

const CACHE_BUCKET = process.env.MP3_CACHE_BUCKET ?? "yt-mp3-cache";
const MAX_BUCKET_BYTES = Number(process.env.MP3_CACHE_MAX_BYTES ?? "1000000000");
const TARGET_BUCKET_BYTES = Number(process.env.MP3_CACHE_TARGET_BYTES ?? "900000000");
const QUEUE_PREFETCH_LIMIT = Number(process.env.MP3_CACHE_QUEUE_LIMIT ?? "2");

const RAPIDAPI_KEY_PRIMARY = process.env.RAPIDAPI_KEY_PRIMARY ?? process.env.RAPIDAPI_KEY;
const RAPIDAPI_KEY_SECONDARY = process.env.RAPIDAPI_KEY_SECONDARY ?? process.env.RAPIDAPI_KEY;

const PROVIDER_MONTHLY_LIMITS: Record<ProviderName, number> = {
  "youtube-mp36": Number(process.env.RAPIDAPI_MONTHLY_LIMIT_MP36 ?? "280"),
  "youtube-mp3-2025": Number(process.env.RAPIDAPI_MONTHLY_LIMIT_MP32025 ?? "280"),
};

const PROVIDER_ORDER = (process.env.RAPIDAPI_PROVIDER_ORDER ?? "youtube-mp36,youtube-mp3-2025")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean) as ProviderName[];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase environment variables for MP3 cache");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeVideoId(videoId: string): string {
  const trimmed = videoId.trim();
  if (!/^[a-zA-Z0-9_-]{6,20}$/.test(trimmed)) {
    throw new Error("Invalid YouTube video id");
  }
  return trimmed;
}

function buildPublicUrl(objectPath: string): string {
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return true;
  } catch {
    // Some providers/CDNs can reject HEAD.
  }

  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

async function getCacheRow(videoId: string): Promise<CacheRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("yt_mp3_cache_index")
    .select("video_id, object_path, size_bytes, provider, last_accessed")
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Cache index read failed: ${error.message}`);
  }

  return data;
}

async function touchCacheRow(videoId: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from("yt_mp3_cache_index")
    .update({ last_accessed: new Date().toISOString() })
    .eq("video_id", videoId);
}

async function getMonthlyUsage(provider: ProviderName): Promise<number> {
  const supabase = getSupabaseClient();
  const key = monthKey();
  const { data, error } = await supabase
    .from("yt_mp3_api_usage")
    .select("requests")
    .eq("provider", provider)
    .eq("month_key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`Provider usage read failed: ${error.message}`);
  }

  return data?.requests ?? 0;
}

async function canUseProvider(provider: ProviderName): Promise<boolean> {
  const used = await getMonthlyUsage(provider);
  return used < PROVIDER_MONTHLY_LIMITS[provider];
}

async function incrementProviderUsage(provider: ProviderName): Promise<void> {
  const supabase = getSupabaseClient();
  const key = monthKey();
  const current = await getMonthlyUsage(provider);

  const { error } = await supabase.from("yt_mp3_api_usage").upsert(
    {
      provider,
      month_key: key,
      requests: current + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,month_key" }
  );

  if (error) {
    throw new Error(`Provider usage update failed: ${error.message}`);
  }
}

async function fetchFromMp36(videoId: string): Promise<ProviderResult> {
  if (!RAPIDAPI_KEY_PRIMARY) {
    throw new Error("Missing RAPIDAPI_KEY_PRIMARY/RAPIDAPI_KEY for youtube-mp36 provider");
  }

  const res = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": "youtube-mp36.p.rapidapi.com",
      "x-rapidapi-key": RAPIDAPI_KEY_PRIMARY,
    },
  });

  if (!res.ok) {
    throw new Error(`youtube-mp36 failed with ${res.status}`);
  }

  const payload = (await res.json()) as { status?: string; link?: string; msg?: string };
  if (payload.status !== "ok" || !payload.link) {
    throw new Error(payload.msg ?? "youtube-mp36 returned no link");
  }

  return { provider: "youtube-mp36", streamUrl: payload.link };
}

async function fetchFromMp32025(videoId: string): Promise<ProviderResult> {
  if (!RAPIDAPI_KEY_SECONDARY) {
    throw new Error("Missing RAPIDAPI_KEY_SECONDARY/RAPIDAPI_KEY for youtube-mp3-2025 provider");
  }

  const res = await fetch("https://youtube-mp3-2025.p.rapidapi.com/v1/social/youtube/audio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": "youtube-mp3-2025.p.rapidapi.com",
      "x-rapidapi-key": RAPIDAPI_KEY_SECONDARY,
    },
    body: JSON.stringify({ id: videoId }),
  });

  if (!res.ok) {
    throw new Error(`youtube-mp3-2025 failed with ${res.status}`);
  }

  const payload = (await res.json()) as {
    error?: boolean;
    linkStream?: string;
    linkDownload?: string;
  };

  const streamUrl = payload.linkStream ?? payload.linkDownload;
  if (payload.error || !streamUrl) {
    throw new Error("youtube-mp3-2025 returned no stream link");
  }

  return { provider: "youtube-mp3-2025", streamUrl };
}

async function fetchFromProvider(provider: ProviderName, videoId: string): Promise<ProviderResult> {
  if (provider === "youtube-mp36") {
    return fetchFromMp36(videoId);
  }
  return fetchFromMp32025(videoId);
}

async function resolveProviderStream(videoId: string): Promise<ProviderResult> {
  const enabledProviders = PROVIDER_ORDER.filter(
    (provider) => provider === "youtube-mp36" || provider === "youtube-mp3-2025"
  );

  if (enabledProviders.length === 0) {
    throw new Error("No RapidAPI provider configured");
  }

  const failures: string[] = [];

  for (const provider of enabledProviders) {
    try {
      const allowed = await canUseProvider(provider);
      if (!allowed) {
        failures.push(`${provider}: monthly limit reached`);
        continue;
      }

      await incrementProviderUsage(provider);
      return await fetchFromProvider(provider, videoId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      failures.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`All providers failed or were quota-limited (${failures.join(" | ")})`);
}

async function downloadAudio(url: string): Promise<{ bytes: Uint8Array; sizeBytes: number }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Audio download failed with ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(arrayBuffer),
    sizeBytes: arrayBuffer.byteLength,
  };
}

async function deleteCacheObject(objectPath: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.storage.from(CACHE_BUCKET).remove([objectPath]);
}

async function ensureCapacity(incomingBytes: number, protectedVideoId?: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (incomingBytes > MAX_BUCKET_BYTES) {
    throw new Error("Track is larger than total cache budget");
  }

  const { data: rows, error } = await supabase
    .from("yt_mp3_cache_index")
    .select("video_id, object_path, size_bytes, last_accessed")
    .order("last_accessed", { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`Cache index list failed: ${error.message}`);
  }

  let totalBytes = (rows ?? []).reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0);
  if (totalBytes + incomingBytes <= MAX_BUCKET_BYTES) {
    return;
  }

  const target = Math.min(TARGET_BUCKET_BYTES, MAX_BUCKET_BYTES - incomingBytes);
  if (target < 0) {
    throw new Error("Insufficient cache budget for incoming file");
  }

  for (const row of rows ?? []) {
    if (row.video_id === protectedVideoId) continue;

    await deleteCacheObject(row.object_path);
    await supabase.from("yt_mp3_cache_index").delete().eq("video_id", row.video_id);

    totalBytes -= Number(row.size_bytes ?? 0);
    if (totalBytes <= target) {
      break;
    }
  }

  if (totalBytes + incomingBytes > MAX_BUCKET_BYTES) {
    throw new Error("Could not free enough cache space");
  }
}

async function writeCacheIndex(
  videoId: string,
  objectPath: string,
  sizeBytes: number,
  provider: ProviderName
): Promise<void> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("yt_mp3_cache_index").upsert(
    {
      video_id: videoId,
      object_path: objectPath,
      size_bytes: sizeBytes,
      provider,
      created_at: now,
      last_accessed: now,
    },
    { onConflict: "video_id" }
  );

  if (error) {
    throw new Error(`Cache index write failed: ${error.message}`);
  }
}

export async function ensureCachedMp3(videoIdInput: string): Promise<EnsureCachedResult> {
  const supabase = getSupabaseClient();
  const videoId = normalizeVideoId(videoIdInput);
  const objectPath = `${videoId}.mp3`;

  const existing = await getCacheRow(videoId);
  if (existing) {
    const publicUrl = buildPublicUrl(existing.object_path);
    const exists = await urlExists(publicUrl);
    if (exists) {
      await touchCacheRow(videoId);
      return {
        status: "ok",
        link: publicUrl,
        cached: true,
        provider: "cache",
      };
    }

    await supabase.from("yt_mp3_cache_index").delete().eq("video_id", videoId);
  }

  const resolved = await resolveProviderStream(videoId);
  const audio = await downloadAudio(resolved.streamUrl);

  await ensureCapacity(audio.sizeBytes, videoId);

  const { error: uploadError } = await supabase.storage
    .from(CACHE_BUCKET)
    .upload(objectPath, audio.bytes, { upsert: true, contentType: "audio/mpeg" });

  if (uploadError) {
    throw new Error(`Cache upload failed: ${uploadError.message}`);
  }

  await writeCacheIndex(videoId, objectPath, audio.sizeBytes, resolved.provider);

  return {
    status: "ok",
    link: buildPublicUrl(objectPath),
    cached: false,
    provider: resolved.provider,
  };
}

export async function prefetchQueueMp3(videoIds: string[]) {
  const uniqueIds = Array.from(new Set(videoIds.map((id) => id.trim()).filter(Boolean))).slice(
    0,
    QUEUE_PREFETCH_LIMIT
  );

  const results: Array<
    | { videoId: string; ok: true; link: string; cached: boolean; provider: EnsureCachedResult["provider"] }
    | { videoId: string; ok: false; error: string }
  > = [];

  for (const videoId of uniqueIds) {
    try {
      const resolved = await ensureCachedMp3(videoId);
      results.push({
        videoId,
        ok: true,
        link: resolved.link,
        cached: resolved.cached,
        provider: resolved.provider,
      });
    } catch (error) {
      results.push({
        videoId,
        ok: false,
        error: error instanceof Error ? error.message : "Failed to prefetch",
      });
    }
  }

  return {
    status: "ok" as const,
    limit: QUEUE_PREFETCH_LIMIT,
    results,
  };
}
