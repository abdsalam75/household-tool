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
  return new HouseholdService(client);
}
