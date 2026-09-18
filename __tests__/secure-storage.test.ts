jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  isAvailableAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from "expo-secure-store";

import {
  AUTH_STORAGE_KEY,
  clearSecureSession,
  secureSessionStorage,
} from "../src/auth/secureStorage";

describe("secure session storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SecureStore.isAvailableAsync).mockResolvedValue(true);
  });

  it("writes session material only through protected platform storage", async () => {
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue();

    await secureSessionStorage.setItem(AUTH_STORAGE_KEY, "opaque-session");

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      AUTH_STORAGE_KEY,
      "opaque-session",
      { keychainAccessible: "WHEN_UNLOCKED_THIS_DEVICE_ONLY" },
    );
  });

  it("removes the fixed session key on cleanup", async () => {
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue();

    await clearSecureSession();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(AUTH_STORAGE_KEY);
  });

  it("fails closed when secure platform storage is unavailable", async () => {
    jest.mocked(SecureStore.isAvailableAsync).mockResolvedValue(false);

    await expect(
      secureSessionStorage.setItem(AUTH_STORAGE_KEY, "opaque-session"),
    ).rejects.toThrow(/unavailable/);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
