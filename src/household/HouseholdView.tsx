import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { encodeQr } from "./qrCode";

export type HouseholdViewState = {
  phase: "loading" | "loadError" | "setup" | "settings";
  accountLabel: string;
  timeZone: string;
  persistedTimeZone?: string;
  fallbackMessage?: string;
  message?: string;
  success?: string;
  invitationPhase?:
    | "idle"
    | "loading"
    | "success"
    | "error"
    | "activeUnavailable"
    | "expired"
    | "revoked"
    | "consumed";
  invitationUrl?: string;
  invitationExpiresAt?: string;
  invitationMessage?: string;
  action:
    | "create"
    | "save"
    | "reload"
    | "signout"
    | "createInvite"
    | "revokeInvite"
    | null;
};

type HouseholdViewProps = {
  state: HouseholdViewState;
  onChangeTimeZone: (value: string) => void;
  onCreate: () => void;
  onReload: () => void;
  onSave: () => void;
  onSignOut: () => void;
  onCreateInvitation: () => void;
  onRevokeInvitation: () => void;
  onManageChildren: () => void;
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

function InvitationQr({ url }: { url: string }) {
  const matrix = encodeQr(url);
  return (
    <View
      accessibilityLabel={`QR code containing ${url}`}
      accessibilityRole="image"
      style={styles.qrQuietZone}
    >
      {matrix.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.qrRow}>
          {row.map((dark, columnIndex) => (
            <View
              key={columnIndex}
              style={[styles.qrCell, dark && styles.qrDarkCell]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function HouseholdView({
  state,
  onChangeTimeZone,
  onCreate,
  onReload,
  onSave,
  onSignOut,
  onCreateInvitation,
  onRevokeInvitation,
  onManageChildren,
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
    <ScrollView
      contentContainerStyle={styles.scrollScreen}
      keyboardShouldPersistTaps="handled"
    >
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
        {!setup ? (
          <View style={styles.invitationSection}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Children
            </Text>
            <Button
              disabled={busy}
              label="Manage child profiles"
              loading={false}
              loadingLabel=""
              onPress={onManageChildren}
            />
          </View>
        ) : null}
        {!setup ? (
          <View style={styles.invitationSection}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Invite another parent
            </Text>
            {state.invitationPhase === "loading" ? (
              <View style={styles.inlineStatus}>
                <ActivityIndicator color="#345995" />
                <Text style={styles.body}>Loading invitation…</Text>
              </View>
            ) : null}
            {state.invitationPhase === "success" && state.invitationUrl ? (
              <View style={styles.invitationResult}>
                <InvitationQr url={state.invitationUrl} />
                <Text selectable style={styles.invitationUrl}>
                  {state.invitationUrl}
                </Text>
                <Text style={styles.body}>
                  Expires {state.invitationExpiresAt}
                </Text>
                <Button
                  disabled={busy}
                  label="Revoke invitation"
                  loading={state.action === "revokeInvite"}
                  loadingLabel="Revoking…"
                  onPress={onRevokeInvitation}
                  secondary
                />
              </View>
            ) : null}
            {state.invitationPhase === "activeUnavailable" ? (
              <View>
                <Text style={styles.notice}>
                  An active invitation already exists. Its secure link is not
                  stored on the server. Revoke it before creating a new one.
                </Text>
                <Button
                  disabled={busy}
                  label="Revoke invitation"
                  loading={state.action === "revokeInvite"}
                  loadingLabel="Revoking…"
                  onPress={onRevokeInvitation}
                  secondary
                />
              </View>
            ) : null}
            {state.invitationPhase === "expired" ? (
              <Text style={styles.notice}>
                This invitation expired and is no longer shareable.
              </Text>
            ) : null}
            {state.invitationPhase === "revoked" ? (
              <Text style={styles.notice}>
                This invitation was revoked and is no longer active.
              </Text>
            ) : null}
            {state.invitationPhase === "consumed" ? (
              <Text style={styles.notice}>
                This invitation was already used and cannot be reused.
              </Text>
            ) : null}
            {state.invitationMessage ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {state.invitationMessage}
              </Text>
            ) : null}
            {state.invitationPhase !== "loading" &&
            state.invitationPhase !== "success" &&
            state.invitationPhase !== "activeUnavailable" ? (
              <Button
                disabled={busy}
                label="Create parent invitation"
                loading={state.action === "createInvite"}
                loadingLabel="Creating invitation…"
                onPress={onCreateInvitation}
              />
            ) : null}
          </View>
        ) : null}
        <Button
          disabled={busy}
          label="Sign out"
          loading={state.action === "signout"}
          loadingLabel="Signing out…"
          onPress={onSignOut}
          secondary
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f1ea",
    justifyContent: "center",
    padding: 24,
  },
  scrollScreen: {
    backgroundColor: "#f4f1ea",
    flexGrow: 1,
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
  sectionTitle: { color: "#152238", fontSize: 20, fontWeight: "700" },
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
  invitationSection: {
    borderTopColor: "#d8dee8",
    borderTopWidth: 1,
    gap: 12,
    marginTop: 8,
    paddingTop: 20,
  },
  invitationResult: { alignItems: "center", gap: 12 },
  inlineStatus: { alignItems: "center", flexDirection: "row", gap: 8 },
  invitationUrl: { color: "#152238", fontSize: 13, lineHeight: 18 },
  qrQuietZone: {
    aspectRatio: 1,
    backgroundColor: "#fff",
    padding: 12,
    width: 220,
  },
  qrRow: { flex: 1, flexDirection: "row" },
  qrCell: { backgroundColor: "#fff", flex: 1 },
  qrDarkCell: { backgroundColor: "#000" },
});
