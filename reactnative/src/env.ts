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

function requireValue(name: keyof Extra) {
  const value = getExtra()[name];
  if (!value) {
    throw new Error(`Missing app config value: ${String(name)}`);
  }
  return value;
}

export const appEnv = {
  supabaseUrl: requireValue("supabaseUrl"),
  supabaseAnonKey: requireValue("supabaseAnonKey"),
  rapidApiKey: requireValue("rapidApiKey"),
  rapidApiKeyPrimary: requireValue("rapidApiKeyPrimary"),
  rapidApiKeySecondary: requireValue("rapidApiKeySecondary"),
  rapidApiProviderOrder: requireValue("rapidApiProviderOrder")
};
