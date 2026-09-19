import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { InvitationQr } from "./HouseholdView";
import type { ChildInvitationPhase } from "./ChildInvitationFlow";

type Props = {
  childName: string;
  phase: ChildInvitationPhase;
  pending: "load" | "create" | "revoke" | null;
  url: string | null;
  expiresAt?: string;
  message?: string;
  copied: boolean;
  onBack: () => void;
  onRetry: () => void;
  onCreate: () => void;
  onRevoke: () => void;
  onCopy: () => void;
  onShare: () => void;
};

function Action({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
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

export function ChildInvitationView({
  childName,
  phase,
  pending,
  url,
  expiresAt,
  message,
  copied,
  onBack,
  onRetry,
  onCreate,
  onRevoke,
  onCopy,
  onShare,
}: Props) {
  const busy = pending !== null;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Invite {childName}
        </Text>
        <Text style={styles.body}>
          This invitation is for {childName}. It does not activate the child or
          set a PIN.
        </Text>
        <Action
          label="Back to child profiles"
          disabled={busy}
          onPress={onBack}
        />
        {phase === "loading" || pending === "load" ? (
          <View style={styles.inline}>
            <ActivityIndicator color="#345995" />
            <Text>Loading invitation…</Text>
          </View>
        ) : null}
        {phase === "success" && url ? (
          <View style={styles.result}>
            <InvitationQr url={url} />
            <Text selectable style={styles.url}>
              {url}
            </Text>
            <Text style={styles.body}>Expires {expiresAt}</Text>
            <Action label="Copy link" disabled={busy} onPress={onCopy} />
            <Action label="Share link" disabled={busy} onPress={onShare} />
            {copied ? (
              <Text accessibilityLiveRegion="polite">Link copied.</Text>
            ) : null}
          </View>
        ) : null}
        {phase === "activeUnavailable" ? (
          <Text style={styles.notice}>
            An active invitation exists for {childName}, but its link is
            unavailable on this device. Revoke it to create a new one.
          </Text>
        ) : null}
        {phase === "expired" ? (
          <Text style={styles.notice}>
            This invitation expired and is no longer shareable.
          </Text>
        ) : null}
        {phase === "revoked" ? (
          <Text style={styles.notice}>
            This invitation was revoked and is no longer shareable.
          </Text>
        ) : null}
        {phase === "consumed" ? (
          <Text style={styles.notice}>
            This invitation was used and cannot be reused.
          </Text>
        ) : null}
        {message ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
        ) : null}
        {phase === "error" ? (
          <Action label="Try again" disabled={busy} onPress={onRetry} />
        ) : null}
        {phase !== "loading" &&
        phase !== "success" &&
        phase !== "activeUnavailable" ? (
          <Action
            label={
              pending === "create"
                ? "Creating invitation…"
                : "Create invitation"
            }
            disabled={busy}
            onPress={onCreate}
          />
        ) : null}
        {phase === "success" || phase === "activeUnavailable" ? (
          <Action
            label={pending === "create" ? "Replacing…" : "Replace invitation"}
            disabled={busy}
            onPress={onCreate}
          />
        ) : null}
        {phase === "success" || phase === "activeUnavailable" ? (
          <Action
            label={pending === "revoke" ? "Revoking…" : "Revoke invitation"}
            disabled={busy}
            onPress={onRevoke}
          />
        ) : null}
        {phase !== "loading" ? (
          <Action label="Refresh status" disabled={busy} onPress={onRetry} />
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
  body: { color: "#4a5568", fontSize: 16, lineHeight: 23 },
  notice: { backgroundColor: "#fff8e6", color: "#765c13", padding: 12 },
  error: { backgroundColor: "#fff1f0", color: "#8a1c1c", padding: 12 },
  result: { alignItems: "center", gap: 12 },
  url: { color: "#152238", fontSize: 13, lineHeight: 18 },
  inline: { alignItems: "center", flexDirection: "row", gap: 8 },
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
