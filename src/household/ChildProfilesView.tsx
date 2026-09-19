import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ChildProfile } from "./types";

export type ChildProfilesViewState = {
  phase: "loading" | "ready" | "error";
  profiles: ChildProfile[];
  name: string;
  pending: "load" | "create" | "deactivate" | null;
  confirming: string | null;
  message?: string;
  success?: string;
};

type Props = {
  state: ChildProfilesViewState;
  onBack: () => void;
  onRetry: () => void;
  onChangeName: (name: string) => void;
  onCreate: () => void;
  onAskDeactivate: (id: string) => void;
  onCancelDeactivate: () => void;
  onConfirmDeactivate: () => void;
  onInvite: (id: string) => void;
};

function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function ChildProfilesView({
  state,
  onBack,
  onRetry,
  onChangeName,
  onCreate,
  onAskDeactivate,
  onCancelDeactivate,
  onConfirmDeactivate,
  onInvite,
}: Props) {
  const busy = state.pending !== null;
  const candidate = state.profiles.find(
    (profile) => profile.id === state.confirming,
  );
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Child profiles
        </Text>
        <Action label="Back to household" onPress={onBack} disabled={busy} />
        {state.phase === "loading" ? (
          <View style={styles.inline}>
            <ActivityIndicator color="#345995" />
            <Text>Loading child profiles…</Text>
          </View>
        ) : null}
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
        {state.phase === "error" ? (
          <Action
            label={busy ? "Trying again…" : "Try again"}
            onPress={onRetry}
            disabled={busy}
          />
        ) : null}
        {state.phase === "ready" ? (
          <>
            {state.profiles.length === 0 ? (
              <Text style={styles.body}>
                No child profiles yet. Add a child below.
              </Text>
            ) : (
              state.profiles.map((profile) => (
                <View key={profile.id} style={styles.row}>
                  <Text style={styles.name}>{profile.displayName}</Text>
                  <Text style={styles.body}>
                    {profile.active ? "Active" : "Deactivated"}
                  </Text>
                  {!profile.active || profile.activationComplete ? (
                    <Text style={styles.body}>
                      Child invitations unavailable for this profile.
                    </Text>
                  ) : (
                    <Action
                      label={`Invite ${profile.displayName}`}
                      onPress={() => onInvite(profile.id)}
                      disabled={busy || state.confirming !== null}
                    />
                  )}
                  {profile.active ? (
                    <Action
                      label={`Deactivate ${profile.displayName}`}
                      onPress={() => onAskDeactivate(profile.id)}
                      disabled={busy || state.confirming !== null}
                    />
                  ) : null}
                </View>
              ))
            )}
            {candidate?.active ? (
              <View style={styles.confirmation}>
                <Text style={styles.body}>
                  Deactivate {candidate.displayName}?
                </Text>
                <Action
                  label={
                    state.pending === "deactivate"
                      ? "Deactivating…"
                      : `Confirm deactivate ${candidate.displayName}`
                  }
                  onPress={onConfirmDeactivate}
                  disabled={busy}
                />
                <Action
                  label="Cancel"
                  onPress={onCancelDeactivate}
                  disabled={busy}
                />
              </View>
            ) : null}
            <Text style={styles.label}>Child display name</Text>
            <TextInput
              accessibilityLabel="Child display name"
              editable={!busy && state.confirming === null}
              onChangeText={onChangeName}
              placeholder="Child name"
              style={styles.input}
              value={state.name}
            />
            <Action
              label={state.pending === "create" ? "Adding child…" : "Add child"}
              onPress={onCreate}
              disabled={busy || state.confirming !== null}
            />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#f4f1ea",
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: { backgroundColor: "#fff", borderRadius: 20, gap: 12, padding: 24 },
  title: { color: "#152238", fontSize: 28, fontWeight: "700" },
  body: { color: "#4a5568", fontSize: 16 },
  name: { color: "#152238", fontSize: 18, fontWeight: "700" },
  label: { color: "#344054", fontSize: 14, fontWeight: "600" },
  row: { borderTopColor: "#d8dee8", borderTopWidth: 1, gap: 8, paddingTop: 16 },
  confirmation: {
    backgroundColor: "#fff8e6",
    borderRadius: 10,
    gap: 8,
    padding: 12,
  },
  inline: { alignItems: "center", flexDirection: "row", gap: 8 },
  error: { backgroundColor: "#fff1f0", color: "#8a1c1c", padding: 12 },
  success: { backgroundColor: "#edf8f0", color: "#246b35", padding: 12 },
  input: {
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    padding: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#345995",
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
    padding: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
});
