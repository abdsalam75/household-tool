import { createClient } from "@supabase/supabase-js";

import { readExpoPublicAuthConfig } from "../auth/config";
import { AUTH_STORAGE_KEY, secureSessionStorage } from "../auth/secureStorage";
import { HouseholdService } from "./HouseholdService";

export function createHouseholdService(): HouseholdService {
  const config = readExpoPublicAuthConfig();
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: secureSessionStorage,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return new HouseholdService(
    client,
    `${config.supabaseUrl}/functions/v1/parent-invitations/accept`,
    {
      getItem: () => secureSessionStorage.getItem(PARENT_INVITATION_CACHE_KEY),
      setItem: (value) =>
        secureSessionStorage.setItem(PARENT_INVITATION_CACHE_KEY, value),
      removeItem: () =>
        secureSessionStorage.removeItem(PARENT_INVITATION_CACHE_KEY),
    },
  );
}

export const PARENT_INVITATION_CACHE_KEY =
  "household-tool-parent-invitation-url";
