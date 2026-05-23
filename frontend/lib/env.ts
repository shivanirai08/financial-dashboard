const spotifyScopes = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
] as const;

export function getSpotifyScopes() {
  return [...spotifyScopes];
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}
