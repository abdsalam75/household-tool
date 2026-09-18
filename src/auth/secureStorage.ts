import * as SecureStore from "expo-secure-store";

export const AUTH_STORAGE_KEY = "household-tool-auth-session";

async function requireSecureStore() {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error("Secure storage is unavailable");
  }
}

export const secureSessionStorage = {
  async getItem(key: string) {
    await requireSecureStore();
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string) {
    await requireSecureStore();
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async removeItem(key: string) {
    await requireSecureStore();
    await SecureStore.deleteItemAsync(key);
  },
};

export async function clearSecureSession() {
  await secureSessionStorage.removeItem(AUTH_STORAGE_KEY);
}
