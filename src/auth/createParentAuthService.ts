import { createClient } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";

import { readExpoPublicAuthConfig } from "./config";
import {
  AUTH_STORAGE_KEY,
  clearSecureSession,
  secureSessionStorage,
} from "./secureStorage";
import { ParentAuthService } from "./ParentAuthService";

WebBrowser.maybeCompleteAuthSession();

export function createParentAuthService(): ParentAuthService {
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

  return new ParentAuthService(
    client.auth,
    WebBrowser,
    config.redirectUrl,
    clearSecureSession,
  );
}
