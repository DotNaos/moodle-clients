import { Platform } from "react-native";

import type { MoodleConnection } from "./moodle";

const CONNECTION_KEY = "moodle-clients.connection.v1";
const KEYCHAIN_AFTER_FIRST_UNLOCK = "AFTER_FIRST_UNLOCK";

type SecureStoreModule = {
  AFTER_FIRST_UNLOCK: string;
  deleteItemAsync: (key: string) => Promise<void>;
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: { keychainAccessible?: string }) => Promise<void>;
};

declare const require: (id: string) => SecureStoreModule;

export async function loadStoredConnection(): Promise<MoodleConnection | null> {
  const raw = await readValue(CONNECTION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MoodleConnection>;
    if (
      typeof parsed.moodleSiteUrl === "string" &&
      typeof parsed.moodleUserId === "number" &&
      typeof parsed.moodleMobileToken === "string"
    ) {
      return parsed as MoodleConnection;
    }
  } catch {
    return null;
  }

  return null;
}

export async function storeConnection(connection: MoodleConnection): Promise<void> {
  await writeValue(CONNECTION_KEY, JSON.stringify(connection));
}

export async function clearStoredConnection(): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(CONNECTION_KEY);
    return;
  }

  await getSecureStore().deleteItemAsync(CONNECTION_KEY);
}

async function readValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(key) ?? null;
  }

  return getSecureStore().getItemAsync(key);
}

async function writeValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  const secureStore = getSecureStore();
  await secureStore.setItemAsync(key, value, {
    keychainAccessible: secureStore.AFTER_FIRST_UNLOCK ?? KEYCHAIN_AFTER_FIRST_UNLOCK,
  });
}

function getSecureStore(): SecureStoreModule {
  return require("expo-secure-store");
}
