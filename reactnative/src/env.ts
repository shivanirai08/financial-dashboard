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

function getExtra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

function readValue(name: keyof Extra): string {
  const value = getExtra()[name];
  if (!value) {
    // Log clearly so it shows up in Expo logs — but don't crash the JS runtime.
    // The app will surface API errors at runtime instead of dying on startup.
    console.error(
      `[env] Missing app config value: ${String(name)}. ` +
        "Check that reactnative/.env exists and eas build was run after adding it."
    );
    return "";
  }
  return value;
}

export const appEnv = {
  supabaseUrl: readValue("supabaseUrl"),
  supabaseAnonKey: readValue("supabaseAnonKey"),
  rapidApiKey: readValue("rapidApiKey"),
  rapidApiKeyPrimary: readValue("rapidApiKeyPrimary"),
  rapidApiKeySecondary: readValue("rapidApiKeySecondary"),
  rapidApiProviderOrder: readValue("rapidApiProviderOrder")
};
