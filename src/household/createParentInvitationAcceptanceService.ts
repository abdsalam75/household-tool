import { createClient } from "@supabase/supabase-js";

import { readExpoPublicAuthConfig } from "../auth/config";
import { AUTH_STORAGE_KEY, secureSessionStorage } from "../auth/secureStorage";
import { readExpoPublicInvitationLinkConfig } from "./invitationLinkConfig";
import { ParentInvitationAcceptanceService } from "./ParentInvitationAcceptanceService";

export const PENDING_PARENT_INVITATION_KEY =
  "household-tool-pending-parent-invitation";

export function createParentInvitationAcceptanceService() {
  const config = readExpoPublicAuthConfig();
  const invitationConfig = readExpoPublicInvitationLinkConfig();
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
  return new ParentInvitationAcceptanceService(
    client,
    invitationConfig.parentInvitationUrl,
    {
      getItem: () =>
        secureSessionStorage.getItem(PENDING_PARENT_INVITATION_KEY),
      setItem: (value) =>
        secureSessionStorage.setItem(PENDING_PARENT_INVITATION_KEY, value),
      removeItem: () =>
        secureSessionStorage.removeItem(PENDING_PARENT_INVITATION_KEY),
    },
  );
}
