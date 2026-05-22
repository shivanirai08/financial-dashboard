import "dotenv/config";
import type { ExpoConfig } from "expo/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../.env") });

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
  plugins: ["expo-font"],
  extra: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    rapidApiKey: process.env.RAPIDAPI_KEY,
    rapidApiKeyPrimary: process.env.RAPIDAPI_KEY_PRIMARY,
    rapidApiKeySecondary: process.env.RAPIDAPI_KEY_SECONDARY,
    rapidApiProviderOrder: process.env.RAPIDAPI_PROVIDER_ORDER,
    rapidApiMonthlyLimitMp36: process.env.RAPIDAPI_MONTHLY_LIMIT_MP36,
    rapidApiMonthlyLimitMp32025: process.env.RAPIDAPI_MONTHLY_LIMIT_MP32025
  }
};

export default config;
