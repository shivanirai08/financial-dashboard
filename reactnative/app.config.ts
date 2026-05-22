import type { ExpoConfig } from "expo/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env for local dev (won't exist in EAS cloud — fallbacks below cover that case).
loadEnv({ path: path.resolve(__dirname, ".env") });
loadEnv({ path: path.resolve(__dirname, "../.env") });

// Fallbacks are the same values from ../.env so EAS cloud builds work without secrets.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://wvsogmcujwhtsvxwfato.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2c29nbWN1andodHN2eHdmYXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDAzNjcsImV4cCI6MjA5NDYxNjM2N30.J99K_lEYOTQD-50zHVOhW1EFN5bgPqjHvPw-hPrGVbk";

const rapidApiKey =
  process.env.RAPIDAPI_KEY ?? "914e9be7b4mshe9ddc675e9957f6p104eb2jsnfba5c0969f5e";

const rapidApiKeyPrimary =
  process.env.RAPIDAPI_KEY_PRIMARY ?? "914e9be7b4mshe9ddc675e9957f6p104eb2jsnfba5c0969f5e";

const rapidApiKeySecondary =
  process.env.RAPIDAPI_KEY_SECONDARY ?? "914e9be7b4mshe9ddc675e9957f6p104eb2jsnfba5c0969f5e";

const rapidApiProviderOrder =
  process.env.RAPIDAPI_PROVIDER_ORDER ?? "youtube-mp36,youtube-mp3-2025";

const config: ExpoConfig = {
  name: "Pulsebox",
  slug: "pulsebox-reactnative",
  scheme: "pulsebox",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  splash: {
    resizeMode: "contain",
    backgroundColor: "#07111f"
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.pulsebox.mobile"
  },
  android: {
    package: "com.pulsebox.mobile",
    adaptiveIcon: {
      backgroundColor: "#07111f"
    }
  },
  plugins: [
    "expo-font",
    [
      "expo-audio",
      {
        enableBackgroundPlayback: true
      }
    ]
  ],
  extra: {
    eas: {
      projectId: "0b237302-23df-4439-94c1-2d43cdb1268b"
    },
    supabaseUrl,
    supabaseAnonKey,
    rapidApiKey,
    rapidApiKeyPrimary,
    rapidApiKeySecondary,
    rapidApiProviderOrder,
    rapidApiMonthlyLimitMp36:
      process.env.RAPIDAPI_MONTHLY_LIMIT_MP36 ?? "280",
    rapidApiMonthlyLimitMp32025:
      process.env.RAPIDAPI_MONTHLY_LIMIT_MP32025 ?? "280"
  }
};

export default config;
