import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { InvitationRejection } from "./ParentInvitationAcceptanceService";

export type InvitationAcceptancePhase =
  | "confirmation"
  | "accepting"
  | "success"
  | "cancelled"
  | "retry"
  | InvitationRejection;

const REJECTION_MESSAGES: Record<InvitationRejection, string> = {
  invalid:
    "This invitation is invalid. Ask the inviting parent for a new link.",
  expired:
    "This invitation has expired. Ask the inviting parent for a new link.",
  revoked: "This invitation was revoked and can no longer be used.",
  consumed: "This invitation was already used and cannot be used again.",
  wrong_role: "This invitation cannot be used for parent access.",
  unauthorized: "This account is not eligible to accept this invitation.",
  already_member: "This account already belongs to a household.",
  parent_limit: "This household already has two active parents.",
};

type Props = {
  phase: InvitationAcceptancePhase;
  onAccept: () => void;
  onCancel: () => void;
  onContinue: () => void;
};

function Button({
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function ParentInvitationAcceptanceView({
  phase,
  onAccept,
  onCancel,
  onContinue,
}: Props) {
  const rejection =
    phase in REJECTION_MESSAGES ? (phase as InvitationRejection) : null;
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PARENT INVITATION</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {phase === "success" ? "Invitation accepted" : "Join this household"}
        </Text>
        {phase === "confirmation" ? (
          <Text style={styles.body}>
            Accept to join the inviting household as an active parent.
          </Text>
        ) : null}
        {phase === "accepting" ? (
          <View style={styles.progress}>
            <ActivityIndicator color="#345995" />
            <Text style={styles.body}>Accepting invitation…</Text>
          </View>
        ) : null}
        {phase === "success" ? (
          <Text style={styles.body}>
            You now have parent access to the household.
          </Text>
        ) : null}
        {phase === "cancelled" ? (
          <Text style={styles.body}>Invitation acceptance was cancelled.</Text>
        ) : null}
        {phase === "retry" ? (
          <Text accessibilityRole="alert" style={styles.error}>
            We couldn’t accept this invitation. Please try again.
          </Text>
        ) : null}
        {rejection ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {REJECTION_MESSAGES[rejection]}
          </Text>
        ) : null}
        {phase === "confirmation" || phase === "retry" ? (
          <>
            <Button label="Accept" onPress={onAccept} />
            <Button label="Cancel" onPress={onCancel} />
          </>
        ) : null}
        {phase === "accepting" ? (
          <Button disabled label="Accepting…" onPress={onAccept} />
        ) : null}
        {phase === "success" || phase === "cancelled" || rejection ? (
          <Button label="Continue" onPress={onContinue} />
        ) : null}
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
  card: { backgroundColor: "#ffffff", borderRadius: 20, gap: 14, padding: 24 },
  eyebrow: {
    color: "#345995",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: { color: "#152238", fontSize: 30, fontWeight: "700" },
  body: { color: "#4a5568", fontSize: 16, lineHeight: 23 },
  progress: { alignItems: "center", flexDirection: "row", gap: 10 },
  error: {
    backgroundColor: "#fff1f0",
    borderRadius: 8,
    color: "#8a1c1c",
    padding: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#345995",
    borderRadius: 10,
    padding: 14,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
