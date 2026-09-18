import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type HouseholdViewState = {
  phase: "loading" | "loadError" | "setup" | "settings";
  accountLabel: string;
  timeZone: string;
  persistedTimeZone?: string;
  fallbackMessage?: string;
  message?: string;
  success?: string;
  action: "create" | "save" | "reload" | "signout" | null;
};

type HouseholdViewProps = {
  state: HouseholdViewState;
  onChangeTimeZone: (value: string) => void;
  onCreate: () => void;
  onReload: () => void;
  onSave: () => void;
  onSignOut: () => void;
};

type ButtonProps = {
  label: string;
  loadingLabel: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  secondary?: boolean;
};

function Button({
  label,
  loadingLabel,
  loading,
  disabled,
  onPress,
  secondary,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? "#345995" : "#fff"} />
      ) : null}
      <Text
        style={[styles.buttonText, secondary && styles.secondaryButtonText]}
      >
        {loading ? loadingLabel : label}
      </Text>
    </Pressable>
  );
}

export function HouseholdView({
  state,
  onChangeTimeZone,
  onCreate,
  onReload,
  onSave,
  onSignOut,
}: HouseholdViewProps) {
  const busy = state.action !== null;

  if (state.phase === "loading") {
    return (
      <View style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color="#345995" size="large" />
          <Text style={styles.body}>Loading household settings…</Text>
        </View>
      </View>
    );
  }

  if (state.phase === "loadError") {
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Household settings
          </Text>
          <Text accessibilityRole="alert" style={styles.error}>
            {state.message}
          </Text>
          <Button
            disabled={busy}
            label="Try again"
            loading={state.action === "reload"}
            loadingLabel="Trying again…"
            onPress={onReload}
          />
          <Button
            disabled={busy}
            label="Sign out"
            loading={state.action === "signout"}
            loadingLabel="Signing out…"
            onPress={onSignOut}
            secondary
          />
        </View>
      </View>
    );
  }

  const setup = state.phase === "setup";
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>
          {setup ? "HOUSEHOLD SETUP" : "SETTINGS"}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {setup ? "Set your household time zone" : "Household time zone"}
        </Text>
        <Text style={styles.account}>{state.accountLabel}</Text>
        <Text style={styles.body}>
          {setup
            ? "Review the named IANA time zone proposed from this device before creating your household."
            : "This time zone controls future due-day boundaries, reminders, and overdue calculations."}
        </Text>
        {state.fallbackMessage ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {state.fallbackMessage}
          </Text>
        ) : null}
        <Text style={styles.label}>Named IANA time zone</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={onChangeTimeZone}
          placeholder="Africa/Lagos"
          style={styles.input}
          value={state.timeZone}
        />
        {state.message ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {state.message}
          </Text>
        ) : null}
        {state.success ? (
          <Text accessibilityLiveRegion="polite" style={styles.success}>
            {state.success}
          </Text>
        ) : null}
        <Button
          disabled={busy}
          label={setup ? "Create household" : "Save time zone"}
          loading={state.action === (setup ? "create" : "save")}
          loadingLabel={setup ? "Creating household…" : "Saving…"}
          onPress={setup ? onCreate : onSave}
        />
        <Button
          disabled={busy}
          label="Sign out"
          loading={state.action === "signout"}
          loadingLabel="Signing out…"
          onPress={onSignOut}
          secondary
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
  card: { backgroundColor: "#fff", borderRadius: 20, gap: 12, padding: 24 },
  eyebrow: {
    color: "#345995",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: { color: "#152238", fontSize: 28, fontWeight: "700" },
  account: { color: "#152238", fontSize: 15, fontWeight: "600" },
  body: { color: "#4a5568", fontSize: 16, lineHeight: 23 },
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
  notice: { backgroundColor: "#fff8e6", color: "#765c13", padding: 12 },
  error: { backgroundColor: "#fff1f0", color: "#8a1c1c", padding: 12 },
  success: { backgroundColor: "#edf8f0", color: "#246b35", padding: 12 },
  button: {
    alignItems: "center",
    backgroundColor: "#345995",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    padding: 12,
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderColor: "#345995",
    borderWidth: 1,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButtonText: { color: "#345995" },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
});
