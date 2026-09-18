import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AuthAction, ParentAccount, Provider } from "./types";

export type AuthViewState = {
  phase: "restoring" | "signedOut" | "signedIn";
  action: AuthAction | null;
  account: ParentAccount | null;
  message?: string;
};

type AuthViewEvent =
  | { type: "BEGIN"; action: AuthAction }
  | { type: "AUTHENTICATED"; account: ParentAccount }
  | { type: "SIGNED_OUT"; message?: string };

export const initialAuthState: AuthViewState = {
  phase: "restoring",
  action: null,
  account: null,
};

export function parentAuthReducer(
  state: AuthViewState,
  event: AuthViewEvent,
): AuthViewState {
  switch (event.type) {
    case "BEGIN":
      return { ...state, action: event.action, message: undefined };
    case "AUTHENTICATED":
      return {
        phase: "signedIn",
        action: null,
        account: event.account,
      };
    case "SIGNED_OUT":
      return {
        phase: "signedOut",
        action: null,
        account: null,
        message: event.message,
      };
  }
}

type ActionButtonProps = {
  label: string;
  loadingLabel?: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
};

function ActionButton({
  label,
  loadingLabel = label,
  loading,
  disabled,
  onPress,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      {loading ? <ActivityIndicator color="#ffffff" /> : null}
      <Text style={styles.buttonText}>{loading ? loadingLabel : label}</Text>
    </Pressable>
  );
}

type ParentAuthViewProps = {
  state: AuthViewState;
  email: string;
  password: string;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onEmailSignIn: () => void;
  onProviderSignIn: (provider: Provider) => void;
  onSignOut: () => void;
};

export function ParentAuthView({
  state,
  email,
  password,
  onChangeEmail,
  onChangePassword,
  onEmailSignIn,
  onProviderSignIn,
  onSignOut,
}: ParentAuthViewProps) {
  if (state.phase === "restoring") {
    return (
      <View style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color="#345995" size="large" />
          <Text accessibilityRole="text" style={styles.status}>
            Restoring your secure session…
          </Text>
        </View>
      </View>
    );
  }

  if (state.phase === "signedIn" && state.account) {
    const accountLabel = state.account.email ?? `Parent ${state.account.id}`;
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>SIGNED IN</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Welcome home
          </Text>
          <Text style={styles.account}>{accountLabel}</Text>
          <Text style={styles.body}>
            Your account is ready. Household setup is coming next.
          </Text>
          {state.message ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {state.message}
            </Text>
          ) : null}
          <ActionButton
            disabled={Boolean(state.action)}
            label="Sign out"
            loading={state.action === "signout"}
            loadingLabel="Signing out…"
            onPress={onSignOut}
          />
        </View>
      </View>
    );
  }

  const busy = Boolean(state.action);
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>HOUSEHOLD TOOL</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Parent sign-in
        </Text>
        <Text style={styles.body}>Sign in to manage your household.</Text>
        {state.message ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {state.message}
          </Text>
        ) : null}
        {state.action === "callback" ? (
          <View style={styles.inlineStatus}>
            <ActivityIndicator color="#345995" />
            <Text style={styles.status}>Completing sign-in…</Text>
          </View>
        ) : null}
        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          editable={!busy}
          inputMode="email"
          onChangeText={onChangeEmail}
          placeholder="parent@example.com"
          style={styles.input}
          value={email}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          autoComplete="current-password"
          editable={!busy}
          onChangeText={onChangePassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <ActionButton
          disabled={busy}
          label="Sign in with email"
          loading={state.action === "email"}
          loadingLabel="Signing in…"
          onPress={onEmailSignIn}
        />
        <View style={styles.divider} />
        <ActionButton
          disabled={busy}
          label="Continue with Google"
          loading={state.action === "google"}
          loadingLabel="Opening Google…"
          onPress={() => onProviderSignIn("google")}
        />
        <ActionButton
          disabled={busy}
          label="Continue with Apple"
          loading={state.action === "apple"}
          loadingLabel="Opening Apple…"
          onPress={() => onProviderSignIn("apple")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f1ea",
    justifyContent: "center",
    padding: 24,
  },
  centered: { alignItems: "center", gap: 16 },
  inlineStatus: { alignItems: "center", flexDirection: "row", gap: 10 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  eyebrow: {
    color: "#345995",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: { color: "#152238", fontSize: 30, fontWeight: "700" },
  body: { color: "#4a5568", fontSize: 16, lineHeight: 23 },
  account: { color: "#152238", fontSize: 18, fontWeight: "600" },
  status: { color: "#344054", fontSize: 16 },
  error: {
    backgroundColor: "#fff1f0",
    borderRadius: 8,
    color: "#8a1c1c",
    padding: 12,
  },
  label: { color: "#344054", fontSize: 14, fontWeight: "600" },
  input: {
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    color: "#152238",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#345995",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  divider: { backgroundColor: "#e2e8f0", height: 1, marginVertical: 4 },
});
