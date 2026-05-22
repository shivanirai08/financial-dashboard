import Constants from "expo-constants";

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  rapidApiKey?: string;
  rapidApiKeyPrimary?: string;
  rapidApiKeySecondary?: string;
  rapidApiProviderOrder?: string;
  rapidApiMonthlyLimitMp36?: string;
  rapidApiMonthlyLimitMp32025?: string;
};

const DEFAULT_SUPABASE_URL = "https://wvsogmcujwhtsvxwfato.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2c29nbWN1andodHN2eHdmYXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDAzNjcsImV4cCI6MjA5NDYxNjM2N30.J99K_lEYOTQD-50zHVOhW1EFN5bgPqjHvPw-hPrGVbk";

function getExtra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

function readValue(name: keyof Extra, fallback = ""): string {
  const value = getExtra()[name];
  if (!value) {
    // Log clearly so it shows up in Expo logs.
    console.error(
      `[env] Missing app config value: ${String(name)}. ` +
        "Check that reactnative/.env exists and eas build was run after adding it."
    );
    return fallback;
  }
  return value;
}

export const appEnv = {
  supabaseUrl: readValue("supabaseUrl", DEFAULT_SUPABASE_URL),
  supabaseAnonKey: readValue("supabaseAnonKey", DEFAULT_SUPABASE_ANON_KEY),
  rapidApiKey: readValue("rapidApiKey"),
  rapidApiKeyPrimary: readValue("rapidApiKeyPrimary"),
  rapidApiKeySecondary: readValue("rapidApiKeySecondary"),
  rapidApiProviderOrder: readValue("rapidApiProviderOrder")
};
